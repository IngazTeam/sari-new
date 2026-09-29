import type { PoolConnection } from "mysql2/promise";
import {
  memoryFields,
  memoryValueSchemas,
  type CustomerMemoryFact,
  type MemoryField,
} from "../../shared/customer-memory";
import {
  resolvedMemoryFacts,
  validateMemoryFacts,
} from "./contextual-memory-contract";
import {
  decodeUnderstandingJson,
  understandingDigest,
  understandingEvidenceSchema,
  verifyUnderstandingEvidence,
} from "./understanding-evidence";

/** The caller supplies one read-only snapshot; no locks, inference, backfill, or fact mutation. */
export async function readVerifiedCustomerMemory(
  db: PoolConnection,
  merchantId: number,
  phone: string
) {
  const [profiles] = await db.execute<any[]>(
    `SELECT id,memory_version,memory_forget_before_message_id
    FROM customer_profiles WHERE merchant_id=? AND customer_phone=?`,
    [merchantId, phone]
  );
  const profile = profiles[0];
  const facts: CustomerMemoryFact[] = [];
  if (!profile) return { revision: 0, forgetBeforeMessageId: 0, facts };
  const result = {
    revision: Number(profile.memory_version),
    forgetBeforeMessageId: Number(profile.memory_forget_before_message_id),
    facts,
  };
  const [rows] = await db.execute<any[]>(
    `SELECT f.* FROM customer_memory_facts f
    JOIN messages m ON m.id=f.source_message_id AND m.conversationId=f.conversation_id AND m.direction='incoming'
    JOIN conversations c ON c.id=m.conversationId AND c.merchantId=f.merchant_id AND c.customerPhone=?
    WHERE f.profile_id=? AND f.merchant_id=? AND f.deleted=0 AND f.expires_at>UTC_TIMESTAMP(3)
    AND f.field_key IN (${memoryFields.map(() => "?").join(",")})`,
    [phone, profile.id, merchantId, ...memoryFields]
  );
  if (!rows.length) return result;
  const sourceIds = Array.from(
    new Set(rows.map(row => Number(row.source_message_id)))
  );
  const [records] = await db.execute<any[]>(
    `SELECT * FROM ai_conversation_understanding WHERE merchant_id=?
    AND state='ready' AND incoming_message_id IN (${sourceIds.map(() => "?").join(",")})`,
    [merchantId, ...sourceIds]
  );
  // At most 12 fields, 12 interpretations and 252 message IDs. Malformed or legacy proofs stay quarantined.
  const candidates = records.flatMap(record => {
    try {
      const evidence = understandingEvidenceSchema.parse(
        decodeUnderstandingJson(record.message_evidence)
      );
      if (
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
  if (!candidates.length) return result;
  const ids = Array.from(
    new Set(candidates.flatMap(c => c.evidence.map(e => e.id)))
  );
  const [messages] = await db.execute<any[]>(
    `SELECT m.id,m.conversationId,m.direction,m.content,m.createdAt,m.sender_type,m.isProcessed,m.aiResponse
    FROM messages m JOIN conversations c ON c.id=m.conversationId
    WHERE c.merchantId=? AND c.customerPhone=? AND m.id IN (${ids.map(() => "?").join(",")})`,
    [merchantId, phone, ...ids]
  );
  for (const { record } of candidates) {
    try {
      const verified = verifyUnderstandingEvidence(record, messages);
      if (
        verified.analysis.memoryRevision === undefined ||
        verified.analysis.memoryRevision >= result.revision
      )
        continue;
      const source = messages.find(
        m =>
          m.id === record.incoming_message_id &&
          m.conversationId === record.conversation_id &&
          m.direction === "incoming"
      );
      if (
        !source ||
        understandingDigest(String(source.content)) !== record.source_digest
      )
        continue;
      validateMemoryFacts(verified.analysis, {
        currentMessageId: record.incoming_message_id,
        catalog: [],
        targets: [],
        messages: messages
          .filter(
            m =>
              m.conversationId === record.conversation_id &&
              verified.evidence.some(e => e.id === m.id)
          )
          .map(m => ({
            id: m.id,
            role: m.direction === "incoming" ? "user" : "assistant",
            content: String(m.content || ""),
          })),
      });
      for (const row of rows.filter(
        r =>
          r.source_message_id === record.incoming_message_id &&
          r.conversation_id === record.conversation_id
      )) {
        const field: MemoryField = row.field_key;
        const fact = resolvedMemoryFacts(verified.analysis).find(
          f => f.field === field && f.kind === row.source_kind
        );
        if (!fact) continue;
        const parsed = memoryValueSchemas[field].safeParse(row.value_json);
        if (
          !parsed.success ||
          JSON.stringify(parsed.data) !==
            JSON.stringify(memoryValueSchemas[field].parse(fact.value))
        )
          continue;
        const observedAt = new Date(source.createdAt).getTime();
        const days =
          fact.kind === "inferred" ? 30 : field === "budget" ? 90 : 180;
        if (
          !Number.isFinite(observedAt) ||
          new Date(row.observed_at).getTime() !== observedAt ||
          new Date(row.expires_at).getTime() !== observedAt + days * 86400000 ||
          !Number.isSafeInteger(row.revision) ||
          row.revision < 1 ||
          row.revision > result.revision
        )
          continue;
        facts.push({
          field,
          value: parsed.data,
          kind: fact.kind,
          sourceMessageId: row.source_message_id,
          conversationId: row.conversation_id,
          observedAt: new Date(observedAt).toISOString(),
          expiresAt: new Date(row.expires_at).toISOString(),
          revision: row.revision,
        });
      }
    } catch {
      // Invalid persisted data has no prompt authority. Storage errors occur outside this validator and propagate.
      continue;
    }
  }
  // A partial privacy deletion invalidates writes before its watermark, but retains unrelated proven fields.
  // Stable order also keeps the interpreter's pre/post-I/O context digest independent of SQL row order.
  facts.sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0));
  return result;
}
