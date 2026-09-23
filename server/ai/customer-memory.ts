import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { checkoutTransaction, type CheckoutIdentity } from './checkout-agreements';
import { destroySession } from './session-context';
import { memoryFields, memoryValueSchemas, parseDirectMemory, inferredMemorySchema,
  type MemoryField, type CustomerMemoryFact } from '../../shared/customer-memory';
import type { CustomerProfile } from '../db/customer-intelligence';

const positiveId = (n: number) => Number.isSafeInteger(n) && n > 0;
function assertIdentity(input: CheckoutIdentity) {
  if (![input.merchantId, input.conversationId, input.incomingMessageId].every(positiveId)
    || !/^\+?[1-9][0-9]{7,14}$/.test(input.customerPhone)) throw new Error('Memory identity invalid');
}

export async function readCustomerMemory(merchantId: number, phone: string) {
  if (!positiveId(merchantId) || typeof phone !== 'string' || phone.length > 50) throw new Error('Memory identity invalid');
  const pool = await getPool(); if (!pool) throw new Error('Memory storage unavailable');
  const [profiles] = await pool.execute<any[]>(`SELECT id, memory_version, memory_forget_before_message_id
    FROM customer_profiles WHERE merchant_id=? AND customer_phone=?`, [merchantId, phone]);
  const profile = profiles[0];
  if (!profile) return { revision: 0, forgetBeforeMessageId: 0, facts: [] as CustomerMemoryFact[] };
  // A removed source, foreign message, changed phone or expired field cannot become prompt context.
  const [rows] = await pool.execute<any[]>(`SELECT f.* FROM customer_memory_facts f
    JOIN messages m ON m.id=f.source_message_id AND m.conversationId=f.conversation_id AND m.direction='incoming'
    JOIN conversations c ON c.id=m.conversationId AND c.merchantId=f.merchant_id AND c.customerPhone=?
    WHERE f.profile_id=? AND f.merchant_id=? AND f.deleted=0 AND f.expires_at>UTC_TIMESTAMP(3)`, [phone, profile.id, merchantId]);
  const facts: CustomerMemoryFact[] = [];
  for (const row of rows) {
    if (!memoryFields.includes(row.field_key)) continue;
    const field: MemoryField = row.field_key;
    // mysql2 already decodes the JSON column, including scalar strings and booleans.
    let value; try { value = memoryValueSchemas[field].parse(row.value_json); } catch { continue; }
    facts.push({ field, value, kind: row.source_kind, sourceMessageId: row.source_message_id, conversationId: row.conversation_id,
      observedAt: new Date(row.observed_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString(), revision: row.revision });
  }
  return { revision: profile.memory_version, forgetBeforeMessageId: profile.memory_forget_before_message_id, facts };
}

/** Legacy summaries remain available for audit; only sourced, unexpired memory reaches sales decisions. */
export function groundCustomerProfile(profile: CustomerProfile, memory: Awaited<ReturnType<typeof readCustomerMemory>>): CustomerProfile {
  const values = Object.fromEntries(memory.facts.map(f => [f.field, f.value]));
  const preferences: Record<string, unknown> = {};
  for (const key of ['priceConscious', 'qualityFocused', 'urgentBuyer', 'fastDelivery', 'brandConscious', 'interestTags', 'buyingStage', 'budget']) {
    if (values[key] !== undefined) preferences[key] = values[key];
  }
  const verified = !memory.forgetBeforeMessageId && profile.preferences?._purchaseMemory?.source === 'canonical_tap_payments';
  return { ...profile, memoryFacts: memory.facts, memoryForgetBeforeMessageId: memory.forgetBeforeMessageId,
    preferences, displayName: values.preferredName as string || null, nickname: null, childName: null,
    painPoints: values.painPoints as string[] || [], lastObjection: values.lastObjection as string || null,
    sentimentAvg: values.sentiment as string || 'neutral',
    purchaseHistory: verified ? profile.purchaseHistory : [], totalSpent: verified ? profile.totalSpent : 0,
    customerTier: verified ? profile.customerTier : 'new', verifiedPurchaseCount: verified ? profile.verifiedPurchaseCount : 0,
    verifiedSpendByCurrency: verified ? profile.verifiedSpendByCurrency : {} };
}

async function lockProfile(connection: PoolConnection, input: { merchantId: number; customerPhone: string }) {
  await connection.execute(`INSERT INTO customer_profiles (merchant_id, customer_phone) VALUES (?, ?)
    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(customer_profiles.id)`, [input.merchantId, input.customerPhone]);
  const [rows] = await connection.execute<any[]>('SELECT * FROM customer_profiles WHERE merchant_id=? AND customer_phone=? FOR UPDATE',
    [input.merchantId, input.customerPhone]);
  return rows[0];
}

async function writeFact(connection: PoolConnection, profileId: number, merchantId: number, fact: {
  field: MemoryField; value: unknown; kind: 'explicit' | 'inferred'; message: any; deleted?: boolean;
}) {
  const [existing] = await connection.execute<any[]>('SELECT * FROM customer_memory_facts WHERE profile_id=? AND merchant_id=? AND field_key=?',
    [profileId, merchantId, fact.field]);
  const old = existing[0];
  // Replaying an old source never renews TTL; inference never overrides a direct statement or a deletion barrier.
  if (old && (old.source_message_id >= fact.message.id || (fact.kind === 'inferred' && old.source_kind === 'explicit' && !old.deleted))) return false;
  const observedAt = new Date(fact.message.createdAt);
  const days = fact.kind === 'inferred' ? 30 : fact.field === 'budget' ? 90 : 180;
  await connection.execute(`INSERT INTO customer_memory_facts
    (profile_id,merchant_id,field_key,value_json,source_kind,source_message_id,conversation_id,observed_at,expires_at,deleted)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE value_json=VALUES(value_json), source_kind=VALUES(source_kind),
    source_message_id=VALUES(source_message_id), conversation_id=VALUES(conversation_id), observed_at=VALUES(observed_at),
    expires_at=VALUES(expires_at), deleted=VALUES(deleted), revision=revision+1, updated_at=UTC_TIMESTAMP(3)`,
  [profileId, merchantId, fact.field, fact.deleted ? null : JSON.stringify(memoryValueSchemas[fact.field].parse(fact.value)),
    fact.kind, fact.message.id, fact.message.conversationId, observedAt, new Date(observedAt.getTime() + days * 86400000), fact.deleted ? 1 : 0]);
  return true;
}

/** Every clear incoming declaration is persisted before all reply exits. Never accept caller-supplied text as evidence. */
export async function captureDirectCustomerMemory(input: CheckoutIdentity): Promise<{ reply: string | null; forgetBeforeMessageId: number }> {
  assertIdentity(input);
  const pool = await getPool(); if (!pool) throw new Error('Memory storage unavailable');
  const [source] = await pool.execute<any[]>(`SELECT m.* FROM messages m JOIN conversations c ON c.id=m.conversationId
    WHERE m.id=? AND c.id=? AND c.merchantId=? AND c.customerPhone=? AND m.direction='incoming'`,
  [input.incomingMessageId, input.conversationId, input.merchantId, input.customerPhone]);
  if (source.length !== 1) throw new Error('Memory source ownership mismatch');
  const command = parseDirectMemory(String(source[0].content || ''));
  if (!command) {
    const [rows] = await pool.execute<any[]>('SELECT memory_forget_before_message_id FROM customer_profiles WHERE merchant_id=? AND customer_phone=?', [input.merchantId, input.customerPhone]);
    return { reply: null, forgetBeforeMessageId: rows[0]?.memory_forget_before_message_id || 0 };
  }
  const result = await checkoutTransaction(async connection => {
    // Serialize customer-wide memory changes before touching its conversations/sessions.
    const profile = await lockProfile(connection, input);
    const [conversations] = await connection.execute<any[]>('SELECT id FROM conversations WHERE id=? AND merchantId=? AND customerPhone=? FOR UPDATE',
      [input.conversationId, input.merchantId, input.customerPhone]);
    if (!conversations.length) throw new Error('Memory conversation unavailable');
    const [sources] = await connection.execute<any[]>('SELECT * FROM messages WHERE id=? AND conversationId=? AND direction=\'incoming\' FOR UPDATE', [input.incomingMessageId, input.conversationId]);
    const message = sources[0];
    if (!message || JSON.stringify(parseDirectMemory(message.content || '')) !== JSON.stringify(command)) throw new Error('Memory source changed');
    if (input.incomingMessageId <= profile.memory_forget_before_message_id) return {
      reply: command.kind === 'forget' ? 'سبق تطبيق طلب حذف الذاكرة أو طلب حذف أحدث منه؛ لم أعد استخدام المعلومات السابقة.' : null,
      forgetBeforeMessageId: profile.memory_forget_before_message_id, conversations: [],
    };
    if (command.kind === 'set') {
      const applied = await writeFact(connection, profile.id, input.merchantId, { field: command.field, value: command.value, kind: 'explicit', message });
      if (applied) await connection.execute('UPDATE customer_profiles SET memory_version=memory_version+1 WHERE id=? AND merchant_id=?', [profile.id, input.merchantId]);
      return { reply: null, forgetBeforeMessageId: profile.memory_forget_before_message_id, conversations: [] };
    }
    // Watermark covers all messages already received for this exact tenant/customer, including other conversations.
    const [latest] = await connection.execute<any[]>(`SELECT COALESCE(MAX(m.id),0) AS id FROM messages m JOIN conversations c ON c.id=m.conversationId
      WHERE c.merchantId=? AND c.customerPhone=?`, [input.merchantId, input.customerPhone]);
    const watermark = Math.max(message.id, Number(latest[0].id));
    const [later] = await connection.execute<any[]>(`SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversationId
      WHERE c.merchantId=? AND c.customerPhone=? AND m.direction='incoming' AND m.id>? LIMIT 1`, [input.merchantId, input.customerPhone, message.id]);
    if (later.length) return { reply: 'وصلت رسالة أحدث من طلب الحذف. أعد إرسال طلب حذف ذاكرة المبيعات لتطبيقه على الذاكرة الحالية.',
      forgetBeforeMessageId: profile.memory_forget_before_message_id, conversations: [] };
    const fields = command.field === 'all' ? memoryFields : [command.field];
    for (const field of fields) await writeFact(connection, profile.id, input.merchantId, { field, value: null, kind: 'explicit', message, deleted: true });
    // Erase values, including legacy aliases/summaries. Tombstones retain only provenance and replay barriers.
    await connection.execute(`UPDATE customer_profiles SET preferences=NULL, pain_points=NULL, last_objection=NULL, nickname=NULL,
      child_name=NULL, display_name=NULL, sentiment_avg='neutral', memory_version=memory_version+1,
      memory_forget_before_message_id=? WHERE id=? AND merchant_id=?`, [watermark, profile.id, input.merchantId]);
    const [owned] = await connection.execute<any[]>('SELECT id FROM conversations WHERE merchantId=? AND customerPhone=?', [input.merchantId, input.customerPhone]);
    await connection.execute(`UPDATE session_contexts s JOIN conversations c ON c.id=s.conversation_id AND c.merchantId=s.merchant_id
      SET s.context_json='null', s.expires_at=UTC_TIMESTAMP(), s.version=s.version+1
      WHERE c.merchantId=? AND c.customerPhone=?`, [input.merchantId, input.customerPhone]);
    return { reply: command.field === 'all'
      ? 'حذفت ذاكرة المبيعات الخاصة بك. يحتفظ النظام بسجل المحادثة والطلبات؛ هذا الطلب يخص الذاكرة المستخدمة لتخصيص الردود.'
      : command.field === 'budget' ? 'حذفت الميزانية من ذاكرة المبيعات. يمكنك تحديد ميزانية جديدة متى رغبت.' : 'حذفت الاسم المفضل من ذاكرة المبيعات.',
    forgetBeforeMessageId: watermark, conversations: owned.map(c => c.id as number) };
  });
  for (const id of result.conversations) destroySession(input.merchantId, id);
  return { reply: result.reply, forgetBeforeMessageId: result.forgetBeforeMessageId };
}

/** Lease, profile CAS, source ownership and per-field precedence are committed together. */
export async function persistInferredCustomerMemory(input: { merchantId: number; customerPhone: string; conversationId: number;
  throughMessageId: number; expectedVersion: number; jobId: number; leaseToken: string; extraction: unknown; allowedMessageIds: number[] }) {
  const parsed = inferredMemorySchema.parse(input.extraction);
  return checkoutTransaction(async connection => {
    const profile = await lockProfile(connection, input);
    if (Number(profile.last_enriched_message_id || 0) >= input.throughMessageId) return;
    const [jobs] = await connection.execute<any[]>(`SELECT j.id FROM ai_interaction_jobs j
      JOIN conversations c ON c.id=j.conversation_id AND c.merchantId=j.merchant_id
      JOIN messages m ON m.id=j.incoming_message_id AND m.conversationId=c.id AND m.direction='incoming'
      WHERE j.id=? AND j.merchant_id=? AND j.conversation_id=? AND j.incoming_message_id=?
      AND j.state='processing' AND j.lease_token=? AND j.lease_until>UTC_TIMESTAMP(3) AND c.customerPhone=? FOR UPDATE`,
    [input.jobId, input.merchantId, input.conversationId, input.throughMessageId, input.leaseToken, input.customerPhone]);
    if (!jobs.length || profile.memory_version !== input.expectedVersion) throw new Error('Profile memory changed or interaction lease expired');
    for (const fact of parsed.facts) {
      if (!input.allowedMessageIds.includes(fact.sourceMessageId) || fact.sourceMessageId > input.throughMessageId
        || fact.sourceMessageId <= profile.memory_forget_before_message_id) throw new Error('Memory evidence outside permitted history');
      const [messages] = await connection.execute<any[]>(`SELECT m.* FROM messages m JOIN conversations c ON c.id=m.conversationId
        WHERE m.id=? AND c.id=? AND c.merchantId=? AND c.customerPhone=? AND m.direction='incoming'`,
      [fact.sourceMessageId, input.conversationId, input.merchantId, input.customerPhone]);
      if (!messages.length) throw new Error('Memory evidence ownership mismatch');
      await writeFact(connection, profile.id, input.merchantId, { field: fact.field, value: fact.value, kind: 'inferred', message: messages[0] });
    }
    await connection.execute(`UPDATE customer_profiles SET memory_version=memory_version+1, last_enriched_message_id=?
      WHERE id=? AND merchant_id=?`, [input.throughMessageId, profile.id, input.merchantId]);
  });
}
