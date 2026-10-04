import { withMerchantOwnerSettings, MerchantSettingsAuthorityError } from '../accounts/merchant-settings-authority';
import { checkoutAttemptLookup, checkoutAttemptSchema, recordedTapCheckoutUrl } from '../../shared/subscription-checkout-attempt';
import { planPriceMinor } from '../../shared/plan-catalog-workspace';
import { subscriptionTimestamp } from '../../shared/subscription-usage';
import { validateTapCheckoutCharge } from '../payment/payment-link-policy';
const stamp = (v: unknown) => v instanceof Date && Number.isFinite(v.getTime()) ? v.getTime() : subscriptionTimestamp(v);
function object(v: unknown, max: number): Record<string, any> | null {
  if (typeof v !== 'string' || v.length > max) return null;
  try { const value = JSON.parse(v); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; } catch { return null; }
}
const planIdentity = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= 2147483647 ? Number(v) : null;
export function projectCheckoutAttempt(actorId: number, merchantId: number, checkoutAttemptId: string, checkedAt: string, row?: Record<string, any>) {
  const blank = { actorId, merchantId, checkoutAttemptId, checkedAt, found: !!row, transactionId: row?.id ?? null,
    state: row ? 'unknown' as const : 'not_found' as const, planId: null, billingCycle: null, amountMinor: null, currency: null, recordedCheckoutUrl: null, linkExpiresAt: null };
  if (!row) return checkoutAttemptSchema.parse(blank);
  const metadata = object(row.metadata, 10_000), type = row.type;
  const supported = ['subscription', 'upgrade', 'downgrade'].includes(type);
  const planId = supported ? planIdentity(type === 'subscription' ? metadata?.planId : metadata?.newPlanId) : null;
  const rawCycle = type === 'subscription' ? metadata?.billingCycle : metadata?.newBillingCycle;
  const cycle = supported && ['monthly', 'yearly'].includes(rawCycle) ? rawCycle : null;
  const normalizedCurrency = typeof row.currency === 'string' ? row.currency.trim().toUpperCase() : null;
  const currency = (normalizedCurrency === 'SAR' || normalizedCurrency === 'USD') ? normalizedCurrency : null;
  const parsedAmount = planPriceMinor(row.amount), amountMinor = currency && parsedAmount !== null && parsedAmount <= 100_000_000 ? parsedAmount : null;
  const state = ['pending', 'completed', 'failed', 'refunded'].includes(row.status) ? row.status : 'unknown';
  let recordedCheckoutUrl: string | null = null, linkExpiresAt: string | null = null;
  // This is stored checkout evidence only. No provider verification or new charge occurs here.
  if (supported && state === 'pending' && planId && cycle && amountMinor !== null && amountMinor > 0 && currency) {
    const saved = object(row.tap_response, 16_000), expires = stamp(saved?.expires_at);
    const charge = saved && typeof saved.live_mode === 'boolean' ? validateTapCheckoutCharge(saved, { amountInHalalas: amountMinor, currency, testMode: !saved.live_mode }) : null;
    if (charge && charge.id === row.tap_charge_id && expires !== null && expires > Date.parse(checkedAt)) {
      recordedCheckoutUrl = recordedTapCheckoutUrl(charge.paymentUrl);
      if (recordedCheckoutUrl) linkExpiresAt = new Date(expires).toISOString();
    }
  }
  return checkoutAttemptSchema.parse({ ...blank, state, planId, billingCycle: cycle, amountMinor, currency, recordedCheckoutUrl, linkExpiresAt });
}
export async function readCheckoutAttempt(actorId: number, merchantId: number, rawAttemptId: string) {
  const { checkoutAttemptId } = checkoutAttemptLookup.parse({ checkoutAttemptId: rawAttemptId });
  return withMerchantOwnerSettings(actorId, merchantId, false, async (tx, authority) => {
    if (!authority.canManage) throw new MerchantSettingsAuthorityError('forbidden');
    const [clock] = await tx.execute<any[]>('SELECT UTC_TIMESTAMP(3) AS checked_at');
    const now = Array.isArray(clock) ? stamp(clock[0]?.checked_at) : null;
    if (now === null) throw Error('checkout_attempt:unavailable');
    const [rows] = await tx.execute<any[]>(`SELECT id,type,amount,currency,status,metadata,tap_charge_id,tap_response
      FROM payment_transactions WHERE merchant_id=? AND checkout_attempt_id=? LIMIT 2 FOR SHARE`, [merchantId, checkoutAttemptId.toLowerCase()]);
    if (!Array.isArray(rows) || rows.length > 1) throw Error('checkout_attempt:unavailable');
    return projectCheckoutAttempt(actorId, merchantId, checkoutAttemptId.toLowerCase(), new Date(now).toISOString(), rows[0]);
  });
}
