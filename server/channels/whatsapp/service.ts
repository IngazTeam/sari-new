import { getPool, getPrimaryWhatsAppInstance, getWhatsAppInstanceById } from '../../db';
import { assertRuntimeSchema } from '../../db/schema-readiness';
import { getWhatsAppProvider } from './providers';
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

async function ensureChannelSchema() {
  await assertRuntimeSchema('WhatsApp channel', [
    { table: 'whatsapp_instances', columns: ['provider', 'phone_number_id', 'provider_account_id'] },
    { table: 'whatsapp_message_deliveries', columns: ['idempotency_key', 'provider_message_id', 'status'] },
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

  try {
    await pool.execute(
      `INSERT INTO whatsapp_message_deliveries
        (merchant_id, message_id, instance_id, provider, idempotency_key, direction, status)
       VALUES (?, ?, ?, ?, ?, 'outgoing', 'queued')`,
      [input.merchantId, input.messageId || null, instance.id, config.provider, input.idempotencyKey]
    );
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_ENTRY') throw error;
    const [rows] = await pool.execute(
      `SELECT status, provider_message_id, error_code FROM whatsapp_message_deliveries
       WHERE idempotency_key = ? AND merchant_id = ? LIMIT 1`,
      [input.idempotencyKey, input.merchantId]
    );
    const existing = (rows as any[])?.[0];
    if (!existing) throw error;
    return {
      accepted: ['sent', 'delivered', 'read'].includes(existing.status),
      duplicate: true,
      status: existing.status,
      providerMessageId: existing.provider_message_id || undefined,
      errorCode: existing.error_code || undefined,
    };
  }

  const provider = getWhatsAppProvider(config.provider);
  const result = await provider.send(config, input);
  const status: WhatsAppDeliveryStatus = result.accepted ? 'sent' : 'failed';
  await pool.execute(
    `UPDATE whatsapp_message_deliveries
     SET provider_message_id = ?, status = ?, error_code = ?, error_details = ?, status_updated_at = NOW()
     WHERE idempotency_key = ? AND merchant_id = ? AND status = 'queued'`,
    [
      result.providerMessageId || null,
      status,
      result.errorCode || null,
      result.errorMessage?.replace(/[\r\n]/g, ' ').slice(0, 500) || null,
      input.idempotencyKey,
      input.merchantId,
    ]
  );
  return {
    accepted: result.accepted,
    duplicate: false,
    status,
    providerMessageId: result.providerMessageId,
    errorCode: result.errorCode,
  };
}

export async function updateWhatsAppDeliveryStatus(input: {
  provider: WhatsAppProviderKind;
  providerMessageId: string;
  status: Extract<WhatsAppDeliveryStatus, 'sent' | 'delivered' | 'read' | 'failed'>;
  errorCode?: string;
}): Promise<'updated' | 'ignored' | 'not_found'> {
  await ensureChannelSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const [rows] = await pool.execute(
    `SELECT id, status FROM whatsapp_message_deliveries WHERE provider = ? AND provider_message_id = ? LIMIT 1`,
    [input.provider, input.providerMessageId]
  );
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
      [input.merchantId, input.instanceRecordId, input.provider, input.providerMessageId, `inbound:${input.provider}:${input.providerMessageId}`.slice(0, 100)]
    );
    return 'recorded';
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') return 'duplicate';
    throw error;
  }
}
