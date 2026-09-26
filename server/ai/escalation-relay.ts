import type { Pool } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { checkoutTransaction } from './checkout-agreements';
import { transitionOwnershipInTransaction } from './conversation-handoff';
import { destroySession } from './session-context';
import { normalizeCampaignPhone } from '../automation/campaign-guard';
import { sendMerchantWhatsApp } from '../channels/whatsapp/service';
import type { SendMerchantWhatsAppInput } from '../channels/whatsapp/types';

export type EscalationTransportGuard = { id: number; version: number; sourceMessageId: number; mode: 'alert' | 'relay' | 'exhaustion'; relayId?: number };
const positive = (id: unknown): id is number => Number.isSafeInteger(id) && Number(id) > 0;
const json = (value: any) => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
const alertKey = (merchant: number, id: number, level: number) => `escalation_alert:${merchant}:${id}:${level}`;
const relayKey = (merchant: number, id: number) => `escalation_relay:${merchant}:${id}`;

/** Conflicting quote identifiers are rejected; quoted text is never an identity. */
export function quotedEscalationMessageId(payload: any): string | undefined {
  const md = payload?.messageData;
  const values = [md?.quotedMessage?.stanzaId, md?.extendedTextMessageData?.stanzaId, md?.extendedTextMessageData?.quotedMessage?.stanzaId]
    .filter(value => value !== undefined && value !== null);
  if (!values.length || values.some(value => typeof value !== 'string' || !/^[^\s<>\x00-\x1f]{1,255}$/.test(value) || value !== values[0])) return undefined;
  return values[0];
}

/** Relay only the author's new text, never the quoted alert/customer context. */
export function merchantReplyText(payload: any): string | null {
  const md = payload?.messageData;
  const value = md?.extendedTextMessageData?.text ?? md?.textMessageData?.textMessage;
  return typeof value === 'string' && value.trim() ? value : null;
}

/** Process-local hold caches cannot survive a durable answer or ownership change. */
export async function hasOpenEscalation(merchantId: number, conversationId: number, customerPhone: string): Promise<boolean> {
  if (![merchantId, conversationId].every(positive) || !normalizeCampaignPhone(customerPhone)) return false;
  const pool = await getPool(); if (!pool) throw new Error('Escalation storage unavailable');
  const [rows] = await pool.execute<any[]>(`SELECT e.id FROM sari_escalation_queue e
    JOIN conversations c ON c.id=e.conversation_id AND c.merchantId=e.merchant_id
    JOIN messages m ON m.id=e.source_message_id AND m.conversationId=c.id AND m.direction='incoming'
    WHERE e.merchant_id=? AND e.conversation_id=? AND e.customer_phone=? AND c.customerPhone=?
      AND e.status IN ('pending','notified') AND e.expires_at>UTC_TIMESTAMP()
      AND c.human_takeover=0 AND e.handoff_version=c.handoff_version LIMIT 1`,
  [merchantId, conversationId, customerPhone, customerPhone]);
  return rows.length === 1;
}

