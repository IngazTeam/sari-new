import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { contextualSalesLossReason } from "./contextual-sales-loss-contract";
import { verifiedTapLearningSources } from "./payment-learning-source";
import {
  contextualLearningWeights,
  resolvedLearningSignals,
  validateLearningSignals,
} from "./contextual-learning-contract";
import {
  decodeUnderstandingJson,
  recordedAiReply,
  understandingDigest,
  understandingEvidenceSchema,
  verifyUnderstandingEvidence,
} from "./understanding-evidence";

const positive = z.number().int().positive().safe();
const metadataSchema = z
  .object({
    version: z.literal(1),
    basis: z.literal("interpreted_conversation"),
    sourceMessageId: positive,
    interpretationDigest: z.string().regex(/^[a-f0-9]{64}$/),
    aboutAssistantMessageId: positive.nullable(),
    objection: z.string().nullable(),
    financialOutcome: z.literal("unmeasured"),
    causality: z.literal("unmeasured"),
  })
  .strict();
const decode = decodeUnderstandingJson;
const declineMetadataSchema = z
  .object({
    version: z.literal(1),
    basis: z.literal("interpreted_customer_decline"),
    sourceMessageId: positive,
    interpretationDigest: z.string().regex(/^[a-f0-9]{64}$/),
    reason: z.string().min(1),
    causality: z.literal("unmeasured"),
    financialOutcome: z.literal("unmeasured"),
  })
  .strict();
const sourceMetadataSchema = z.union([metadataSchema, declineMetadataSchema]);
/** Old operational heuristics are kept as history, never admitted as learned meaning. */
export const nonSemanticLearningTypes = [
  "merchant_correction",
  "long_conversation",
  "quick_resolution",
  "customer_left",
] as const;
export const contextRequiredLearningTypes = [
  "knowledge_gap",
  "escalation_requested",
] as const;

/** Recheck contextual signals at every later use. Copies of transcript text are
 * not independent evidence. The caller owns a consistent snapshot or transaction.
 * Also admits sealed decline and canonical Tap sources. Other historical source
 * families retain their existing contracts; this does not certify them. */
export async function verifiedContextualLearningSources<
  T extends Record<string, any>,
