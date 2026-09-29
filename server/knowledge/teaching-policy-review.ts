import { sql, and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { knowledgeSections, sariActivityLog } from "../../drizzle/schema";
import { getDb } from "../db/connection";
import {
  withKnowledgeTransaction,
  type KnowledgeTransaction,
} from "./transaction";
import { verifyTeachingHistory } from "./teaching-source-history";
import type { TeachingSource } from "./whatsapp-teaching-source";
import { validateTeachingDialogue } from "../ai/teaching-dialogue-understanding";
import {
  policyHash,
  validateTeachingPolicy,
  understandTeachingPolicy,
  type PolicyCandidate,
  type TeachingPolicyInput,
} from "../ai/teaching-policy-understanding";
const decode = (v: any): any => (typeof v === "string" ? JSON.parse(v) : v);
type Proposal = Pick<
  typeof knowledgeSections.$inferSelect,
  | "id"
  | "merchantId"
  | "title"
  | "content"
  | "provenance"
  | "status"
  | "sourceUrl"
  | "parentId"
>;
export async function verifyTeachingProposal(
  tx: KnowledgeTransaction,
  merchantId: number,
  proposed: Proposal,
  lock = false
) {
  const p = decode(proposed.provenance);
  const [raw] = await tx.execute(
    sql`SELECT * FROM merchant_teaching_turns WHERE merchant_id=${merchantId} AND event_key=${p?.eventKey} ${lock ? sql`FOR UPDATE` : sql``}`
  );
  const turn = Array.isArray(raw) ? (raw[0] as any) : null;
  if (
    !turn ||
    proposed.merchantId !== merchantId ||
    p?.origin !== "contextual_whatsapp_dialogue" ||
    p.version !== 2 ||
    proposed.sourceUrl !== `whatsapp-dialogue://${p.eventKey}`
  )
    throw Error("Teaching proof unavailable");
  const source = decode(turn.source_json) as TeachingSource,
    context = decode(turn.context_json),
    result = decode(turn.result_json),
    d = validateTeachingDialogue(
      JSON.stringify(decode(turn.decision_json)),
      context.input
    );
  if (
    d.intent !== "submit" ||
    result.sectionId !== proposed.id ||
    source.merchantId !== merchantId ||
    source.digest !== turn.source_digest ||
    source.digest !== p.sourceDigest ||
    source.eventKey !== p.eventKey ||
    source.inboundId !== p.inboundId ||
    source.instanceId !== p.instanceId ||
    context.input.message !== source.text ||
    proposed.title !== d.title
  )
    throw Error("Teaching proof changed");
  const fragments: TeachingSource[] = [
    ...context.fragments,
    ...(d.includeCurrent ? [source] : []),
  ];
  if (
    !fragments.length ||
    fragments.length > 8 ||
    fragments.reduce((n, f) => n + f.text.length, 0) > 12000 ||
    policyHash(
      context.fragments.map((f: TeachingSource) => ({
        inboundId: f.inboundId,
        text: f.text,
      }))
    ) !== policyHash(context.input.draft?.fragments || [])
  )
    throw Error("Teaching fragments changed");
  for (const f of [...fragments, source]) {
    if (
      f.merchantId !== merchantId ||
      f.instanceId !== source.instanceId ||
      f.authorPhone !== source.authorPhone ||
      (f.text.length > 2000 && f !== source)
    )
      throw Error("Teaching proof scope changed");
    await verifyTeachingHistory(f, tx, lock);
  }
  const content =
    fragments.length === 1
      ? `المعلومة: ${fragments[0].text.trim()}`
      : fragments
          .map((f, i) => `الجزء ${i + 1} من تعليم التاجر:\n${f.text.trim()}`)
          .join("\n\n");
  if (
    proposed.content !== content ||
    policyHash(p.sourceIds) !== policyHash(fragments.map(f => f.inboundId))
  )
    throw Error("Teaching text changed");
  return { source, fragments, d };
}
async function rows(
  tx: KnowledgeTransaction,
  statement: ReturnType<typeof sql>
) {
  const [result] = await tx.execute(statement);
  if (!Array.isArray(result)) throw Error("Policy context unavailable");
  return result as any[];
}
export async function teachingPolicyContext(
  tx: KnowledgeTransaction,
  merchantId: number,
  proposed: Proposal,
  lock = false
) {
  await verifyTeachingProposal(tx, merchantId, proposed, lock);
  const end = lock ? sql`FOR UPDATE` : sql``;
  const sections = await rows(
    tx,
    sql`SELECT id,title,content,summary,parent_id,section_type,inject_as,status,use_in_bot,valid_until,source,source_url FROM knowledge_sections WHERE merchant_id=${merchantId} AND id<>${proposed.id} AND use_in_bot=1 AND status IN ('approved','auto_approved') AND inject_as IN ('fact','behavior') AND section_type<>'opportunities' AND (valid_until IS NULL OR valid_until>UTC_TIMESTAMP(3)) ORDER BY id LIMIT 201 ${end}`
  );
  const faqs = await rows(
    tx,
    sql`SELECT id,question,answer FROM extracted_faqs WHERE merchant_id=${merchantId} AND is_active=1 AND use_in_bot=1 AND source_status='active' ORDER BY id LIMIT 201 ${end}`
  );
  const pages = await rows(
    tx,
    sql`SELECT id,title,content,page_type,url FROM discovered_pages WHERE merchant_id=${merchantId} AND is_active=1 AND use_in_bot=1 AND content IS NOT NULL AND page_type IN ('shipping','returns','faq','about') ORDER BY id LIMIT 201 ${end}`
  );
  const answers = await rows(
    tx,
    sql`SELECT field_key,answer_text,answer_digest,verified_event_key FROM merchant_onboarding_answers WHERE merchant_id=${merchantId} AND verified_event_key IS NOT NULL ORDER BY field_key LIMIT 201 ${end}`
  );
  const candidates: PolicyCandidate[] = [
    ...sections.map(r => ({
      key: `section:${r.id}`,
      title: r.title,
      content: r.content + (r.summary ? "\n" + r.summary : ""),
      replaceable:
        proposed.parentId !== r.id &&
        !sections.some(child => child.parent_id === r.id),
    })),
    ...faqs.map(r => ({
      key: `faq:${r.id}`,
      title: r.question,
      content: r.answer,
      replaceable: false,
    })),
    ...pages.map(r => ({
      key: `page:${r.id}`,
      title: r.title || r.page_type,
      content: r.content,
      replaceable: false,
    })),
    ...answers.map(r => ({
      key: `onboarding:${r.field_key}`,
      title: r.field_key,
      content: r.answer_text,
      replaceable: false,
    })),
  ];
  if (
    candidates.length > 200 ||
    candidates.reduce((n, c) => n + c.content.length + c.title.length, 0) >
      90000
  )
    throw Error("Complete policy context exceeds bounds");
  const {
    conflictReview: _analysis,
    reviewDecision: _decision,
    ...origin
  } = decode(proposed.provenance);
  const basisHash = policyHash({
    proposal: {
      id: proposed.id,
      title: proposed.title,
      content: proposed.content,
      sourceUrl: proposed.sourceUrl,
      parentId: proposed.parentId,
      origin,
    },
    sections,
    faqs,
    pages,
    answers,
  });
  const input: TeachingPolicyInput = {
    basisHash,
    proposal: { title: proposed.title, content: proposed.content },
    candidates,
  };
  return { input, sections };
}
export async function readTeachingPolicyReview(
  tx: KnowledgeTransaction,
  merchantId: number,
  proposed: Proposal,
  lock = false
) {
  try {
    const context = await teachingPolicyContext(tx, merchantId, proposed, lock);
    let analysis = null;
    try {
      const saved = decode(proposed.provenance)?.conflictReview;
      if (saved)
        analysis = validateTeachingPolicy(
          JSON.stringify(saved.analysis),
          context.input
        );
    } catch {}
    const canApprove =
      !!analysis &&
      analysis.coherent &&
      analysis.businessKnowledge &&
      analysis.confidence >= 0.9 &&
      analysis.comparisons.every(c => c.relation !== "review");
    const replaceIds = canApprove
      ? analysis!.comparisons
          .filter(c => c.relation === "replace")
          .map(c => Number(c.key.split(":")[1]))
      : [];
    return {
      available: true,
      basisHash: context.input.basisHash,
      canApprove,
      replaceIds,
      reason: analysis?.reason || null,
      analyzed: !!analysis,
      candidates: context.input.candidates.map(c => ({
        ...c,
        relation:
          analysis?.comparisons.find(a => a.key === c.key)?.relation || null,
        reason:
          analysis?.comparisons.find(a => a.key === c.key)?.reason || null,
      })),
    };
  } catch {
    return {
      available: false,
      basisHash: null,
      canApprove: false,
      replaceIds: [] as number[],
      reason: null,
      analyzed: false,
      candidates: [],
    };
  }
}
export async function analyzeTeachingPolicy(
  merchantId: number,
  sectionId: number,
  expectedBasisHash: string
) {
  const db = await getDb();
  if (!db) throw Error("Policy database unavailable");
  const read = async (tx: KnowledgeTransaction, lock = false) => {
    const query = tx
      .select()
      .from(knowledgeSections)
      .where(
        and(
          eq(knowledgeSections.merchantId, merchantId),
          eq(knowledgeSections.id, sectionId)
        )
      );
    const proposed = (await (lock ? query.for("update") : query))[0];
    if (!proposed || proposed.status !== "pending_review")
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Pending teaching proposal unavailable",
      });
    return {
      proposed,
      ...(await teachingPolicyContext(tx, merchantId, proposed, lock)),
    };
  };
  const context = await db.transaction(tx => read(tx), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
  if (context.input.basisHash !== expectedBasisHash)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Reviewed policy changed",
    });
  const analysis = await understandTeachingPolicy(merchantId, context.input);
  return withKnowledgeTransaction(merchantId, async tx => {
    const fresh = await read(tx, true);
    if (fresh.input.basisHash !== context.input.basisHash)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Policy changed during analysis",
      });
    validateTeachingPolicy(JSON.stringify(analysis), fresh.input);
    await tx
      .update(knowledgeSections)
      .set({
        provenance: {
          ...decode(fresh.proposed.provenance),
          conflictReview: { analysis, analyzedAt: new Date().toISOString() },
        },
      })
      .where(
        and(
          eq(knowledgeSections.id, sectionId),
          eq(knowledgeSections.merchantId, merchantId)
        )
      );
    await tx.insert(sariActivityLog).values({
      merchantId,
      actionType: "teaching_policy_compared",
      description: "مقارنة سياسة تعليم مع المعرفة الحالية دون تفعيلها",
      details: JSON.stringify({
        sectionId,
        basisHash: analysis.basisHash,
        comparisons: analysis.comparisons.length,
      }),
    });
    return { saved: true };
  });
}
