import { TRPCError } from '@trpc/server';
import { setTimeout as pause } from 'node:timers/promises';
import { z } from 'zod';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool } from './db/connection';
import { decryptSecret } from './security/secrets';
import { greenHistoryCall, greenWorkspaceCall } from './whatsapp/tenant-workspace';
import { normalizeHistoryChats, normalizeHistoryMessages, type HistoryMessage } from './whatsapp/history-normalization';
import { historyMessageId, inboundEventKey } from './messaging/message-identity';
import { normalizeZidPhone } from './integrations/zid-commerce-normalization';

type Binding = RowDataPacket & { id: number; merchantId: number; provider: string; instanceId: string; token: string; apiUrl: string | null; phoneNumber: string | null };
const unavailable = () => new TRPCError({ code: 'PRECONDITION_FAILED', message: 'تعذر إكمال استيراد السجل. أعد فحص اتصال الرقم الرئيسي ثم حاول مجددًا.' });
const bindingKey = (r: Binding) => JSON.stringify([r.id, r.merchantId, r.provider, r.instanceId, r.token, r.apiUrl, r.phoneNumber]);
async function binding(connection: PoolConnection, merchantId: number, lock = false): Promise<Binding> {
  const [merchants] = await connection.execute<RowDataPacket[]>(`SELECT id, status FROM merchants WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [merchantId]);
  if (merchants.length !== 1 || merchants[0].status === 'suspended') throw unavailable();
  const [rows] = await connection.execute<Binding[]>(`SELECT id, merchant_id AS merchantId, provider, instance_id AS instanceId, token, api_url AS apiUrl, phone_number AS phoneNumber
    FROM whatsapp_instances WHERE merchant_id = ? AND status = 'active' AND is_primary = 1${lock ? ' FOR UPDATE' : ''}`, [merchantId]);
  const result = rows[0];
  if (rows.length !== 1 || result.provider !== 'green_api' || !result.token || !/^\d{7,15}$/.test(result.phoneNumber || '')) throw unavailable();
  return result;
}

async function allowNewCustomer(connection: PoolConnection, merchantId: number) {
  // Canonical current entitlement, under the merchant lock; do not use an expired or superseded subscription.
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT s.status, s.plan_id, m.max_customers_allowed AS trialLimit, p.max_customers AS planLimit,
    (s.end_date IS NULL OR s.end_date > UTC_TIMESTAMP()) AS unexpired,
    (s.trial_ends_at IS NULL OR s.trial_ends_at > UTC_TIMESTAMP()) AS trialUnexpired
    FROM merchants m JOIN merchant_subscriptions s ON s.id = m.current_subscription_id AND s.merchant_id = m.id
    LEFT JOIN subscription_plans p ON p.id = s.plan_id WHERE m.id = ? FOR UPDATE`, [merchantId]);
  const r = rows[0];
  if (!r || !['active', 'trial'].includes(r.status) || !r.unexpired || r.status === 'trial' && !r.trialUnexpired) throw unavailable();
  const limit = r.status === 'trial' && r.plan_id === null ? r.trialLimit : r.planLimit;
  if (!Number.isSafeInteger(limit) || limit < 0) throw unavailable();
  const [conversationPhones] = await connection.execute<RowDataPacket[]>('SELECT customerPhone AS phone FROM conversations WHERE merchantId = ? FOR UPDATE', [merchantId]);
  const [zidPhones] = await connection.execute<RowDataPacket[]>('SELECT phone FROM zid_customers WHERE merchant_id = ? AND is_active = 1 FOR UPDATE', [merchantId]);
  const customers = new Set([...conversationPhones, ...zidPhones].filter(r => r.phone).map(r => normalizeZidPhone(r.phone) || r.phone));
  if (customers.size >= limit) throw unavailable();
}

