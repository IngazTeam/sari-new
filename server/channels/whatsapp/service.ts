import { getPool, getPrimaryWhatsAppInstance, getWhatsAppInstanceById } from '../../db';
import { assertRuntimeSchema } from '../../db/schema-readiness';
import { getWhatsAppProvider } from './providers';
import { currentInboundExecution } from '../../messaging/inbound-context';
import { whatsAppEventEffectKey } from './effect-key';
import type {
  SendMerchantWhatsAppInput,
  WhatsAppDeliveryStatus,
  WhatsAppProviderConfig,
  WhatsAppProviderKind,
} from './types';

const IDEMPOTENCY_PATTERN = /^[a-zA-Z0-9:_-]{16,100}$/;
const STATUS_RANK: Record<WhatsAppDeliveryStatus, number> = {
  received: 0,
  queued: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
};

export class WhatsAppDeliveryStateError extends Error {
  readonly code = 'delivery_outcome_unknown';

  constructor() {
    super('WhatsApp provider outcome could not be persisted safely');
    this.name = 'WhatsAppDeliveryStateError';
  }
}

async function ensureChannelSchema() {
  await assertRuntimeSchema('WhatsApp channel', [
    { table: 'whatsapp_instances', columns: ['provider', 'phone_number_id', 'provider_account_id'] },
    { table: 'whatsapp_message_deliveries', columns: ['idempotency_key', 'provider_message_id', 'status', 'request_json'],
      uniqueIndexes: [{ name: 'uq_whatsapp_provider_message', columns: ['merchant_id', 'instance_id', 'provider', 'direction', 'provider_message_id'] }] },
  ]);
}

function toProviderConfig(instance: any): WhatsAppProviderConfig {
  return {
    provider: (instance.provider || 'green_api') as WhatsAppProviderKind,
    instanceId: String(instance.instanceId),
    token: String(instance.token),
    apiUrl: instance.apiUrl,
    phoneNumberId: instance.phoneNumberId,
    providerAccountId: instance.providerAccountId,
  };
}

function validateSendInput(input: SendMerchantWhatsAppInput): void {
  if (!Number.isInteger(input.merchantId) || input.merchantId <= 0) throw new Error('Invalid merchant');
  if (!IDEMPOTENCY_PATTERN.test(input.idempotencyKey)) throw new Error('Invalid WhatsApp idempotency key');
  if (input.kind === 'text' && (!input.text?.trim() || input.text.length > 4096)) throw new Error('Text must contain 1-4096 characters');
  if (input.text && input.kind !== 'text' && input.text.length > 1024) throw new Error('Media caption exceeds 1024 characters');
  if (input.kind !== 'text' && input.kind !== 'template' && !input.mediaUrl) throw new Error('Media URL is required');
}

export async function sendMerchantWhatsApp(input: SendMerchantWhatsAppInput): Promise<{
  accepted: boolean;
  duplicate: boolean;
  status: WhatsAppDeliveryStatus;
  providerMessageId?: string;
  errorCode?: string;
}> {
  const execution = currentInboundExecution();
  try {
    const result = await dispatchMerchantWhatsApp(input);
    if (execution && !result.accepted) execution.uncertainEffect = true;
    return result;
  } catch (error) {
    if (execution) execution.uncertainEffect = true;
    throw error;
  }
}

