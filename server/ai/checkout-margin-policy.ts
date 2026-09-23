import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { checkoutTransaction } from './checkout-agreements';
import { defaultMarginPolicy, marginPolicySchema, marginPolicyUpdateSchema } from '../../shared/checkout-margin';
import { databaseTimeEpoch } from '../db/time';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function readLockedMarginPolicy(connection: PoolConnection, merchantId: number) {
  z.number().int().positive().parse(merchantId);
  // Before quote/product/order locks. Updates acquire the same parent lock exclusively.
  const [merchant] = await connection.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR SHARE', [merchantId]);
  if (!merchant.length) throw new Error('Margin merchant unavailable');
  const [rows] = await connection.execute<any[]>('SELECT * FROM sales_margin_policies WHERE merchant_id=? FOR SHARE', [merchantId]);
  const row = rows[0];
  if (row && ![0,1].includes(row.enabled)) throw new Error('Invalid margin policy');
  const policy = marginPolicySchema.parse(row ? { enabled: row.enabled === 1, minPercent: row.min_percent } : defaultMarginPolicy);
  const revision = z.number().int().min(0).max(2147483646).parse(row?.revision ?? 0);
  return { policy, revision, evidence: hash({ merchantId, row: row ?? null }) };
}
export async function getMarginPolicy(merchantId: number) {
  return checkoutTransaction(async connection => ({ ...await readLockedMarginPolicy(connection, merchantId), history: await history(connection, merchantId) }));
}
async function history(connection: PoolConnection, merchantId: number) {
  const [rows] = await connection.execute<any[]>(`SELECT revision,actor_user_id,before_policy,after_policy,created_at FROM sales_margin_policy_changes
    WHERE merchant_id=? ORDER BY revision DESC LIMIT 10`, [merchantId]);
  const parse = (p: unknown) => marginPolicySchema.parse(typeof p === 'string' ? JSON.parse(p) : p);
  return rows.map(r => ({ revision: Number(r.revision), actorUserId: Number(r.actor_user_id), beforePolicy: parse(r.before_policy), afterPolicy: parse(r.after_policy),
    createdAt: new Date(databaseTimeEpoch(r.created_at)).toISOString() }));
}
export async function updateMarginPolicy(input: z.infer<typeof marginPolicyUpdateSchema> & { merchantId: number; actorUserId: number }) {
  const data = marginPolicyUpdateSchema.parse({ policy: input.policy, expectedRevision: input.expectedRevision, evidence: input.evidence, reviewed: input.reviewed });
  z.number().int().positive().parse(input.actorUserId); z.number().int().positive().parse(input.merchantId);
  return checkoutTransaction(async connection => {
    await connection.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE', [input.merchantId]);
    const current = await readLockedMarginPolicy(connection, input.merchantId);
    if (current.revision !== data.expectedRevision || current.evidence !== data.evidence) throw new Error('Margin policy changed');
    if (JSON.stringify(current.policy) === JSON.stringify(data.policy)) return { ...current, history: await history(connection, input.merchantId) };
    const revision = current.revision + 1;
    await connection.execute(`INSERT INTO sales_margin_policies (merchant_id,enabled,min_percent,revision) VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),min_percent=VALUES(min_percent),revision=VALUES(revision)`,
    [input.merchantId, data.policy.enabled ? 1 : 0, data.policy.minPercent, revision]);
    await connection.execute(`INSERT INTO sales_margin_policy_changes (merchant_id,actor_user_id,revision,evidence_hash,before_policy,after_policy) VALUES (?,?,?,?,?,?)`,
      [input.merchantId, input.actorUserId, revision, current.evidence, JSON.stringify(current.policy), JSON.stringify(data.policy)]);
    return { ...await readLockedMarginPolicy(connection, input.merchantId), history: await history(connection, input.merchantId) };
  });
}
