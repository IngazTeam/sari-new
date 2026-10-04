import { subscriptionTimestamp } from '../../shared/subscription-usage';
import { timingSafeEqual } from 'node:crypto';
import { withMerchantOwnerSettings, MerchantSettingsAuthorityError } from '../accounts/merchant-settings-authority';
import { privacyHashExact } from '../accounts/privacy-hash';
import { calculateProrationValues } from '../_core/subscriptionManager';
import { billingCurrency, billingPriceMinor } from './billing-price';
import { checkoutReviewSchema } from '../../shared/subscription-checkout-review';
export class CheckoutReviewError extends Error {
  constructor(readonly reason: 'unavailable' | 'stale' | 'invalid' | 'unchanged') { super('checkout_review:' + reason); }
}
const date = (value: unknown): Date => {
  const result = value instanceof Date ? value : new Date(subscriptionTimestamp(value) ?? NaN);
  if (!Number.isFinite(result.getTime())) throw new CheckoutReviewError('invalid');
  return result;
};
async function rows(tx: any, sql: string, args: unknown[]) {
  const [result] = await tx.execute(sql, args);
  if (!Array.isArray(result)) throw new CheckoutReviewError('unavailable');
  return result as Record<string, any>[];
}
/** A side-effect-free review. Reads never expire or activate subscriptions. */
export async function readCheckoutReview(actorId: number, merchantId: number, planId: number, cycle: 'monthly' | 'yearly', proof?: { reviewedAt: string; token: string }) {
  return withMerchantOwnerSettings(actorId, merchantId, false, async (tx, authority) => {
    if (!authority.canManage) throw new MerchantSettingsAuthorityError('forbidden');
    const [clock] = await rows(tx, 'SELECT UTC_TIMESTAMP(3) AS checked_at', []);
    const now = date(clock?.checked_at), reviewedAt = proof ? date(proof.reviewedAt) : now;
    if (now.getTime() < reviewedAt.getTime() || now.getTime() - reviewedAt.getTime() >= 300_000) throw new CheckoutReviewError('stale');
    const [plan] = await rows(tx, `SELECT id,name,name_en,monthly_price,yearly_price,currency,is_active,updated_at,
      max_customers,max_whatsapp_numbers,conversation_limit,message_limit,voice_message_limit,features
      FROM subscription_plans WHERE id=? AND is_active=1 FOR SHARE`, [planId]);
    if (!plan) throw new CheckoutReviewError('invalid');
    const subscriptions = await rows(tx, `SELECT id,plan_id,status,billing_cycle,start_date,end_date,trial_ends_at
      FROM merchant_subscriptions WHERE merchant_id=? AND status IN ('active','trial') ORDER BY id LIMIT 2 FOR SHARE`, [merchantId]);
    if (subscriptions.length > 1) throw new CheckoutReviewError('invalid');
    let current = subscriptions[0];
    if (current) {
      if (!['monthly', 'yearly'].includes(current.billing_cycle)) throw new CheckoutReviewError('invalid');
      const end = date(current.end_date).getTime(), start = date(current.start_date).getTime();
      const effectiveEnd = current.status === 'trial' && current.trial_ends_at !== null ? Math.min(end, date(current.trial_ends_at).getTime()) : end;
      if (start >= end || now.getTime() < start) throw new CheckoutReviewError('invalid');
      if (now.getTime() >= effectiveEnd) current = undefined as any;
    }
    const priceMinor = billingPriceMinor(cycle === 'monthly' ? plan.monthly_price : plan.yearly_price), currency = billingCurrency(plan.currency);
    let creditMinor = 0, daysRemaining = 0, oldPlan: Record<string, any> | null = null;
    if (current?.status === 'active') {
      if (current.plan_id === planId && current.billing_cycle === cycle) throw new CheckoutReviewError('unchanged');
      if (!current.plan_id) throw new CheckoutReviewError('invalid');
      const found = await rows(tx, 'SELECT id,monthly_price,yearly_price,currency,updated_at FROM subscription_plans WHERE id=? FOR SHARE', [current.plan_id]);
      oldPlan = found[0]; if (!oldPlan) throw new CheckoutReviewError('invalid');
      const result = calculateProrationValues({ startDate: date(current.start_date), endDate: date(current.end_date), status: current.status, billingCycle: current.billing_cycle },
        { monthlyPrice: oldPlan.monthly_price, yearlyPrice: oldPlan.yearly_price, currency: oldPlan.currency },
        { monthlyPrice: plan.monthly_price, yearlyPrice: plan.yearly_price, currency: plan.currency }, cycle, now.getTime());
      creditMinor = Math.round(result.creditAmount * 100); daysRemaining = result.daysRemaining;
    }
    const fields = { actorId, merchantId, planId, nameAr: plan.name, nameEn: plan.name_en, billingCycle: cycle,
      mode: current ? 'upgrade' as const : 'subscribe' as const, subscriptionId: current?.id ?? null,
      previous: current ? { planId: current.plan_id, billingCycle: current.billing_cycle, status: current.status, startDate: date(current.start_date).toISOString(), endDate: date(current.end_date).toISOString() } : null,
      currency, priceMinor, creditMinor, chargeMinor: Math.max(0, priceMinor - creditMinor), daysRemaining,
      reviewedAt: reviewedAt.toISOString(), expiresAt: new Date(reviewedAt.getTime() + 300_000).toISOString() };
    const token = privacyHashExact(JSON.stringify({ purpose: 'subscription-checkout-review-v1', fields, plan, current: current ?? null, oldPlan }));
    if (proof && (!/^[a-f0-9]{64}$/.test(proof.token) || !timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(proof.token, 'hex')))) throw new CheckoutReviewError('stale');
    return checkoutReviewSchema.parse({ ...fields, token });
  });
}