async function dispatchMerchantWhatsApp(input: SendMerchantWhatsAppInput): Promise<{
  accepted: boolean; duplicate: boolean; status: WhatsAppDeliveryStatus; providerMessageId?: string; errorCode?: string;
}> {
  validateSendInput(input);
  await ensureChannelSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const instance = input.instanceRecordId
    ? await getWhatsAppInstanceById(input.instanceRecordId)
    : await getPrimaryWhatsAppInstance(input.merchantId);
  if (!instance || instance.merchantId !== input.merchantId || instance.status !== 'active') {
    return { accepted: false, duplicate: false, status: 'failed', errorCode: 'instance_unavailable' };
  }
  const config = toProviderConfig(instance);
  const execution = currentInboundExecution();
  if (execution) {
    if (execution.merchantId !== input.merchantId) throw new Error('Inbound effect tenant mismatch');
    await execution.assertOwned();
  }

  let reserved = false;
  try {
    await pool.execute(
      `INSERT INTO whatsapp_message_deliveries
        (merchant_id, message_id, instance_id, provider, idempotency_key, direction, status, request_json)
       VALUES (?, ?, ?, ?, ?, 'outgoing', 'queued', ?)`,
      [input.merchantId, input.messageId || null, instance.id, config.provider, input.idempotencyKey,
        JSON.stringify({ to: input.to, kind: input.kind, text: input.text, mediaUrl: input.mediaUrl,
          fileName: input.fileName, template: input.template, inboundJobId: execution?.id, escalationGuard: input.escalationGuard,
          salesOfferGuard: input.salesOfferGuard, salesReplyGuard: input.salesReplyGuard, bookingNoticeGuard: input.bookingNoticeGuard, appointmentReminderGuard: input.appointmentReminderGuard })]
    );
    reserved = true;
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_ENTRY') throw error;
    const [rows] = await pool.execute(
      `SELECT status, provider_message_id, error_code FROM whatsapp_message_deliveries
       WHERE idempotency_key = ? AND merchant_id = ? LIMIT 1`,
      [input.idempotencyKey, input.merchantId]
    );
    const existing = (rows as any[])?.[0];
    if (!existing) throw error;
    if (existing.status === 'failed' && input.retryFailed && !input.idempotencyKey.startsWith('sales_reply:') && !input.salesReplyGuard
        && existing.error_code !== 'provider_unreachable'
        && !/^http_(?:[235]\d\d|408)$/.test(existing.error_code || '')) {
      const [retry] = await pool.execute(
        `UPDATE whatsapp_message_deliveries
         SET status = 'queued', error_code = NULL, error_details = NULL, status_updated_at = NOW()
         WHERE idempotency_key = ? AND merchant_id = ? AND status = 'failed'`,
        [input.idempotencyKey, input.merchantId]
      );
      reserved = Number((retry as any)?.affectedRows || 0) === 1;
    }
    if (!reserved) {
      if (execution && !['sent', 'delivered', 'read'].includes(existing.status)) execution.uncertainEffect = true;
      return {
        accepted: ['sent', 'delivered', 'read'].includes(existing.status),
        duplicate: true,
        status: existing.status,
        providerMessageId: existing.provider_message_id || undefined,
        errorCode: existing.error_code || (existing.status === 'queued' ? 'delivery_in_progress' : undefined),
      };
    }
  }

  const provider = getWhatsAppProvider(config.provider);
  if (execution) await execution.assertOwned();
  if (input.idempotencyKey.startsWith('appointment_reminder:') || input.appointmentReminderGuard) {
    const { canDispatchAppointmentReminder } = await import('../../appointment-reminders');
    if (!await canDispatchAppointmentReminder(input, config)) {
      await pool.execute(`UPDATE whatsapp_message_deliveries SET status='failed',error_code='appointment_reminder_suppressed',status_updated_at=NOW()
        WHERE merchant_id=? AND idempotency_key=? AND status='queued'`, [input.merchantId,input.idempotencyKey]);
      return {accepted:false,duplicate:false,status:'failed',errorCode:'appointment_reminder_suppressed'};
    }
  }
  if (input.idempotencyKey.startsWith('booking_notice:') || input.bookingNoticeGuard) {
    const { canDispatchBookingNotice } = await import('../../booking-reschedule-notification');
    if (!await canDispatchBookingNotice(input, config)) {
      await pool.execute(`UPDATE whatsapp_message_deliveries SET status='failed',error_code='booking_notice_suppressed',status_updated_at=NOW()
        WHERE merchant_id=? AND idempotency_key=? AND status='queued'`, [input.merchantId,input.idempotencyKey]);
      return {accepted:false,duplicate:false,status:'failed',errorCode:'booking_notice_suppressed'};
    }
  }
  if (input.idempotencyKey.startsWith('sales_offer:') || input.salesOfferGuard) {
    const { canDispatchSalesOffer } = await import('../../ai/sales-offer-delivery');
    if (!await canDispatchSalesOffer(input, config)) {
      await pool.execute(`UPDATE whatsapp_message_deliveries SET status='failed',error_code='sales_offer_suppressed',status_updated_at=NOW()
        WHERE merchant_id=? AND idempotency_key=? AND status='queued'`, [input.merchantId,input.idempotencyKey]);
      return { accepted:false,duplicate:false,status:'failed',errorCode:'sales_offer_suppressed' };
    }
  }
  if (/^escalation_(?:alert|relay|exhaustion):/.test(input.idempotencyKey)) {
    const { canDispatchEscalation } = await import('../../ai/escalation-relay');
    if (!await canDispatchEscalation(pool, input)) {
      await pool.execute(`UPDATE whatsapp_message_deliveries SET status='failed',error_code='escalation_suppressed',status_updated_at=NOW()
        WHERE merchant_id=? AND idempotency_key=? AND status='queued'`, [input.merchantId, input.idempotencyKey]);
      return { accepted: false, duplicate: false, status: 'failed', errorCode: 'escalation_suppressed' };
    }
  }
  if (input.idempotencyKey.startsWith('sales_followup:')) {
    const { canDispatchSalesFollowup } = await import('../../ai/followup-send-guard');
    if (!await canDispatchSalesFollowup(pool, input)) {
      await pool.execute(`UPDATE whatsapp_message_deliveries SET status = 'failed', error_code = 'followup_suppressed',
        status_updated_at = NOW() WHERE idempotency_key = ? AND merchant_id = ? AND status = 'queued'`,
      [input.idempotencyKey, input.merchantId]);
      return { accepted: false, duplicate: false, status: 'failed', errorCode: 'followup_suppressed' };
    }
  }
  if (input.replyGuard) {
    const { canDispatchConversationReply } = await import('../../ai/reply-reservation');
    if (!await canDispatchConversationReply(input, instance.id)) {
      await pool.execute(`UPDATE whatsapp_message_deliveries SET status='failed',error_code='conversation_superseded',status_updated_at=NOW()
        WHERE merchant_id=? AND idempotency_key=? AND status='queued'`, [input.merchantId, input.idempotencyKey]);
      return { accepted: false, duplicate: false, status: 'failed', errorCode: 'conversation_superseded' };
    }
  }
  // Authority checks may wait on SQL locks; an expired worker must not send afterwards.
  if (execution) await execution.assertOwned();
  if (input.idempotencyKey.startsWith('sales_reply:') || input.salesReplyGuard) {
    const { canDispatchSalesReply } = await import('../../ai/sales-reply-delivery');
    if (!await canDispatchSalesReply(input, config)) {
      await pool.execute(`UPDATE whatsapp_message_deliveries SET status='failed',error_code='sales_reply_suppressed',status_updated_at=NOW()
        WHERE merchant_id=? AND idempotency_key=? AND status='queued'`, [input.merchantId, input.idempotencyKey]);
      return { accepted: false, duplicate: false, status: 'failed', errorCode: 'sales_reply_suppressed' };
    }
  }
  const result = await provider.send(config, input).catch((error: any) => ({
    accepted: false as const,
    outcome: 'unknown' as const,
    status: 'failed' as const,
    providerMessageId: undefined,
    errorCode: 'provider_unreachable',
    errorMessage: 'Provider outcome is unknown; reconcile before retrying',
  }));
  const unknown = result.outcome === 'unknown' || (result.accepted && !result.providerMessageId)
    || (!result.accepted && result.errorCode === 'provider_unreachable');
  const accepted = result.accepted && !unknown;
  const errorCode = unknown ? 'provider_unreachable' : result.errorCode;
  const status: WhatsAppDeliveryStatus = accepted ? 'sent' : unknown ? 'queued' : 'failed';
  try {
    const [persisted] = await pool.execute(
      `UPDATE whatsapp_message_deliveries
       SET provider_message_id = ?, status = ?, error_code = ?, error_details = ?, status_updated_at = NOW()
       WHERE idempotency_key = ? AND merchant_id = ? AND status = 'queued'`,
      [
        result.providerMessageId || null,
        status,
        errorCode || null,
        result.errorMessage?.replace(/[\r\n]/g, ' ').slice(0, 500) || null,
        input.idempotencyKey,
        input.merchantId,
      ]
    );
    if (Number((persisted as any)?.affectedRows || 0) !== 1) throw new WhatsAppDeliveryStateError();
  } catch (error) {
    if (execution) execution.uncertainEffect = true;
    if (error instanceof WhatsAppDeliveryStateError) throw error;
    throw new WhatsAppDeliveryStateError();
  }
  if (execution && !accepted) execution.uncertainEffect = true;
  if (input.idempotencyKey.startsWith('sales_followup:') && input.followUpGuard) {
    const { settleSalesFollowupDispatch } = await import('../../ai/followup-send-guard');
    // A settlement failure leaves the durable reservation counted; never free an uncertain slot.
    await settleSalesFollowupDispatch(pool, input.merchantId, input.followUpGuard.id,
      accepted ? 'accepted' : !unknown && result.outcome === 'rejected' ? 'rejected' : 'unknown')
      .catch(() => console.warn('[FollowUp] Dispatch reservation retained for reconciliation'));
  }
  return {
    accepted,
    duplicate: false,
    status,
    providerMessageId: result.providerMessageId,
    errorCode,
  };
}

