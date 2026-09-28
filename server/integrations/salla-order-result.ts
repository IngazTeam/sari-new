import { z } from 'zod';
import { majorToMinor } from '../../shared/product-money';
import { sallaExternalId } from '../../shared/salla-sales-observations';
import { mapSallaOrderStatusSlug } from './salla-order-state';

const id = z.union([sallaExternalId, z.number().int().positive().safe().transform(String)]);
const money = z.object({
  amount: z.union([z.number().finite().nonnegative(), z.string().regex(/^\d+(?:\.\d{1,2})?$/)]),
  currency: z.literal('SAR'),
}).transform(value => {
  const minor = majorToMinor(value.amount);
  if (minor > 2147483647) throw Error('Salla total exceeds storage range');
  return minor;
});
const checkout = z.string().max(2048).nullish().transform(value => {
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw Error('Invalid Salla checkout URL');
  return url.href;
});
const customer = z.object({
  mobile: z.union([z.number().int().positive().safe(), z.string().regex(/^\+?\d{7,15}$/)]),
  mobile_code: z.string().regex(/^\+?[1-9]\d{0,3}$/),
});
const base = z.object({
  id, reference_id: id, currency: z.literal('SAR'),
  amounts: z.object({ total: money }),
  urls: z.object({ checkout }).optional(),
});

/** The existing transport uses a Saudi receiver. Accept its local 05 form or
 * an explicit international number; never compare only a phone suffix. */
export function sallaOrderPhone(raw: string): string {
  const value = z.string().trim().min(7).max(50).regex(/^\+?[\d ()-]+$/).parse(raw).replace(/[ ()-]/g, '');
  if (value.startsWith('+0')) throw Error('Invalid international Salla recipient');
  let digits = value.replace(/^\+/, '').replace(/^00/, '');
  if (/^05\d{8}$/.test(digits)) digits = '966' + digits.slice(1);
  if (!/^[1-9]\d{7,14}$/.test(digits)) throw Error('Invalid Salla recipient');
  return digits;
}
function assertCustomer(raw: unknown, expected: string) {
  const value = customer.parse(raw), code = value.mobile_code.replace(/^\+/, ''), mobile = String(value.mobile);
  if (!expected.startsWith(code)) throw Error('Salla recipient country mismatch');
  // Salla documents national mobile + mobile_code. Explicit full numbers are
  // also accepted, without allowing extra prefixes or arbitrary stripping.
  const full = mobile.startsWith('+') ? mobile.slice(1) : mobile;
  const national = full.replace(/^0/, '');
  if (full !== expected && (mobile.startsWith('+') || code + national !== expected)) throw Error('Salla recipient mismatch');
}

const acknowledgement = z.object({
  status: z.union([z.literal(200), z.literal(201)]).optional(), success: z.literal(true),
  data: base.partial().extend({ id, reference_id: id, customer: customer.optional(),
    draft: z.literal(false).optional(), payment_method: z.literal('cod').optional() }),
});
export function readSallaCreationAcknowledgement(raw: unknown, phone: string) {
  phone = sallaOrderPhone(phone);
  const data = acknowledgement.parse(raw).data;
  if (data.customer) assertCustomer(data.customer, phone);
  return { orderId: data.id, orderNumber: data.reference_id, amountMinor: data.amounts?.total, paymentUrl: data.urls?.checkout };
}
export type SallaCreationAcknowledgement = ReturnType<typeof readSallaCreationAcknowledgement>;

const details = z.object({ status: z.literal(200), success: z.literal(true), data: base.extend({
  customer, draft: z.literal(false), payment_method: z.literal('cod'), status: z.object({ slug: z.string().min(1).max(40) }),
}) });
/** Read-back is deliberately light: Salla removed the expanded details response
 * in September 2026. This proves recipient/identity/amount, not line-item identity. */
export function readSallaCreatedOrder(raw: unknown, expected: SallaCreationAcknowledgement, phone: string) {
  phone = sallaOrderPhone(phone);
  const data = details.parse(raw).data;
  assertCustomer(data.customer, phone);
  if (data.id !== expected.orderId || data.reference_id !== expected.orderNumber
    || expected.amountMinor !== undefined && data.amounts.total !== expected.amountMinor
    || expected.paymentUrl !== undefined && data.urls?.checkout !== expected.paymentUrl) throw Error('Salla creation result changed');
  const state = mapSallaOrderStatusSlug(data.status.slug);
  if (state !== 'pending' && state !== 'processing') throw Error('Salla creation state requires review');
  return { success: true as const, orderId: data.id, orderNumber: data.reference_id,
    amountMinor: data.amounts.total, currency: 'SAR' as const, paymentUrl: data.urls?.checkout, initialStatus: state };
}
