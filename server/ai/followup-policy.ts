import { z } from 'zod';
import type { Pool } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { checkoutTransaction } from './checkout-agreements';
import { defaultFollowupPolicy, followupPolicySchema } from '../../shared/followup-policy';

export const followupPolicyUpdateSchema = z.object({ policy: followupPolicySchema, expectedRevision: z.number().int().nonnegative() }).strict();
export async function getFollowupPolicy(merchantId: number, executor?: Pick<Pool, 'execute'>) {
  z.number().int().positive().parse(merchantId);
  const pool = executor || await getPool(); if (!pool) throw new Error('Follow-up settings unavailable');
  const [rows] = await pool.execute<any[]>(`SELECT m.timezone AS merchant_timezone, p.* FROM merchants m
    LEFT JOIN sales_followup_policies p ON p.merchant_id=m.id WHERE m.id=?`, [merchantId]);
  if (!rows[0]) throw new Error('Follow-up merchant unavailable');
  const row = rows[0];
  return { revision: Number(row.revision || 0), policy: followupPolicySchema.parse(row.merchant_id ? {
    enabled: Boolean(row.enabled), timeZone: row.time_zone, startHour: row.start_hour, endHour: row.end_hour, weeklyLimit: row.weekly_limit,
  } : { ...defaultFollowupPolicy, timeZone: row.merchant_timezone }) };
}
export async function updateFollowupPolicy(input: z.infer<typeof followupPolicyUpdateSchema> & { merchantId: number; actorUserId: number }) {
  const data = followupPolicyUpdateSchema.parse({ policy: input.policy, expectedRevision: input.expectedRevision });
  z.number().int().positive().parse(input.merchantId); z.number().int().positive().parse(input.actorUserId);
  return checkoutTransaction(async connection => {
    const [merchant] = await connection.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE', [input.merchantId]);
    if (!merchant.length) throw new Error('Follow-up merchant unavailable');
    const current = await getFollowupPolicy(input.merchantId, connection);
    if (current.revision !== data.expectedRevision) throw new Error('Follow-up settings changed');
    const p = data.policy;
    await connection.execute(`INSERT INTO sales_followup_policies (merchant_id,enabled,time_zone,start_hour,end_hour,weekly_limit,revision,updated_by)
      VALUES (?,?,?,?,?,?,1,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),time_zone=VALUES(time_zone),start_hour=VALUES(start_hour),
      end_hour=VALUES(end_hour),weekly_limit=VALUES(weekly_limit),revision=revision+1,updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP(3)`,
    [input.merchantId, p.enabled ? 1 : 0, p.timeZone, p.startHour, p.endHour, p.weeklyLimit, input.actorUserId]);
    return { policy: p, revision: current.revision + 1 };
  });
}
