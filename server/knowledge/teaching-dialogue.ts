import { sql } from "drizzle-orm";
import { knowledgeSections, knowledgeChangelog } from "../../drizzle/schema";
import { getDb } from "../db/connection";
import { assertRuntimeSchema } from "../db/schema-readiness";
import {
  readTeachingSource,
  type TeachingSource,
} from "./whatsapp-teaching-source";
import { verifyTeachingHistory } from "./teaching-source-history";
import {
  withKnowledgeTransaction,
  type KnowledgeTransaction,
} from "./transaction";
import { marker, reason, usage, TeachingLimitError } from "./whatsapp-teaching";
import {
  teachingDialogueHash,
  validateTeachingDialogue,
  type TeachingDialogueInput,
  type TeachingDialogueDecision,
} from "../ai/teaching-dialogue-understanding";
type Executor = Pick<KnowledgeTransaction, "execute">;
const decode = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);
async function database() {
  const db = await getDb();
  if (!db) throw Error("Teaching dialogue unavailable");
  return db;
}
export async function assertTeachingDialogueSchema() {
  await assertRuntimeSchema("Teaching dialogue", [
    { table: "merchant_teaching_drafts" },
    { table: "merchant_teaching_turns" },
  ]);
}
export type TeachingTurnResult = {
  handled: boolean;
  response?: string;
  sectionId?: number;
  replayed?: boolean;
};
export type TeachingDialogueContext = {
  source: TeachingSource;
  row: any;
  fragments: TeachingSource[];
  input: TeachingDialogueInput;
};
export async function findTeachingTurn(
  source: TeachingSource,
  executor?: Executor
): Promise<TeachingTurnResult | null> {
  await assertTeachingDialogueSchema();
  const tx = executor || (await database());
  const [rows] = await tx.execute(
    sql`SELECT source_digest,result_json FROM merchant_teaching_turns WHERE merchant_id=${source.merchantId} AND event_key=${source.eventKey}`
  );
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) return null;
  if (row.source_digest !== source.digest)
    throw Error("Teaching turn source changed");
  const saved = decode(row.result_json) as TeachingTurnResult;
  return {
    ...saved,
    replayed: true,
    ...(saved.handled
      ? {
          response:
            "هذه الرسالة مسجلة بالفعل. لم أعد إنشاء المسودة أو نشر معرفة، واحتفظت بالمراجعة الحالية.",
        }
      : {}),
  };
}
export async function readTeachingDialogue(
  source: TeachingSource,
  executor?: Executor
): Promise<TeachingDialogueContext> {
  await assertTeachingDialogueSchema();
  const tx = executor || (await database());
  const [rows] =
    await tx.execute(sql`SELECT *,updated_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 24 HOUR) AS recent
    FROM merchant_teaching_drafts WHERE merchant_id=${source.merchantId} AND instance_id=${source.instanceId} AND author_phone=${source.authorPhone}`);
  const row = (Array.isArray(rows) ? rows[0] : null) || null,
    active = row?.status === "draft" && !!Number(row.recent);
  let fragments: TeachingSource[] = active ? decode(row.fragments_json) : [],
    unavailable = !!row && row.status === "draft" && !active;
  try {
    if (
      !Array.isArray(fragments) ||
      fragments.length > 8 ||
      fragments.reduce((n, f) => n + f.text.length, 0) > 12000
    )
      throw Error("Invalid teaching history");
    for (const fragment of fragments) {
      if (
        fragment.merchantId !== source.merchantId ||
        fragment.instanceId !== source.instanceId ||
        fragment.authorPhone !== source.authorPhone ||
        fragment.text.length > 2000
      )
        throw Error("Teaching history scope changed");
      await verifyTeachingHistory(fragment, tx, !!executor);
    }
  } catch {
    fragments = [];
    unavailable = true;
  }
  const basisHash = teachingDialogueHash({
    source: source.digest,
    draft: row
      ? {
          id: row.id,
          version: row.version,
          status: row.status,
          lastInboundId: row.last_inbound_id,
          recent: Number(row.recent),
          history: row.fragments_json,
          unavailable,
        }
      : null,
  });
  return {
    source,
    row,
    fragments,
    input: {
      basisHash,
      message: source.text,
      draftUnavailable: unavailable,
      draft:
        active && !unavailable
          ? {
              version: row.version,
              fragments: fragments.map(f => ({
                inboundId: f.inboundId,
                text: f.text,
              })),
            }
          : null,
    },
  };
}
export async function commitTeachingDialogue(
  context: TeachingDialogueContext,
  decision: TeachingDialogueDecision
): Promise<TeachingTurnResult> {
  const d = validateTeachingDialogue(JSON.stringify(decision), context.input);
  const write = async (tx: KnowledgeTransaction) => {
    const source = await readTeachingSource(
      context.source.merchantId,
      context.source.text,
      tx,
      true
    );
    if (source.digest !== context.source.digest)
      throw Error("Teaching source changed");
    const prior = await findTeachingTurn(source, tx);
    if (prior) return prior;
    const fresh = await readTeachingDialogue(source, tx);
    if (fresh.input.basisHash !== context.input.basisHash)
      throw Error("Teaching draft changed");
    validateTeachingDialogue(JSON.stringify(d), fresh.input);
    const changing = !["not_teaching", "clarify"].includes(d.intent);
    let result: TeachingTurnResult = { handled: d.intent !== "not_teaching" };
    if (d.intent === "clarify")
      result.response =
        "لم أغيّر المسودة. وضّح المعلومة أو التصحيح وشروطه، وهل تريد جمع أجزاء إضافية أم إرسال سياسة مكتملة للمراجعة.";
    if (changing) {
      if (fresh.row && fresh.row.last_inbound_id >= source.inboundId)
        throw Error("Older teaching message cannot replace current draft");
      const [counts] =
        await tx.execute(sql`SELECT COUNT(*) AS used FROM merchant_teaching_turns WHERE merchant_id=${source.merchantId} AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR)
        AND JSON_UNQUOTE(JSON_EXTRACT(decision_json,'$.intent')) IN ('start','append','replace','submit','cancel')`);
      if (!Array.isArray(counts)) throw Error("Teaching quota unavailable");
      if (Number(counts[0]?.used) >= 100)
        throw Error("Teaching draft daily limit");
      const fragments =
        d.intent === "cancel"
          ? []
          : [
              ...(d.intent === "replace" || d.intent === "start"
                ? []
                : fresh.fragments),
              ...(d.includeCurrent ? [source] : []),
            ];
      const status =
        d.intent === "submit"
          ? "submitted"
          : d.intent === "cancel"
            ? "cancelled"
            : "draft";
      if (d.intent === "submit") {
        if ((await usage(tx, source.merchantId)) >= 10)
          throw new TeachingLimitError("Teaching quota reached");
        const content =
          fragments.length === 1
            ? `المعلومة: ${fragments[0].text.trim()}`
            : fragments
                .map(
                  (f, i) => `الجزء ${i + 1} من تعليم التاجر:\n${f.text.trim()}`
                )
                .join("\n\n");
        const [saved] = await tx.insert(knowledgeSections).values({
          merchantId: source.merchantId,
          title: d.title,
          content,
          source: "manual",
          sectionType: "policies",
          sourceUrl: `whatsapp-dialogue://${source.eventKey}`,
          status: "pending_review",
          useInBot: 0,
          injectAs: "fact",
          merchantEdited: 1,
          provenance: {
            origin: "contextual_whatsapp_dialogue",
            version: 2,
            eventKey: source.eventKey,
            inboundId: source.inboundId,
            instanceId: source.instanceId,
            sourceDigest: source.digest,
            analysis: d,
            sourceIds: fragments.map(f => f.inboundId),
            approval: "requires_conflict_review",
          },
        });
        result.sectionId = Number(saved.insertId);
        await tx.insert(knowledgeChangelog).values({
          merchantId: source.merchantId,
          sectionId: result.sectionId,
          action: "conflict",
          source: marker(source),
          reason: reason(source),
          newContent: content,
          oldContent: null,
        });
        result.response =
          "تم حفظ المعلومة كاملة للمراجعة مع شروطها واستثناءاتها. لم أفعّلها في ردود العملاء؛ راجعها واعتمدها من صفحة تعارضات المعرفة.";
      } else
        result.response =
          d.intent === "cancel"
            ? "ألغيت مسودة التعليم؛ لم أغيّر السياسات المعتمدة."
            : `حفظت ${fragments.length} جزءًا في مسودة التعليم دون تفعيلها. أرسل الشروط والتصحيحات المتبقية، ثم اطلب إرسال السياسة المكتملة للمراجعة.`;
      await tx.execute(sql`INSERT INTO merchant_teaching_drafts (merchant_id,instance_id,author_phone,version,status,fragments_json,last_inbound_id)
        VALUES (${source.merchantId},${source.instanceId},${source.authorPhone},${(fresh.row?.version || 0) + 1},${status},${JSON.stringify(fragments)},${source.inboundId})
        ON DUPLICATE KEY UPDATE version=VALUES(version),status=VALUES(status),fragments_json=VALUES(fragments_json),last_inbound_id=VALUES(last_inbound_id),updated_at=CURRENT_TIMESTAMP(3)`);
    }
    await tx.execute(sql`INSERT INTO merchant_teaching_turns (merchant_id,event_key,source_digest,source_json,context_json,decision_json,result_json)
      VALUES (${source.merchantId},${source.eventKey},${source.digest},${JSON.stringify(source)},${JSON.stringify({ input: fresh.input, fragments: fresh.fragments })},${JSON.stringify(d)},${JSON.stringify(result)})`);
    return result;
  };
  if (!["not_teaching", "clarify"].includes(d.intent))
    return withKnowledgeTransaction(context.source.merchantId, write);
  return (await database()).transaction(async tx => {
    await tx.execute(
      sql`SELECT id FROM merchants WHERE id=${context.source.merchantId} FOR UPDATE`
    );
    return write(tx);
  });
}

/** Used by the reviewed knowledge workspace. The next phase supplies conflict analysis;
 * until then, a dialogue proposal cannot be approved as an unlinked generic section. */
export function isTeachingDialogueProposal(
  provenance: Record<string, unknown>
) {
  return provenance.origin === "contextual_whatsapp_dialogue";
}
