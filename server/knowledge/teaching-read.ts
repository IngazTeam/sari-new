import { sql } from "drizzle-orm";
import { getDb } from "../db/connection";
import type { KnowledgeSection } from "../db/knowledge";
import type { KnowledgeTransaction } from "./transaction";
import type { TeachingSource } from "./whatsapp-teaching-source";
import { parseTeachingProposal } from "./teaching-proposal";
import {
  teachingHistoryPhone,
  validateTeachingHistory,
} from "./teaching-source-history";
import { validateTeachingDecision } from "../ai/merchant-teaching-understanding";
import { marker, reason } from "./whatsapp-teaching";
import {
  isSourcedTeaching,
  manualTeachingReviewHash,
} from "./teaching-manual-review";
const decode = (v: any): any => (typeof v === "string" ? JSON.parse(v) : v);
const positive = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) > 0;
type Plan = {
  row: any;
  metadata: any;
  sources?: TeachingSource[];
  manual?: true;
  legacy?: true;
};

async function rows(
  tx: KnowledgeTransaction,
  query: ReturnType<typeof sql>
): Promise<any[]> {
  const [result] = await tx.execute(query);
  if (!Array.isArray(result)) throw Error("Teaching retrieval unavailable");
  return result;
}
async function batched<T>(
  values: T[],
  read: (batch: T[]) => Promise<any[]>
): Promise<any[]> {
  const result: any[] = [];
  for (let at = 0; at < values.length; at += 250)
    result.push(...(await read(values.slice(at, at + 250))));
  return result;
}

/** One read-only snapshot binds text, review and original messages. No per-row
 * network calls, no cached proof, and no synthesis of missing historical data. */
