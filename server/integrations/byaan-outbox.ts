import crypto from 'node:crypto';
import { getPool } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { decryptSecret, encryptSecret } from '../security/secrets';
import {
  buildByaanCanonicalRequest,
  createPinnedByaanHttpsAgent,
  normalizeByaanTenantDomain,
  signByaanRequest,
} from './byaan-security';

type ByaanLifecycleEvent = 'subscription.activated' | 'subscription.deactivated';

let workerTimer: NodeJS.Timeout | null = null;
let workerRunning = false;

async function ensureOutboxSchema() {
  await assertRuntimeSchema('Byaan outbox', [
    { table: 'byaan_outbox', columns: ['event_key', 'signing_secret', 'available_at'] },
  ]);
}

export async function enqueueByaanLifecycleEvent(input: {
  merchantId: number;
  tenantDomain: string;
  event: ByaanLifecycleEvent;
  signingSecret: string;
  plan?: string;
  executor?: { execute: (sql: string, values?: any[]) => Promise<any> };
}): Promise<string> {
  await ensureOutboxSchema();
  if (input.signingSecret.length < 32) throw new Error('A 32-character Byaan signing secret is required');
  const pool = input.executor || await getPool();
  if (!pool) throw new Error('Database unavailable');
  const tenantDomain = normalizeByaanTenantDomain(input.tenantDomain);
  const eventKey = crypto.randomUUID();
  const payload = JSON.stringify({
    event: input.event,
    merchant_id: String(input.merchantId),
    delivery_id: eventKey,
    data: {
      tenant_domain: tenantDomain,
      plan: input.plan || 'sari_starter',
      occurred_at: new Date().toISOString(),
    },
  });
  await pool.execute(
    `INSERT INTO byaan_outbox
      (merchant_id, event_key, event_type, tenant_domain, payload, signing_secret, status, available_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())`,
    [input.merchantId, eventKey, input.event, tenantDomain, payload, encryptSecret(input.signingSecret)]
  );
  return eventKey;
}

async function claimOutboxRows(limit: number): Promise<any[]> {
  const pool = await getPool();
  if (!pool) return [];
  await pool.execute(
    `UPDATE byaan_outbox
     SET status = 'failed', available_at = NOW(), last_error = 'Recovered stale processing lease'
     WHERE status = 'processing' AND last_attempt_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)`
  );
  const [rows] = await pool.execute(
    `SELECT id FROM byaan_outbox
     WHERE status IN ('pending', 'failed') AND available_at <= NOW() AND attempts < 8
     ORDER BY available_at ASC, id ASC LIMIT ${Math.max(1, Math.min(limit, 25))}`
  );
  const claimed: any[] = [];
  for (const candidate of rows as any[]) {
    const [result] = await pool.execute(
      `UPDATE byaan_outbox SET status = 'processing', attempts = attempts + 1, last_attempt_at = NOW()
       WHERE id = ? AND status IN ('pending', 'failed') AND available_at <= NOW()`,
      [candidate.id]
    );
    if ((result as any).affectedRows === 1) {
      const [claimedRows] = await pool.execute(`SELECT * FROM byaan_outbox WHERE id = ? LIMIT 1`, [candidate.id]);
      if ((claimedRows as any[])[0]) claimed.push((claimedRows as any[])[0]);
    }
  }
  return claimed;
}

async function dispatchOutboxRow(row: any): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  try {
    const tenantDomain = normalizeByaanTenantDomain(row.tenant_domain);
    const url = `https://${tenantDomain}/api/sari/webhook`;
    const rawBody = Buffer.from(String(row.payload), 'utf8');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const deliveryId = String(row.event_key);
    const secret = decryptSecret(String(row.signing_secret));
    if (!secret || secret.length < 32) throw new Error('Missing Byaan signing secret');
    const canonical = buildByaanCanonicalRequest({
      timestamp,
      deliveryId,
      method: 'POST',
      path: '/api/sari/webhook',
      tenantDomain,
      rawBody,
    });
    const httpsAgent = await createPinnedByaanHttpsAgent(url);
    const axios = (await import('axios')).default;
    // Send the exact bytes that were signed; never let a serializer change the
    // canonical body between HMAC generation and the network write.
    const response = await axios.post(url, rawBody, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Sari-Timestamp': timestamp,
        'X-Sari-Delivery-Id': deliveryId,
        'X-Sari-Signature': signByaanRequest(canonical, secret),
      },
      timeout: 10_000,
      maxRedirects: 0,
      httpsAgent,
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`Byaan returned HTTP ${response.status}`);
    await pool.execute(
      `UPDATE byaan_outbox SET status = 'delivered', delivered_at = NOW(), last_error = NULL WHERE id = ? AND status = 'processing'`,
      [row.id]
    );
  } catch (error: any) {
    const attempts = Number(row.attempts || 1);
    const delaySeconds = Math.min(3600, 30 * (2 ** Math.max(0, attempts - 1)));
    const safeError = String(error?.message || 'Byaan delivery failed').replace(/[\r\n]/g, ' ').slice(0, 500);
    await pool.execute(
      `UPDATE byaan_outbox
       SET status = 'failed', available_at = DATE_ADD(NOW(), INTERVAL ? SECOND), last_error = ?
       WHERE id = ? AND status = 'processing'`,
      [delaySeconds, safeError, row.id]
    );
  }
}

export async function runByaanOutboxBatch(limit = 10): Promise<number> {
  if (workerRunning) return 0;
  workerRunning = true;
  try {
    await ensureOutboxSchema();
    const rows = await claimOutboxRows(limit);
    for (const row of rows) await dispatchOutboxRow(row);
    return rows.length;
  } finally {
    workerRunning = false;
  }
}

export function startByaanOutboxWorker(intervalMs = 30_000): void {
  if (workerTimer) return;
  const tick = () => runByaanOutboxBatch().catch(error => {
    console.error('[Byaan Outbox] batch failed:', error instanceof Error ? error.message : 'unknown error');
  });
  void tick();
  workerTimer = setInterval(tick, Math.max(intervalMs, 10_000));
  workerTimer.unref?.();
}
