import { createHash, randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { currentInboundExecution, withInboundExecution, type InboundExecution } from './inbound-context';

export const INBOUND_LEASE_SECONDS = 90;
export class InboundLeaseLostError extends Error {
  constructor() { super('Inbound execution lease lost'); this.name = 'InboundLeaseLostError'; }
}
export type InboundJob = RowDataPacket & {
  id: number; merchant_id: number; instance_id: number; event_key: string;
  partition_key: string; payload_json: any; lease_token: string;
  reply_plan_json: any;
};
const hash = (...parts: unknown[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const json = (value: any) => typeof value === 'string' ? JSON.parse(value) : value;

export async function assertInboundSchema() {
  await assertRuntimeSchema('durable WhatsApp ingress', [{
    table: 'whatsapp_inbound_jobs', columns: ['lease_token', 'reply_plan_json', 'partition_key'],
    uniqueIndexes: [{ name: 'uq_inbound_event', columns: ['event_key'] }],
  }]);
}
async function requirePool() {
  const pool = await getPool();
  if (!pool) throw new Error('Inbound database unavailable');
  return pool;
}

/** Caller has authenticated the provider. Tenant identity is resolved in SQL. */
export async function enqueueInbound(input: {
  payload: any; source: 'webhook' | 'polling' | 'meta'; expectedMerchantId?: number;
}): Promise<{ id: number; duplicate: boolean }> {
  const payload = input.payload;
  const provider = input.source === 'meta' ? 'meta_cloud' : 'green_api';
  const account = String(payload?.instanceData?.idInstance || '');
  const messageId = String(payload?.idMessage || '');
  const chatId = String(payload?.senderData?.chatId || '');
  if (payload?.typeWebhook !== 'incomingMessageReceived' || !account || account.length > 100
      || !messageId || messageId.length > 255 || !/^[\d-]+@(?:c\.us|g\.us|s\.whatsapp\.net)$/.test(chatId)
      || !payload.messageData || typeof payload.messageData !== 'object') {
    throw new Error('Invalid inbound message identity');
  }
  // Persist only the processing contract, never authorization headers or provider tokens.
  const sanitized = {
    typeWebhook: payload.typeWebhook, instanceData: { idInstance: account, wid: payload.instanceData.wid },
    idMessage: messageId, timestamp: payload.timestamp, senderData: payload.senderData,
    messageData: payload.messageData, sourceProvider: provider, sourceMessageType: payload.sourceMessageType,
  };
  const encoded = JSON.stringify(sanitized);
  if (Buffer.byteLength(encoded) > 256 * 1024) throw new Error('Inbound message exceeds storage limit');
  await assertInboundSchema();
  const pool = await requirePool();
  const [instances] = await pool.execute<RowDataPacket[]>(
    `SELECT i.id, i.merchant_id AS merchantId FROM whatsapp_instances i JOIN merchants m ON m.id = i.merchant_id
     WHERE i.instance_id = ? AND i.provider = ? AND i.status = 'active' AND m.status <> 'suspended' LIMIT 2`,
    [account, provider],
  );
  if (instances.length !== 1 || (input.expectedMerchantId !== undefined && instances[0].merchantId !== input.expectedMerchantId)) {
    throw new Error('Inbound instance is unavailable');
  }
  const instance = instances[0];
  const eventKey = hash(instance.merchantId, provider, account, messageId);
  // Same customer is serialized across all numbers belonging to the same merchant.
  const partitionKey = hash(instance.merchantId, chatId.replace('@s.whatsapp.net', '@c.us'));
  try {
    const [result] = await pool.execute<any>(
      `INSERT INTO whatsapp_inbound_jobs (merchant_id, instance_id, event_key, partition_key, source, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`, [instance.merchantId, instance.id, eventKey, partitionKey, input.source, encoded],
    );
    return { id: Number(result.insertId), duplicate: false };
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_ENTRY') throw error;
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT id FROM whatsapp_inbound_jobs WHERE event_key = ?', [eventKey]);
    if (!rows.length) throw error;
    return { id: Number(rows[0].id), duplicate: true };
  }
}

export async function recoverExpiredInbound(): Promise<void> {
  const pool = await requirePool();
  // A crash before entering business logic is safely reclaimable. Once entered,
  // an external booking/order/payment may have happened: retain for review.
  await pool.execute(`UPDATE whatsapp_inbound_jobs SET
    status = IF(started_at IS NULL, 'pending', 'review'),
    error_code = IF(started_at IS NULL, NULL, 'worker_interrupted'), lease_token = NULL, lease_until = NULL
    WHERE status = 'running' AND lease_until < UTC_TIMESTAMP(3)`);
}

export async function claimInbound(merchantId?: number): Promise<InboundJob | null> {
  if (merchantId !== undefined && (!Number.isSafeInteger(merchantId) || merchantId <= 0)) throw new Error('Invalid claim partition');
  await assertInboundSchema();
  const pool = await requirePool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<InboundJob[]>(
      `SELECT j.* FROM whatsapp_inbound_jobs j
       WHERE j.status = 'pending' ${merchantId === undefined ? '' : 'AND j.merchant_id = ?'} AND NOT EXISTS (
         SELECT 1 FROM whatsapp_inbound_jobs earlier WHERE earlier.partition_key = j.partition_key
         AND earlier.id < j.id AND earlier.status IN ('pending','running','review'))
       ORDER BY j.id LIMIT 1 FOR UPDATE SKIP LOCKED`, merchantId === undefined ? [] : [merchantId],
    );
    if (!rows.length) { await connection.commit(); return null; }
    const job = rows[0];
    job.lease_token = randomUUID();
    await connection.execute(
      `UPDATE whatsapp_inbound_jobs SET status = 'running', lease_token = ?,
       lease_until = TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(3)), attempts = attempts + 1 WHERE id = ?`,
      [job.lease_token, INBOUND_LEASE_SECONDS, job.id],
    );
    await connection.commit();
    job.payload_json = json(job.payload_json);
    job.reply_plan_json = json(job.reply_plan_json);
    return job;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function assertInboundOwned(job: Pick<InboundJob, 'id' | 'lease_token'>, connection?: PoolConnection) {
  const executor = connection || await requirePool();
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id FROM whatsapp_inbound_jobs WHERE id = ? AND lease_token = ? AND status = 'running'
     AND lease_until > UTC_TIMESTAMP(3)${connection ? ' FOR UPDATE' : ''}`, [job.id, job.lease_token],
  );
  if (rows.length !== 1) throw new InboundLeaseLostError();
}
export async function heartbeatInbound(job: InboundJob): Promise<void> {
  const pool = await requirePool();
  const [result] = await pool.execute<any>(
    `UPDATE whatsapp_inbound_jobs SET lease_until = TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(3))
     WHERE id = ? AND lease_token = ? AND status = 'running' AND lease_until > UTC_TIMESTAMP(3)`,
    [INBOUND_LEASE_SECONDS, job.id, job.lease_token],
  );
  if (result.affectedRows !== 1) throw new InboundLeaseLostError();
}
export async function finishInbound(job: InboundJob, success: boolean, errorCode?: string) {
  const pool = await requirePool();
  const [result] = await pool.execute<any>(
    `UPDATE whatsapp_inbound_jobs SET status = ?, error_code = ?, lease_token = NULL, lease_until = NULL
     WHERE id = ? AND lease_token = ? AND status = 'running' AND lease_until > UTC_TIMESTAMP(3)`,
    [success ? 'completed' : 'review', success ? null : errorCode || 'processing_failed', job.id, job.lease_token],
  );
  if (result.affectedRows !== 1) throw new InboundLeaseLostError();
}
export async function persistInboundReplyPlan(plan: unknown): Promise<void> {
  const context = currentInboundExecution();
  if (!context) return;
  const pool = await requirePool();
  const [result] = await pool.execute<any>(
    `UPDATE whatsapp_inbound_jobs SET reply_plan_json = ? WHERE id = ? AND lease_token = ?
     AND status = 'running' AND lease_until > UTC_TIMESTAMP(3) AND reply_plan_json IS NULL`,
    [JSON.stringify(plan), context.id, context.token],
  );
  if (result.affectedRows !== 1) throw new InboundLeaseLostError();
}

/** Injectable processor lets crash/lease tests run with no paid APIs. */
export async function executeInbound(job: InboundJob, process: (payload: any) => Promise<{ success: boolean }>) {
  const pool = await requirePool();
  let lost = false;
  const timer = setInterval(() => { heartbeatInbound(job).catch(() => { lost = true; }); }, 20_000);
  timer.unref();
  try {
    const [instances] = await pool.execute<RowDataPacket[]>(
      `SELECT i.id FROM whatsapp_instances i JOIN merchants m ON m.id = i.merchant_id
       WHERE i.id = ? AND i.merchant_id = ? AND i.instance_id = ? AND i.provider = ?
         AND i.status = 'active' AND m.status <> 'suspended'`,
      [job.instance_id, job.merchant_id, String(job.payload_json.instanceData.idInstance), job.payload_json.sourceProvider],
    );
    if (instances.length !== 1) { await finishInbound(job, false, 'instance_changed'); return; }
    // Older releases stored raw provider IDs in a globally unique messages
    // column. Do not replay a legacy receipt during the cutover.
    const [legacy] = await pool.execute<RowDataPacket[]>(
      `SELECT msg.isProcessed FROM messages msg JOIN conversations c ON c.id = msg.conversationId
       WHERE msg.externalId = ? AND c.merchantId = ? LIMIT 1`,
      [String(job.payload_json.idMessage), job.merchant_id],
    );
    if (legacy.length) { await finishInbound(job, legacy[0].isProcessed === 1, 'legacy_processing_unconfirmed'); return; }
    const timestamp = Number(job.payload_json?.timestamp);
    const [newer] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM whatsapp_inbound_jobs WHERE partition_key = ? AND id < ? AND status = 'completed'
       AND CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.timestamp')) AS UNSIGNED) > ? LIMIT 1`,
      [job.partition_key, job.id, Number.isFinite(timestamp) ? timestamp : 0],
    );
    if (newer.length) { await finishInbound(job, false, 'late_event'); return; }
    const [started] = await pool.execute<any>(
      `UPDATE whatsapp_inbound_jobs SET started_at = UTC_TIMESTAMP(3) WHERE id = ? AND lease_token = ?
       AND status = 'running' AND lease_until > UTC_TIMESTAMP(3) AND started_at IS NULL`, [job.id, job.lease_token],
    );
    if (started.affectedRows !== 1) throw new InboundLeaseLostError();
    const context: InboundExecution = {
      id: job.id, merchantId: job.merchant_id, instanceId: job.instance_id, token: job.lease_token,
      eventKey: job.event_key, partitionKey: job.partition_key, sendOrdinal: 0,
      assertOwned: async () => { if (lost) throw new InboundLeaseLostError(); await assertInboundOwned(job); },
    };
    // Scope the message identity to tenant + provider account as well as event.
    // The immutable raw provider envelope remains available in the queue row.
    const canonicalPayload = { ...job.payload_json, providerMessageId: job.payload_json.idMessage, idMessage: `inbound:v1:${job.event_key}` };
    const result = await withInboundExecution(context, () => process(canonicalPayload));
    await finishInbound(job, result.success && !context.uncertainEffect, context.uncertainEffect ? 'effect_unconfirmed' : undefined);
  } catch (error) {
    if (!(error instanceof InboundLeaseLostError)) await finishInbound(job, false, 'processing_failed');
    else throw error;
  } finally { clearInterval(timer); }
}