export async function createSourcedEscalation(data: { merchantId: number; conversationId: number; customerPhone: string;
  incomingMessageId?: number; customerName?: string; question: string; botResponse?: string; priority?: string }) {
  if (![data.merchantId, data.conversationId, data.incomingMessageId].every(positive) || !normalizeCampaignPhone(data.customerPhone)) return null;
  return checkoutTransaction(async c => {
    const [rows] = await c.execute<any[]>(`SELECT c.handoff_version FROM conversations c JOIN messages m ON m.conversationId=c.id
      WHERE c.id=? AND c.merchantId=? AND c.customerPhone=? AND c.human_takeover=0 AND m.id=? AND m.direction='incoming'
        AND m.id>c.automation_after_message_id FOR UPDATE`, [data.conversationId, data.merchantId, data.customerPhone, data.incomingMessageId!]);
    if (rows.length !== 1) return null;
    const [existing] = await c.execute<any[]>(`SELECT id FROM sari_escalation_queue WHERE merchant_id=? AND conversation_id=?
      AND source_message_id=? AND handoff_version=? AND status IN ('pending','notified') AND expires_at>UTC_TIMESTAMP() LIMIT 1`,
    [data.merchantId, data.conversationId, data.incomingMessageId, rows[0].handoff_version]);
    if (existing.length) return Number(existing[0].id);
    const [count] = await c.execute<any[]>('SELECT COUNT(*) AS cnt FROM sari_escalation_queue WHERE merchant_id=? AND created_at>=UTC_DATE()', [data.merchantId]);
    if (count[0].cnt >= 50) return null;
    const [insert] = await c.execute<any>(`INSERT INTO sari_escalation_queue
      (merchant_id,conversation_id,customer_phone,customer_name,question,bot_response,priority,expires_at,source_message_id,handoff_version)
      VALUES (?,?,?,?,?,?,?,TIMESTAMPADD(HOUR,24,UTC_TIMESTAMP()),?,?)`, [data.merchantId, data.conversationId, data.customerPhone,
      data.customerName?.slice(0, 100) ?? null, data.question.slice(0, 2000), data.botResponse?.slice(0, 2000) ?? null,
      data.priority || 'standard', data.incomingMessageId, rows[0].handoff_version]);
    return Number(insert.insertId);
  });
}

/** Final authority check inside the transport, after account lookup and outbox reservation. */
export async function canDispatchEscalation(pool: Pick<Pool, 'execute'>, input: SendMerchantWhatsAppInput) {
  const g = input.escalationGuard;
  if (!g || !positive(g.id) || !positive(g.sourceMessageId) || !Number.isSafeInteger(g.version) || g.version < 0) return false;
  const [rows] = await pool.execute<any[]>(`SELECT e.*,c.customerPhone,c.human_takeover,c.handoff_version AS live_version,
    (SELECT MAX(id) FROM messages WHERE conversationId=c.id AND direction='incoming') AS last_incoming
    FROM sari_escalation_queue e JOIN conversations c ON c.id=e.conversation_id AND c.merchantId=e.merchant_id
    JOIN messages m ON m.id=e.source_message_id AND m.conversationId=c.id AND m.direction='incoming'
    WHERE e.id=? AND e.merchant_id=? AND e.source_message_id=? AND e.status IN ('pending','notified') AND e.expires_at>UTC_TIMESTAMP()`,
  [g.id, input.merchantId, g.sourceMessageId]);
  const e = rows[0];
  if (rows.length !== 1 || e.live_version !== g.version || e.last_incoming !== g.sourceMessageId
    || normalizeCampaignPhone(e.customerPhone) !== normalizeCampaignPhone(e.customer_phone)) return false;
  const { isPhoneInEscalationChain } = await import('./smart-escalation');
  if (g.mode === 'relay') {
    if (!positive(g.relayId) || !e.human_takeover || input.idempotencyKey !== relayKey(input.merchantId, g.id)
      || normalizeCampaignPhone(input.to) !== normalizeCampaignPhone(e.customerPhone)) return false;
    const [relays] = await pool.execute<any[]>(`SELECT * FROM sales_escalation_relays WHERE id=? AND merchant_id=? AND escalation_id=?
      AND ownership_version=? AND status='reserved' AND instance_id=?`, [g.relayId, input.merchantId, g.id, g.version, input.instanceRecordId ?? 0]);
    return relays.length === 1 && input.text === relays[0].reply_text && await isPhoneInEscalationChain(input.merchantId, relays[0].author_phone);
  }
  if (e.human_takeover || e.handoff_version !== g.version) return false;
  const [relays] = await pool.execute<any[]>('SELECT id FROM sales_escalation_relays WHERE merchant_id=? AND escalation_id=?', [input.merchantId, g.id]);
  if (relays.length) return false;
  if (g.mode === 'exhaustion') return input.idempotencyKey === `escalation_exhaustion:${input.merchantId}:${g.id}`
    && normalizeCampaignPhone(input.to) === normalizeCampaignPhone(e.customerPhone);
  return g.mode === 'alert' && new RegExp(`^escalation_alert:${input.merchantId}:${g.id}:[0-4]$`).test(input.idempotencyKey)
    && normalizeCampaignPhone(input.to) !== normalizeCampaignPhone(e.customerPhone)
    && await isPhoneInEscalationChain(input.merchantId, input.to);
}

