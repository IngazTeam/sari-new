import { and, eq, sql } from "drizzle-orm";
import { knowledgeChangelog, knowledgeSections } from "../../drizzle/schema";
import {
  withKnowledgeTransaction,
  type KnowledgeTransaction,
} from "./transaction";
import {
  readTeachingSource,
  type TeachingSource,
} from "./whatsapp-teaching-source";
import {
  validateTeachingDecision,
  type TeachingDecision,
} from "../ai/merchant-teaching-understanding";

export type TeachingReceipt = {
  sectionId: number | null;
  approved: boolean;
  replayed: boolean;
  usedToday: number;
};
export class TeachingLimitError extends Error {}
const marker = (source: TeachingSource) =>
  `wa_teach:${source.eventKey.slice(0, 40)}`;
const reason = (source: TeachingSource) =>
  `تعليم عام صريح عبر واتساب؛ مصدر ${source.eventKey}؛ بصمة ${source.digest}`;
const sourceUrl = (source: TeachingSource) =>
  `whatsapp-teaching://${source.eventKey}`;

async function receipt(
  tx: KnowledgeTransaction,
  source: TeachingSource
): Promise<TeachingReceipt | null> {
  const [audit] = await tx
    .select()
    .from(knowledgeChangelog)
    .where(
      and(
        eq(knowledgeChangelog.merchantId, source.merchantId),
        eq(knowledgeChangelog.source, marker(source))
      )
    );
  if (!audit) return null;
  if (audit.reason !== reason(source))
    throw Error("Teaching event changed after acceptance");
  const [section] = await tx
    .select()
    .from(knowledgeSections)
    .where(
      and(
        eq(knowledgeSections.merchantId, source.merchantId),
        eq(knowledgeSections.sourceUrl, sourceUrl(source))
      )
    );
  // The audit survives deletion/review. Replaying an event must never recreate or republish it.
  return {
    sectionId: section?.id ?? null,
    approved: section?.status === "approved" && !!section.useInBot,
    replayed: true,
    usedToday: await usage(tx, source.merchantId),
  };
}
async function usage(
  tx: KnowledgeTransaction,
  merchantId: number
): Promise<number> {
  const [rows] =
    await tx.execute(sql`SELECT COUNT(*) AS used FROM knowledge_changelog
    WHERE merchant_id=${merchantId} AND LEFT(source,9)='wa_teach:' AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR)`);
  return Number((rows as unknown as any[])[0]?.used || 0);
}

/** Read-only retry check, using the same authority lock as the write. */
export async function findTeachingReceipt(
  source: TeachingSource
): Promise<TeachingReceipt | null> {
  // Use a plain transaction: inspecting a non-teaching merchant message must not evict knowledge caches.
  const { getDb } = await import("../db/connection");
  const db = await getDb();
  if (!db) throw Error("Teaching storage unavailable");
  return db.transaction(async tx => {
    const fresh = await readTeachingSource(
      source.merchantId,
      source.text,
      tx,
      true
    );
    if (fresh.digest !== source.digest) throw Error("Teaching source changed");
    return receipt(tx, source);
  });
}

export async function saveContextualMerchantTeaching(
  source: TeachingSource,
  decision: TeachingDecision
): Promise<TeachingReceipt> {
  const verified = validateTeachingDecision(
    JSON.stringify(decision),
    source.text
  );
  if (verified.intent !== "teach" || source.text.trim().length > 2000)
    throw Error("Teaching requires complete supported content");
  return withKnowledgeTransaction(source.merchantId, async tx => {
    const fresh = await readTeachingSource(
      source.merchantId,
      source.text,
      tx,
      true
    );
    if (fresh.digest !== source.digest) throw Error("Teaching source changed");
    const replay = await receipt(tx, source);
    if (replay) return replay;
    const usedToday = await usage(tx, source.merchantId);
    if (usedToday >= 10) throw new TeachingLimitError("Teaching quota reached");
    const content = `المعلومة: ${source.text.trim()}`;
    const [saved] = await tx
      .insert(knowledgeSections)
      .values({
        merchantId: source.merchantId,
        title: verified.title,
        content,
        source: "manual",
        sectionType: "faq",
        sourceUrl: sourceUrl(source),
        status: "approved",
        useInBot: 1,
        injectAs: "fact",
        merchantEdited: 1,
        provenance: {
          origin: "contextual_whatsapp_teaching",
          version: 1,
          inboundId: source.inboundId,
          instanceId: source.instanceId,
          sourceDigest: source.digest,
          analysis: verified,
          approval: "explicit_general_merchant_teaching",
          recordedAt: new Date().toISOString(),
        },
      });
    const sectionId = Number(saved.insertId);
    await tx
      .insert(knowledgeChangelog)
      .values({
        merchantId: source.merchantId,
        sectionId,
        action: "add",
        source: marker(source),
        reason: reason(source),
        oldContent: null,
        newContent: content,
      });
    return {
      sectionId,
      approved: true,
      replayed: false,
      usedToday: usedToday + 1,
    };
  });
}
