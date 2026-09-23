import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { checkoutTransaction } from './checkout-agreements';
import { databaseTimeEpoch } from '../db/time';
import { defaultDiscountPolicy, discountPolicySchema, discountPolicyUpdateSchema } from '../../shared/discount-policy';

const idSchema = z.number().int().positive();
const defaultMessages = {
  welcomeMessage: 'مرحباً! أنا مساعدك الذكي. كيف أقدر أساعدك اليوم؟ 😊',
  outOfHoursMessage: 'شكراً لتواصلك! نحن حالياً خارج أوقات العمل. سنرد عليك في أقرب وقت ممكن ⏰',
};
/** Use the same legacy columns as issuance; never silently enable or broaden existing authority. */
export function discountPolicyFromSettings(row: any) {
  if (![0, 1, false, true].includes(row.autoDiscountEnabled)) throw new Error('Invalid discount authority');
  return discountPolicySchema.parse({ enabled: row.autoDiscountEnabled === 1 || row.autoDiscountEnabled === true,
    maxPercent: row.autoDiscountMaxPercent ?? 15, expireHours: row.autoDiscountExpireHours ?? 48 });
}
export async function lockedDiscountSettings(connection: Pick<PoolConnection, 'execute'>, merchantId: number) {
  // The issuer takes this shared parent lock before the settings row. Policy edits lock
  // the parent first too, avoiding an inverted settings/merchant lock when recording issuance.
  const [merchants] = await connection.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR SHARE', [idSchema.parse(merchantId)]);
  if (!merchants.length) throw new Error('Discount merchant unavailable');
  const [rows] = await connection.execute<any[]>(`SELECT id, auto_discount_enabled AS autoDiscountEnabled,
    auto_discount_max_percent AS autoDiscountMaxPercent, auto_discount_expire_hours AS autoDiscountExpireHours,
    auto_discount_revision AS autoDiscountRevision FROM bot_settings WHERE merchant_id=? FOR UPDATE`, [merchantId]);
  if (rows.length > 1) throw new Error('Ambiguous discount authority');
  return rows[0] ?? null;
}
function snapshot(merchantId: number, row: any) {
  const policy = row ? discountPolicyFromSettings(row) : { ...defaultDiscountPolicy };
  const revision = z.number().int().min(0).max(2147483646).parse(row?.autoDiscountRevision ?? 0);
  const evidence = createHash('sha256').update(JSON.stringify({ merchantId, revision, row })).digest('hex');
  return { policy, revision, evidence };
}
async function lockMerchant(connection: PoolConnection, merchantId: number) {
  const [rows] = await connection.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE', [idSchema.parse(merchantId)]);
  if (!rows.length) throw new Error('Discount merchant unavailable');
}
async function history(connection: PoolConnection, merchantId: number) {
  const [rows] = await connection.execute<any[]>(`SELECT revision, actor_user_id AS actorUserId,
    before_policy AS beforePolicy, after_policy AS afterPolicy, created_at AS createdAt
    FROM sales_discount_policy_changes WHERE merchant_id=? ORDER BY revision DESC LIMIT 10`, [merchantId]);
  return rows.map(row => ({ revision: Number(row.revision), actorUserId: Number(row.actorUserId), createdAt: new Date(databaseTimeEpoch(row.createdAt)).toISOString(), beforePolicy: discountPolicySchema.parse(typeof row.beforePolicy === 'string' ? JSON.parse(row.beforePolicy) : row.beforePolicy),
    afterPolicy: discountPolicySchema.parse(typeof row.afterPolicy === 'string' ? JSON.parse(row.afterPolicy) : row.afterPolicy) }));
}
export async function getDiscountPolicy(merchantId: number) {
  return checkoutTransaction(async connection => {
    await lockMerchant(connection, merchantId);
    return { ...snapshot(merchantId, await lockedDiscountSettings(connection, merchantId)), history: await history(connection, merchantId) };
  });
}
export async function updateDiscountPolicy(input: z.infer<typeof discountPolicyUpdateSchema> & { merchantId: number; actorUserId: number }) {
  const data = discountPolicyUpdateSchema.parse({ policy: input.policy, expectedRevision: input.expectedRevision, evidence: input.evidence, reviewed: input.reviewed });
  idSchema.parse(input.actorUserId);
  return checkoutTransaction(async connection => {
    await lockMerchant(connection, input.merchantId);
    const row = await lockedDiscountSettings(connection, input.merchantId), current = snapshot(input.merchantId, row);
    if (current.revision !== data.expectedRevision || current.evidence !== data.evidence) throw new Error('Discount policy changed');
    if (JSON.stringify(current.policy) === JSON.stringify(data.policy)) return { ...current, history: await history(connection, input.merchantId) };
    const revision = current.revision + 1, p = data.policy;
    if (row) await connection.execute(`UPDATE bot_settings SET auto_discount_enabled=?, auto_discount_max_percent=?,
      auto_discount_expire_hours=?, auto_discount_revision=? WHERE id=? AND merchant_id=?`,
    [p.enabled ? 1 : 0, p.maxPercent, p.expireHours, revision, row.id, input.merchantId]);
    else await connection.execute(`INSERT INTO bot_settings (merchant_id,auto_discount_enabled,auto_discount_max_percent,auto_discount_expire_hours,auto_discount_revision)
      VALUES (?,?,?,?,?)`, [input.merchantId, p.enabled ? 1 : 0, p.maxPercent, p.expireHours, revision]);
    await connection.execute(`INSERT INTO sales_discount_policy_changes (merchant_id,actor_user_id,revision,evidence_hash,before_policy,after_policy)
      VALUES (?,?,?,?,?,?)`, [input.merchantId, input.actorUserId, revision, current.evidence, JSON.stringify(current.policy), JSON.stringify(p)]);
    return { ...snapshot(input.merchantId, await lockedDiscountSettings(connection, input.merchantId)), history: await history(connection, input.merchantId) };
  });
}

/** Serialize default initialization with policy edits. A GET must never create a second monetary authority row. */
export async function ensureBotSettingsRow(merchantId: number): Promise<void> {
  await checkoutTransaction(async connection => {
    await lockMerchant(connection, merchantId);
    const row = await lockedDiscountSettings(connection, merchantId);
    if (!row) await connection.execute(`INSERT INTO bot_settings (merchant_id,welcome_message,out_of_hours_message)
      VALUES (?,?,?)`, [merchantId, defaultMessages.welcomeMessage, defaultMessages.outOfHoursMessage]);
  });
}
