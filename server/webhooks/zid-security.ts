import crypto from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db';
import { privacyHashExact } from '../accounts/privacy-hash';
import {
  parseZidSettings,
  zidWebhookPolicy,
  type ZidWebhookPolicy,
} from '../integrations/zid-settings';

const ENDPOINT_PATTERN = /^[a-f0-9]{48}$/;
const AUTHORIZATION_PATTERN = /^Basic [A-Za-z0-9+/]+={0,2}$/;
const WEBHOOK_USERNAME = 'sari';
const CLAIM_LEASE_MINUTES = 10;

type AuthRow = RowDataPacket & {
  merchantId: number;
  webhookAuthHash: string;
  settings: string | null;
};

type ReceiptRow = RowDataPacket & {
  id: number;
  status: 'pending' | 'processed' | 'failed';
  attemptCount: number;
  claimedAt: Date | string | null;
};

export type ZidWebhookClaim = {
  claimed: boolean;
  receiptId: number;
  payloadHash: string;
  attemptCount: number;
  previousStatus?: 'pending' | 'processed';
};

function constantTimeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createZidBasicAuthorization(password: string): string {
  return `Basic ${Buffer.from(`${WEBHOOK_USERNAME}:${password}`, 'utf8').toString('base64')}`;
}

export async function rotateZidWebhookCredentials(merchantId: number): Promise<{
  endpointPath: string;
  username: string;
  password: string;
}> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');

  const [eligible] = await pool.execute<RowDataPacket[]>(
    `SELECT pi.id
       FROM platform_integrations pi
       INNER JOIN merchants m ON m.id = pi.merchant_id
      WHERE pi.merchant_id = ? AND pi.platform_type = 'zid'
        AND pi.is_active = 1 AND m.status = 'active'
      LIMIT 1`,
    [merchantId],
  );
  if (!eligible[0]) throw new Error('ZID_INTEGRATION_NOT_ACTIVE');

  for (let attempt = 0; attempt < 3; attempt++) {
    const endpointId = crypto.randomBytes(24).toString('hex');
    const password = crypto.randomBytes(32).toString('base64url');
    const authorization = createZidBasicAuthorization(password);
    try {
      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE platform_integrations
            SET webhook_endpoint_id = ?, webhook_auth_hash = ?, updated_at = NOW()
          WHERE id = ? AND merchant_id = ? AND platform_type = 'zid' AND is_active = 1`,
        [endpointId, privacyHashExact(authorization), Number(eligible[0].id), merchantId],
      );
      if (result.affectedRows !== 1) throw new Error('ZID_INTEGRATION_NOT_ACTIVE');
      return {
        endpointPath: `/api/webhooks/zid/${endpointId}`,
        username: WEBHOOK_USERNAME,
        password,
      };
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_ENTRY' || attempt === 2) throw error;
    }
  }
  throw new Error('ZID_WEBHOOK_CREDENTIAL_ROTATION_FAILED');
}

export async function authenticateZidWebhook(
  endpointId: string,
  authorization: string | undefined,
): Promise<{ merchantId: number; policy: ZidWebhookPolicy } | null> {
  if (!ENDPOINT_PATTERN.test(endpointId)) return null;
  if (!authorization || authorization.length > 512 || !AUTHORIZATION_PATTERN.test(authorization)) return null;

  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');
  const [rows] = await pool.execute<AuthRow[]>(
    `SELECT pi.merchant_id AS merchantId, pi.webhook_auth_hash AS webhookAuthHash,
            pi.settings AS settings
       FROM platform_integrations pi
       INNER JOIN merchants m ON m.id = pi.merchant_id
      WHERE pi.webhook_endpoint_id = ? AND pi.platform_type = 'zid'
        AND pi.is_active = 1 AND m.status = 'active'
        AND pi.webhook_auth_hash IS NOT NULL
      LIMIT 1`,
    [endpointId],
  );
  const row = rows[0];
  if (!row?.webhookAuthHash) return null;
  if (!constantTimeHexEqual(privacyHashExact(authorization), row.webhookAuthHash)) return null;
  return {
    merchantId: Number(row.merchantId),
    policy: zidWebhookPolicy(parseZidSettings(row.settings)),
  };
}

export function hashZidWebhookPayload(rawBody: Buffer): string {
  return crypto.createHash('sha256').update(rawBody).digest('hex');
}

export async function claimZidWebhook(input: {
  merchantId: number;
  rawBody: Buffer;
  eventType: string;
  externalWebhookId?: string;
}): Promise<ZidWebhookClaim> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');
  const payloadHash = hashZidWebhookPayload(input.rawBody);
  const externalWebhookId = input.externalWebhookId?.slice(0, 255) || null;

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO zid_webhooks
        (merchant_id, webhook_id, event_type, payload, payload_hash, status, attempt_count, claimed_at)
       VALUES (?, ?, ?, '{}', ?, 'pending', 1, NOW())`,
      [input.merchantId, externalWebhookId, input.eventType, payloadHash],
    );
    return { claimed: true, receiptId: Number(result.insertId), payloadHash, attemptCount: 1 };
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_ENTRY') throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<ReceiptRow[]>(
      `SELECT id, status, attempt_count AS attemptCount, claimed_at AS claimedAt
         FROM zid_webhooks
        WHERE merchant_id = ? AND payload_hash = ?
        LIMIT 1 FOR UPDATE`,
      [input.merchantId, payloadHash],
    );
    const receipt = rows[0];
    if (!receipt) throw new Error('ZID_WEBHOOK_RECEIPT_MISSING');

    const reclaimable = receipt.status === 'failed'
      || (receipt.status === 'pending'
        && (!receipt.claimedAt
          || new Date(receipt.claimedAt).getTime() <= Date.now() - CLAIM_LEASE_MINUTES * 60_000));
    if (reclaimable) {
      await connection.execute(
        `UPDATE zid_webhooks
            SET status = 'pending', attempt_count = attempt_count + 1, claimed_at = NOW(),
                processed_at = NULL, error_message = NULL
          WHERE id = ?`,
        [receipt.id],
      );
      await connection.commit();
      return {
        claimed: true,
        receiptId: receipt.id,
        payloadHash,
        attemptCount: Number(receipt.attemptCount) + 1,
      };
    }

    await connection.commit();
    return {
      claimed: false,
      receiptId: receipt.id,
      payloadHash,
      attemptCount: Number(receipt.attemptCount),
      previousStatus: receipt.status === 'processed' ? 'processed' : 'pending',
    };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

export async function completeZidWebhook(receiptId: number, attemptCount: number): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');
  await pool.execute(
    `UPDATE zid_webhooks
        SET status = 'processed', processed_at = NOW(), error_message = NULL
      WHERE id = ? AND status = 'pending' AND attempt_count = ?`,
    [receiptId, attemptCount],
  );
}

export async function failZidWebhook(receiptId: number, attemptCount: number): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');
  await pool.execute(
    `UPDATE zid_webhooks
        SET status = 'failed', processed_at = NOW(), error_message = 'ZID_WEBHOOK_PROCESSING_FAILED'
      WHERE id = ? AND status = 'pending' AND attempt_count = ?`,
    [receiptId, attemptCount],
  );
}