export async function readVerifiedBotSections(
  merchantId: number,
  embeddings = false
): Promise<KnowledgeSection[]> {
  if (!positive(merchantId)) throw Error("Invalid knowledge merchant");
  const db = await getDb();
  if (!db) return [];
  return db.transaction(
    tx => readVerifiedBotSectionsInTransaction(tx, merchantId, embeddings),
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}

/** Also used by the merchant workspace, inside the same snapshot as its metadata.
 * A source disappearing must have the same effect on coverage and retrieval. */
export async function readVerifiedBotSectionsInTransaction(
  tx: KnowledgeTransaction,
  merchantId: number,
  embeddings = false,
  sectionIds?: number[],
  lock = false
): Promise<KnowledgeSection[]> {
  if (!positive(merchantId) || sectionIds?.some(id => !positive(id)))
    throw Error("Invalid knowledge scope");
  if (sectionIds?.length === 0) return [];
  const end = lock ? sql`FOR SHARE` : sql``;
  const all = await rows(
    tx,
    sql`SELECT id,merchant_id,parent_id,section_type,title,content,summary,source,source_url,
      confidence,status,use_in_bot,inject_as,sort_order,merchant_edited,valid_until,provenance,created_at,updated_at
      ${embeddings ? sql`,embedding,embedding_content_hash` : sql``}
      FROM knowledge_sections WHERE merchant_id=${merchantId} AND use_in_bot=1
        AND status IN ('auto_approved','approved') AND inject_as<>'none'
        AND (valid_until IS NULL OR valid_until>UTC_TIMESTAMP(3))
        ${
          sectionIds
            ? sql`AND id IN (${sql.join(
                sectionIds.map(id => sql`${id}`),
                sql`,`
              )})`
            : sql``
        }
        ORDER BY inject_as,sort_order ${end}`
  );
  const accepted = new Set<number>(),
    teaching: Array<{ row: any; metadata: any }> = [];
  for (const row of all) {
    try {
      const metadata = decode(row.provenance);
      if (isSourcedTeaching(metadata, row.source_url))
        teaching.push({ row, metadata });
      else accepted.add(row.id);
    } catch {
      /* Invalid provenance is never promoted. */
    }
  }
  if (!teaching.length)
    return all.filter(r => accepted.has(r.id)) as KnowledgeSection[];
  const eventKeys = Array.from(
    new Set(
      teaching
        .filter(
          t =>
            !t.metadata?.manualReview &&
            t.metadata?.origin === "contextual_whatsapp_dialogue"
        )
        .map(t => t.metadata.eventKey)
        .filter(k => typeof k === "string" && /^[a-f0-9]{64}$/.test(k))
    )
  );
  const turns = new Map(
    (
      await batched(eventKeys, b =>
        rows(
          tx,
          sql`SELECT * FROM merchant_teaching_turns
      WHERE merchant_id=${merchantId} AND event_key IN (${sql.join(
        b.map(v => sql`${v}`),
        sql`,`
      )}) ${end}`
        )
      )
    ).map(t => [t.event_key, t])
  );
  const plans: Plan[] = [],
    ids = new Set<number>();
  for (const { row, metadata: p } of teaching) {
    try {
      if (p?.manualReview) {
        if (p.manualReview.version !== 1 || !positive(p.manualReview.changeId))
          continue;
        plans.push({ row, metadata: p, manual: true });
      } else if (
        p?.origin === "contextual_whatsapp_dialogue" &&
        p.version === 2
      ) {
        if (
          p.reviewDecision?.action !== "approve" ||
          !/^[a-f0-9]{64}$/.test(p.reviewDecision.revision)
        )
          continue;
        const proof = parseTeachingProposal(
          merchantId,
          {
            id: row.id,
            merchantId: row.merchant_id,
            title: row.title,
            content: row.content,
            provenance: p,
            status: row.status,
            sourceUrl: row.source_url,
            parentId: row.parent_id,
          },
          turns.get(p.eventKey)
        );
        // Teaching has no generated summary. A changed summary can affect retrieval.
        if (row.summary !== null) continue;
        const sources = [...proof.fragments, proof.source];
        if (sources.some(s => !positive(s.inboundId))) continue;
        sources.forEach(s => ids.add(s.inboundId));
        plans.push({ row, metadata: p, sources });
      } else if (
        p?.origin === "contextual_whatsapp_teaching" &&
        p.version === 1 &&
        positive(p.inboundId)
      ) {
        ids.add(p.inboundId);
        plans.push({ row, metadata: p, legacy: true });
      }
    } catch {
      /* A changed turn/proposal is ineligible, not a reason to reuse an old answer. */
    }
  }
  const originals = new Map(
    (
      await batched(Array.from(ids), b =>
        rows(
          tx,
          sql`SELECT j.id,j.payload_json,j.event_key,
      j.partition_key,j.instance_id,i.instance_id AS account_id,i.provider
      FROM whatsapp_inbound_jobs j JOIN whatsapp_instances i ON i.id=j.instance_id AND i.merchant_id=j.merchant_id
      WHERE j.merchant_id=${merchantId} AND j.id IN (${sql.join(
        b.map(v => sql`${v}`),
        sql`,`
      )}) ${end}`
        )
      )
    ).map(r => [r.id, r])
  );
  const manualIds = Array.from(
    new Set(
      plans.filter(p => p.manual).map(p => p.metadata.manualReview.changeId)
    )
  );
  const manualAudits = new Map(
    (
      await batched(manualIds, b =>
        rows(
          tx,
          sql`SELECT * FROM knowledge_changelog
      WHERE merchant_id=${merchantId} AND action='manual_edit' AND source='manual'
      AND id IN (${sql.join(
        b.map(v => sql`${v}`),
        sql`,`
      )}) ${end}`
        )
      )
    ).map(r => [r.id, r])
  );
  const legacyIds = plans.filter(p => p.legacy).map(p => p.row.id);
  const legacyAudits = await batched(legacyIds, b =>
    rows(
      tx,
      sql`SELECT * FROM knowledge_changelog
      WHERE merchant_id=${merchantId} AND action='add' AND section_id IN (${sql.join(
        b.map(v => sql`${v}`),
        sql`,`
      )}) ${end}`
    )
  );
  for (const plan of plans) {
    const { row, metadata: p } = plan;
    try {
      if (plan.manual) {
        const h = manualTeachingReviewHash({
            merchantId,
            id: row.id,
            title: row.title,
            content: row.content,
            summary: row.summary,
            useInBot: !!row.use_in_bot,
          }),
          a = manualAudits.get(p.manualReview.changeId);
        if (
          p.manualReview.contentHash !== h ||
          a?.section_id !== row.id ||
          a.new_content !== row.content ||
          !a.reason?.endsWith(`\nSHA256:${h}`)
        )
          continue;
      } else if (plan.legacy) {
        const original = originals.get(p.inboundId),
          payload = decode(original?.payload_json);
        const text =
          payload?.messageData?.extendedTextMessageData?.text ??
          payload?.messageData?.textMessageData?.textMessage;
        const author = teachingHistoryPhone(
          payload?.senderData?.sender ?? payload?.senderData?.chatId
        );
        if (!original || typeof text !== "string" || !author) continue;
        const source: TeachingSource = {
          merchantId,
          inboundId: p.inboundId,
          instanceId: p.instanceId,
          eventKey: original.event_key,
          authorPhone: author,
          text,
          digest: p.sourceDigest,
        };
        validateTeachingHistory(source, original);
        const d = validateTeachingDecision(JSON.stringify(p.analysis), text);
        if (
          d.intent !== "teach" ||
          row.title !== d.title ||
          row.content !== `المعلومة: ${text.trim()}` ||
          row.summary !== null ||
          row.source_url !== `whatsapp-teaching://${source.eventKey}` ||
          !legacyAudits.some(
            a =>
              a.section_id === row.id &&
              a.source === marker(source) &&
              a.reason === reason(source) &&
              a.new_content === row.content
          )
        )
          continue;
      } else
        for (const s of plan.sources!)
          validateTeachingHistory(s, originals.get(s.inboundId));
      accepted.add(row.id);
    } catch {
      /* Malformed/withdrawn evidence stays visible for review, never for bot use. */
    }
  }
  return all.filter(r => accepted.has(r.id)) as KnowledgeSection[];
}