export async function sendSourcedEscalationAlert(input: { merchantId: number; escalationId: number; instanceRecordId: number; to: string; level: number; text: string }) {
  const pool = await getPool(); if (!pool) throw new Error('Escalation storage unavailable');
  if (!Number.isInteger(input.level) || input.level < 0 || input.level > 4) throw new Error('Invalid escalation level');
  const [rows] = await pool.execute<any[]>('SELECT source_message_id,handoff_version FROM sari_escalation_queue WHERE id=? AND merchant_id=?', [input.escalationId, input.merchantId]);
  if (!rows.length || !positive(rows[0].source_message_id) || rows[0].handoff_version == null) throw new Error('Escalation source unavailable');
  return sendMerchantWhatsApp({ merchantId: input.merchantId, instanceRecordId: input.instanceRecordId, to: input.to, kind: 'text', text: input.text,
    idempotencyKey: alertKey(input.merchantId, input.escalationId, input.level),
    escalationGuard: { id: input.escalationId, mode: 'alert', sourceMessageId: rows[0].source_message_id, version: rows[0].handoff_version } });
}

export type RelayInput = { merchantId: number; instanceRecordId?: number; merchantPhone: string; quotedMessageId?: string; replyText: string };
export type RelayResult = { handled: boolean; accepted: boolean; status: 'accepted' | 'unknown' | 'failed' | 'suppressed' | 'unavailable'; customerPhone?: string };