async function storeChat(connection: PoolConnection, merchantId: number, expected: Binding,
  chat: { id: string; phone: string; name: string }, messages: HistoryMessage[]) {
  await connection.beginTransaction();
  try {
    if (bindingKey(await binding(connection, merchantId, true)) !== bindingKey(expected)) throw unavailable();
    const [conversations] = await connection.execute<RowDataPacket[]>(`SELECT id, customerPhone FROM conversations
      WHERE merchantId = ? AND customerPhone = ? ORDER BY lastMessageAt DESC, id DESC LIMIT 1 FOR UPDATE`, [merchantId, chat.phone]);
    let conversationId: number | undefined = conversations[0]?.id;
    let chatsImported = 0, messagesImported = 0;
    const pending: Array<HistoryMessage & { externalId: string }> = [];
    for (const msg of messages) {
      const externalId = historyMessageId(merchantId, expected.instanceId, msg.providerId, msg.direction);
      // Legacy raw IDs are compared only inside this merchant. Global raw-ID collisions must not suppress another tenant's history.
      const [existing] = await connection.execute<RowDataPacket[]>(`SELECT msg.id, msg.isProcessed, msg.direction, c.customerPhone
        FROM messages msg JOIN conversations c ON c.id = msg.conversationId
        WHERE c.merchantId = ? AND msg.externalId IN (?, ?) FOR UPDATE`, [merchantId, msg.providerId, externalId]);
      if (existing.length) {
        if (existing.some(r => r.customerPhone !== chat.phone || r.direction !== msg.direction || r.isProcessed !== 1)) throw unavailable();
        continue;
      }
      if (msg.direction === 'incoming') {
        const [jobs] = await connection.execute<RowDataPacket[]>('SELECT status FROM whatsapp_inbound_jobs WHERE event_key = ? FOR UPDATE', [inboundEventKey(merchantId, 'green_api', expected.instanceId, msg.providerId)]);
        if (jobs.some(r => r.status !== 'completed')) throw unavailable(); // Never consume an active/review receipt as history.
      }
      pending.push({ ...msg, externalId });
    }
    if (!pending.length) { await connection.commit(); return { chatsImported, messagesImported }; }
    if (!conversationId) {
      await allowNewCustomer(connection, merchantId);
      const [inserted] = await connection.execute<any>(`INSERT INTO conversations (merchantId, customerPhone, customerName, status, lastMessageAt)
        VALUES (?, ?, ?, 'active', ?)`, [merchantId, chat.phone, chat.name, pending[pending.length - 1].createdAt]);
      conversationId = Number(inserted.insertId); chatsImported = 1;
    }
    for (const msg of pending) {
      await connection.execute(`INSERT INTO messages (conversationId, direction, sender_type, messageType, content, externalId, isProcessed, createdAt, voiceUrl, imageUrl, mediaUrl)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`, [conversationId, msg.direction, msg.senderType, msg.messageType, msg.content, msg.externalId, msg.createdAt,
        msg.messageType === 'voice' ? msg.mediaUrl : null, msg.messageType === 'image' ? msg.mediaUrl : null, msg.mediaUrl]);
      messagesImported++;
    }
    await connection.execute('UPDATE conversations SET lastMessageAt = GREATEST(lastMessageAt, ?) WHERE id = ? AND merchantId = ? AND customerPhone = ?',
      [pending[pending.length - 1].createdAt, conversationId, merchantId, chat.phone]);
    await connection.commit();
    return { chatsImported, messagesImported };
  } catch (error) { await connection.rollback(); throw error; }
}

/** Compatibility result: success means the pass finished; errors always marks an incomplete pass. No message is sent. */
export async function importConversationHistory(merchantId: number) {
  z.number().int().positive().safe().parse(merchantId);
  const pool = await getPool(); if (!pool) throw unavailable();
  const connection = await pool.getConnection();
  const lockName = `sari:history-import:${merchantId}`;
  let locked = false;
  const errors = new Set<string>();
  let chatsImported = 0, messagesImported = 0;
  try {
    const [locks] = await connection.execute<RowDataPacket[]>('SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
    if (locks[0]?.acquired !== 1) throw new TRPCError({ code: 'CONFLICT', message: 'يوجد استيراد جارٍ لهذا المتجر. انتظر ثم أعد الفحص.' });
    locked = true;
    const expected = await binding(connection, merchantId);
    const credentials = { ...expected, token: decryptSecret(expected.token) };
    const state = await greenWorkspaceCall(credentials, 'getStateInstance');
    if (state.stateInstance !== 'authorized') throw unavailable();
    const settings = await greenWorkspaceCall(credentials, 'getSettings');
    if (settings.wid !== `${expected.phoneNumber}@c.us`) throw unavailable();
    const list = normalizeHistoryChats(await greenHistoryCall(credentials));
    if (list.rejected) errors.add('تعذر التحقق من بعض المحادثات التي أعادها المزود.');
    if (bindingKey(await binding(connection, merchantId)) !== bindingKey(expected)) throw unavailable();
    for (let index = 0; index < list.chats.length; index++) {
      if (index) await pause(200); // Preserve the previous import's spacing between history requests.
      const chat = list.chats[index];
      // Stop fetching from a disconnected/replaced account; retain accurate counts already committed.
      try { if (bindingKey(await binding(connection, merchantId)) !== bindingKey(expected)) throw unavailable(); }
      catch { errors.add('تغير الاتصال أثناء الاستيراد؛ لم تُستورد المحادثات المتبقية.'); break; }
      try {
        const history = normalizeHistoryMessages(await greenHistoryCall(credentials, chat.id), chat.id);
        if (history.rejected) errors.add('لم تُستورد بعض الرسائل لتعذر التحقق من محتواها أو حالتها.');
        if (history.messages.length) {
          const stored = await storeChat(connection, merchantId, expected, chat, history.messages);
          chatsImported += stored.chatsImported; messagesImported += stored.messagesImported;
        }
      } catch { errors.add('تعذر حفظ سجل بعض المحادثات. أعد الفحص قبل المحاولة مجددًا.'); }
    }
    return { success: true as const, chatsImported, messagesImported, totalChats: chatsImported, errors: errors.size ? Array.from(errors).slice(0, 5) : undefined };
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'CONFLICT') throw error;
    throw unavailable();
  } finally {
    if (locked) { try { await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]); } catch { connection.destroy(); } }
    connection.release();
  }
}