>(
  connection: Pick<PoolConnection, "execute">,
  merchantId: number,
  rows: T[],
  lock = false
): Promise<T[]> {
  positive.parse(merchantId);
  if (rows.length > 2000) throw Error("Learning source batch too large");
  // Keep original transcript bodies bounded as well as the SQL parameter count.
  // A caller-owned transaction preserves the same snapshot/locks across chunks.
  if (rows.length > 200) {
    const result: T[] = [];
    for (let at = 0; at < rows.length; at += 200)
      result.push(
        ...(await verifiedContextualLearningSources(
          connection,
          merchantId,
          rows.slice(at, at + 200),
          lock
        ))
      );
    return result;
  }
  rows = await verifiedTapLearningSources(connection, merchantId, rows, lock);
  const accepted = new Set<T>();
  const candidates: Array<{
    row: T;
    metadata: z.infer<typeof sourceMetadataSchema>;
  }> = [];
  for (const row of rows) {
    if (nonSemanticLearningTypes.includes(row.signal_type)) continue;
    let metadata: any;
    try {
      metadata = decode(row.context_summary);
    } catch {
      /* Classified by its source key below. */
    }
    const contextual =
      String(row.source_key || "").startsWith("contextual_learning") ||
      String(row.source_key || "").startsWith("contextual_loss") ||
      row.signal_type === "sales_declined" ||
      contextRequiredLearningTypes.includes(row.signal_type) ||
      ["interpreted_conversation", "interpreted_customer_decline"].includes(
        metadata?.basis
      );
    if (!contextual) {
      accepted.add(row);
      continue;
    }
    try {
      const m = sourceMetadataSchema.parse(metadata);
      const prefix =
        m.basis === "interpreted_customer_decline"
          ? "contextual_loss"
          : "contextual_learning";
      if (
        row.merchant_id !== merchantId ||
        !Number.isSafeInteger(row.conversation_id) ||
        row.source_key !==
          `${prefix}:${row.conversation_id}:${m.sourceMessageId}`
      )
        continue;
      candidates.push({ row, metadata: m });
    } catch {
      /* Malformed contextual proofs are quarantined, never rewritten. */
    }
  }
  if (!candidates.length) return rows.filter(r => accepted.has(r));
  const end = lock ? " FOR SHARE" : "";
  async function batched(
    ids: number[],
    query: (batch: number[]) => Promise<any[]>
  ) {
    const result: any[] = [];
    for (let at = 0; at < ids.length; at += 200)
      result.push(...(await query(ids.slice(at, at + 200))));
    return result;
  }
  const records = await batched(
    Array.from(new Set(candidates.map(c => c.metadata.sourceMessageId))),
    async ids => {
      const [result] = await connection.execute<any[]>(
        `SELECT r.*,c.customerPhone
      FROM ai_conversation_understanding r JOIN conversations c ON c.id=r.conversation_id AND c.merchantId=r.merchant_id
      WHERE r.merchant_id=? AND r.state='ready' AND r.incoming_message_id IN (${ids.map(() => "?").join(",")})${end}`,
        [merchantId, ...ids]
      );
      return result;
    }
  );
  const prepared = records.flatMap(record => {
    try {
      const evidence = understandingEvidenceSchema.parse(
        decode(record.message_evidence)
      );
      if (
        record.customerPhone.startsWith("group_") ||
        record.customerPhone.includes("@g.us") ||
        new Set(evidence.map(e => e.id)).size !== evidence.length ||
        evidence.some(
          e =>
            e.id > record.incoming_message_id ||
            e.createdAt === undefined ||
            e.isAiReply === undefined
        ) ||
        !evidence.some(
          e => e.id === record.incoming_message_id && e.role === "user"
        )
      )
        return [];
      return [{ record, evidence }];
    } catch {
      return [];
    }
  });
  const messages = await batched(
    Array.from(new Set(prepared.flatMap(p => p.evidence.map(e => e.id)))),
    async ids => {
      const [result] = await connection.execute<any[]>(
        `SELECT m.id,m.conversationId,m.direction,m.content,m.createdAt,m.sender_type,m.isProcessed,m.aiResponse
      FROM messages m JOIN conversations c ON c.id=m.conversationId
      WHERE c.merchantId=? AND m.id IN (${ids.map(() => "?").join(",")})${end}`,
        [merchantId, ...ids]
      );
      return result;
    }
  );
  const messageById = new Map(messages.map(m => [m.id, m]));
  for (const { record, evidence } of prepared) {
    try {
      const own = evidence
        .map(e => messageById.get(e.id))
        .filter(m => m?.conversationId === record.conversation_id);
      const { analysis } = verifyUnderstandingEvidence(record, own);
      const source = own.find(
        m => m.id === record.incoming_message_id && m.direction === "incoming"
      );
      if (
        !source ||
        understandingDigest(String(source.content)) !== record.source_digest
      )
        continue;
      validateLearningSignals(analysis, {
        currentMessageId: source.id,
        catalog: [],
        targets: [],
        messages: own.map(m => ({
          id: m.id,
          role: m.direction === "incoming" ? "user" : "assistant",
          content: String(m.content || ""),
          isAiReply: recordedAiReply(m),
        })),
      });
      for (const { row, metadata } of candidates.filter(
        c =>
          c.row.conversation_id === record.conversation_id &&
          c.metadata.sourceMessageId === record.incoming_message_id &&
          c.metadata.interpretationDigest === record.result_digest
      )) {
        if (metadata.basis === "interpreted_customer_decline") {
          const reason = contextualSalesLossReason(analysis);
          const evidence = analysis.salesLoss?.evidence || [];
          if (
            !reason ||
            metadata.reason !== reason ||
            row.signal_type !== "sales_declined" ||
            Number(row.signal_weight) !== 1 ||
            row.bot_message !== null ||
            row.merchant_correction !== null ||
            row.customer_message !== String(source.content).slice(0, 2000) ||
            !evidence.some(e => e.messageId === source.id) ||
            evidence.some(
              e =>
                !own.some(
                  m =>
                    m.id === e.messageId &&
                    String(m.content).includes(e.excerpt)
                )
            )
          )
            continue;
          accepted.add(row);
          continue;
        }
        const signal = resolvedLearningSignals(analysis).find(
          s => s.type === row.signal_type
        );
        if (!signal) continue;
        const target =
          signal.aboutAssistantMessageId === null
            ? null
            : own.find(m => m.id === signal.aboutAssistantMessageId);
        if (
          Number(row.signal_weight) !==
            contextualLearningWeights[signal.type] ||
          row.customer_message !== String(source.content).slice(0, 2000) ||
          row.bot_message !==
            (target ? String(target.content).slice(0, 2000) : null) ||
          row.merchant_correction !== null ||
          metadata.aboutAssistantMessageId !== signal.aboutAssistantMessageId ||
          metadata.objection !==
            (["price_objection", "sales_objection"].includes(signal.type)
              ? analysis.objection
              : null)
        )
          continue;
        accepted.add(row);
      }
    } catch {
      /* Invalid immutable evidence has no authority; storage failures above propagate. */
    }
  }
  return rows.filter(r => accepted.has(r));
}