export async function relayEscalationReply(input: RelayInput): Promise<RelayResult> {
  const unavailable: RelayResult = { handled: false, accepted: false, status: 'unavailable' };
  if (![input.merchantId, input.instanceRecordId].every(positive) || !input.quotedMessageId || input.quotedMessageId.length > 255
    || !input.replyText?.trim() || input.replyText.length > 2000 || !normalizeCampaignPhone(input.merchantPhone)) return unavailable;
  const pool = await getPool(); if (!pool) throw new Error('Escalation storage unavailable');
  const { isPhoneInEscalationChain } = await import('./smart-escalation');
  if (!await isPhoneInEscalationChain(input.merchantId, input.merchantPhone)) return unavailable;
  const [alerts] = await pool.execute<any[]>(`SELECT idempotency_key,request_json FROM whatsapp_message_deliveries
    WHERE merchant_id=? AND instance_id=? AND provider_message_id=? AND direction='outgoing' AND status IN ('sent','delivered','read')`,
  [input.merchantId, input.instanceRecordId!, input.quotedMessageId]);
  if (alerts.length !== 1) return unavailable;
  const alert = alerts[0], request = json(alert.request_json), guard = request?.escalationGuard as EscalationTransportGuard | undefined;
  if (!guard || guard.mode !== 'alert' || !positive(guard.id) || !positive(guard.sourceMessageId) || !Number.isSafeInteger(guard.version)
    || normalizeCampaignPhone(request?.to) !== normalizeCampaignPhone(input.merchantPhone)
    || !new RegExp(`^escalation_alert:${input.merchantId}:${guard.id}:[0-4]$`).test(alert.idempotency_key)) return unavailable;
  const reserved = await checkoutTransaction(async c => {
    await c.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE', [input.merchantId]);
    const [candidates] = await c.execute<any[]>('SELECT conversation_id FROM sari_escalation_queue WHERE id=? AND merchant_id=?', [guard.id, input.merchantId]);
    if (!candidates.length) return null;
    const conversationId = candidates[0].conversation_id;
    const [convs] = await c.execute<any[]>('SELECT * FROM conversations WHERE id=? AND merchantId=? FOR UPDATE', [conversationId, input.merchantId]);
    const [rows] = await c.execute<any[]>('SELECT *,(expires_at>UTC_TIMESTAMP()) AS live FROM sari_escalation_queue WHERE id=? AND merchant_id=? FOR UPDATE', [guard.id, input.merchantId]);
    const e = rows[0], conv = convs[0]; if (!e || !conv) return null;
    const [prior] = await c.execute<any[]>('SELECT * FROM sales_escalation_relays WHERE merchant_id=? AND escalation_id=?', [input.merchantId, guard.id]);
    if (prior.length) {
      const r = prior[0];
      return r.author_phone === normalizeCampaignPhone(input.merchantPhone) && r.reply_text === input.replyText && r.quoted_message_id === input.quotedMessageId
        ? { ...r, conversationId, customerPhone: e.customer_phone, fresh: false } : null;
    }
    const [latest] = await c.execute<any[]>("SELECT MAX(id) AS id FROM messages WHERE conversationId=? AND direction='incoming'", [conversationId]);
    if (!['pending', 'notified'].includes(e.status) || !e.live || e.source_message_id !== guard.sourceMessageId || e.handoff_version !== guard.version
      || conv.human_takeover || conv.handoff_version !== guard.version || latest[0].id !== guard.sourceMessageId
      || normalizeCampaignPhone(conv.customerPhone) !== normalizeCampaignPhone(e.customer_phone)) return null;
    const ownership = await transitionOwnershipInTransaction(c, conversationId, { humanTakeover: 1, humanExpiresAt: new Date(Date.now() + 86400000) },
      { merchantId: input.merchantId, expectedVersion: guard.version });
    const [insert] = await c.execute<any>(`INSERT INTO sales_escalation_relays
      (merchant_id,escalation_id,instance_id,author_phone,quoted_message_id,reply_text,ownership_version) VALUES (?,?,?,?,?,?,?)`,
    [input.merchantId, guard.id, input.instanceRecordId, normalizeCampaignPhone(input.merchantPhone), input.quotedMessageId, input.replyText, ownership.version]);
    return { id: Number(insert.insertId), ownership_version: ownership.version, conversationId, customerPhone: e.customer_phone, fresh: true, status: 'reserved' };
  });
  if (!reserved) return { handled: true, accepted: false, status: 'suppressed' };
  if (reserved.fresh) destroySession(input.merchantId, reserved.conversationId);
  let result;
  if (reserved.fresh) {
    result = await sendMerchantWhatsApp({ merchantId: input.merchantId, instanceRecordId: input.instanceRecordId, to: reserved.customerPhone,
      kind: 'text', text: input.replyText, idempotencyKey: relayKey(input.merchantId, guard.id),
      escalationGuard: { ...guard, mode: 'relay', relayId: reserved.id, version: reserved.ownership_version } })
      .catch(() => ({ accepted: false, status: 'queued' as const, providerMessageId: undefined, errorCode: 'delivery_unknown' }));
  } else {
    const [deliveries] = await pool.execute<any[]>('SELECT status,provider_message_id,error_code FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=?',
      [input.merchantId, relayKey(input.merchantId, guard.id)]);
    const d = deliveries[0];
    result = { accepted: Boolean(d?.provider_message_id) && ['sent', 'delivered', 'read'].includes(d?.status), status: d?.status || 'queued',
      providerMessageId: d?.provider_message_id, errorCode: d?.error_code };
  }
  if (!result.accepted || !result.providerMessageId) {
    const status = result.errorCode === 'escalation_suppressed' ? 'suppressed' : result.status === 'failed' ? 'failed' : 'unknown';
    // A racing duplicate never changes the first worker's reservation.
    if (reserved.fresh) await pool.execute("UPDATE sales_escalation_relays SET status=? WHERE id=? AND merchant_id=? AND status='reserved'", [status, reserved.id, input.merchantId]);
    return { handled: true, accepted: false, status };
  }
  const { reconcileEscalationRelay } = await import('./escalation-reconciliation');
  const recorded = await reconcileEscalationRelay(input.merchantId, reserved.id);
  return { handled: true, accepted: recorded.outcome === 'accepted', status: recorded.outcome === 'accepted' ? 'accepted' : 'unknown', customerPhone: reserved.customerPhone };
}