export async function updateWhatsAppDeliveryStatus(input: {
  provider: WhatsAppProviderKind;
  providerAccount: string;
  providerMessageId: string;
  status: Extract<WhatsAppDeliveryStatus, 'sent' | 'delivered' | 'read' | 'failed'>;
  errorCode?: string;
}): Promise<'updated' | 'ignored' | 'not_found'> {
  if (!input.providerAccount || input.providerAccount.length > 100) throw new Error('Missing delivery account');
  await ensureChannelSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const [rows] = await pool.execute(
    `SELECT d.id, d.status FROM whatsapp_message_deliveries d
     JOIN whatsapp_instances i ON i.id = d.instance_id AND i.merchant_id = d.merchant_id
     WHERE d.provider = ? AND d.provider_message_id = ? AND d.direction = 'outgoing'
       AND i.provider = d.provider AND i.instance_id = ? LIMIT 2`,
    [input.provider, input.providerMessageId, input.providerAccount]
  );
  if ((rows as any[]).length !== 1) return 'not_found';
  const existing = (rows as any[])?.[0];
  if (!existing) return 'not_found';
  const currentStatus = existing.status as WhatsAppDeliveryStatus;
  if (
    currentStatus === 'failed'
    || (input.status === 'failed' && ['delivered', 'read'].includes(currentStatus))
    || (input.status !== 'failed' && STATUS_RANK[input.status] < STATUS_RANK[currentStatus])
  ) return 'ignored';
  const [result] = await pool.execute(
    `UPDATE whatsapp_message_deliveries
     SET status = ?, error_code = ?, status_updated_at = NOW()
     WHERE id = ? AND status = ?`,
    [input.status, input.errorCode?.slice(0, 100) || null, existing.id, currentStatus]
  );
  return (result as any)?.affectedRows === 1 ? 'updated' : 'ignored';
}

export async function recordInboundWhatsAppReceipt(input: {
  merchantId: number;
  instanceRecordId: number;
  provider: WhatsAppProviderKind;
  providerMessageId: string;
}): Promise<'recorded' | 'duplicate'> {
  await ensureChannelSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  try {
    await pool.execute(
      `INSERT INTO whatsapp_message_deliveries
        (merchant_id, instance_id, provider, provider_message_id, idempotency_key, direction, status)
       VALUES (?, ?, ?, ?, ?, 'incoming', 'received')`,
      [input.merchantId, input.instanceRecordId, input.provider, input.providerMessageId,
        whatsAppEventEffectKey(input.merchantId, String(input.instanceRecordId), input.providerMessageId, `inbound:${input.provider}`)]
    );
    return 'recorded';
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') return 'duplicate';
    throw error;
  }
}
