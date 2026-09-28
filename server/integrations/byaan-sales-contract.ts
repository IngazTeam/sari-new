import { z } from 'zod';
import { normalizeByaanTenantDomain } from './byaan-security';
import { normalizeApiConversionPhone } from './api-conversion-sync-core';

const text = (max: number) => z.string().trim().min(1).max(max)
  .refine(value => !/[\u0000-\u001f\u007f<>]/.test(value), 'Invalid text');
const reference = z.union([
  z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/),
  z.number().int().positive().safe().transform(String),
]);
const course = z.union([z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/), z.number().int().positive().safe()]);
const phone = z.string().transform((value, ctx) => {
  try { return normalizeApiConversionPhone(value); }
  catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid phone' }); return z.NEVER; }
});
export const byaanMerchantId = z.number().int().positive().max(2147483647);
export const byaanEnrollmentInput = z.object({
  traineePhone: phone, traineeName: text(255), courseId: course, courseTitle: text(255).optional(),
}).strict();
export const byaanPaymentInput = z.object({
  traineePhone: phone, courseId: course,
  amount: z.number().finite().positive().max(99_999_999.99)
    .refine(value => Math.abs(value * 100 - Math.round(value * 100)) <= 1e-7, 'Invalid amount precision'),
  description: text(255).optional(),
}).strict();

export type ByaanSalesFailure = {
  success: false;
  outcome: 'not_sent' | 'unknown';
  retryable: false;
  error: string;
};
export type ByaanSalesReceipt = {
  success: true;
  outcome: 'reported';
  paymentEvidence: 'not_verified';
  tracking: 'recorded' | 'unavailable';
  conversionId?: number;
};
export function byaanSalesFailure(outcome: ByaanSalesFailure['outcome']): ByaanSalesFailure {
  return { success: false, outcome, retryable: false,
    error: outcome === 'not_sent' ? 'Byaan operation was not sent' : 'Byaan operation requires reconciliation' };
}

function responseObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Invalid Byaan response');
  const value = raw as Record<string, unknown>;
  // Retain the existing bare object contract, but never let a 2xx status hide
  // an explicit rejection or a malformed success flag.
  for (const flag of ['success', 'ok']) {
    if (Object.hasOwn(value, flag) && value[flag] !== true) throw Error('Byaan response not successful');
  }
  if (value.error != null && value.error !== '' && value.error !== false) throw Error('Byaan response has an error');
  if (value.errors != null && (!Array.isArray(value.errors) || value.errors.length)) throw Error('Byaan response has errors');
  return value;
}
function alias<T>(value: Record<string, unknown>, snake: string, camel: string, parse: (v: unknown) => T): T | undefined {
  const a = value[snake] == null ? undefined : parse(value[snake]);
  const b = value[camel] == null ? undefined : parse(value[camel]);
  if (a !== undefined && b !== undefined && a !== b) throw Error('Conflicting Byaan response aliases');
  return a ?? b;
}
function paymentUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(raw)) throw Error('Invalid Byaan payment URL');
  const url = new URL(raw);
  if (!raw.startsWith('https://') || url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) {
    throw Error('Invalid Byaan payment URL');
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (hostname.endsWith('.localhost') || hostname === 'home.arpa' || hostname.endsWith('.home.arpa')) {
    throw Error('Invalid Byaan payment URL');
  }
  // Validate the link syntactically without following it or sending a credential
  // to a payment gateway. This is not an allowlist or verification of that gateway.
  normalizeByaanTenantDomain(hostname);
  return raw;
}
/** Only the flat snake/camel fields already consumed by the live client are
 * accepted here. A provider acknowledgement is not a verified payment fact. */
export function readByaanSalesResult(raw: unknown, operation: 'enrollment' | 'payment') {
  const value = responseObject(raw);
  const externalId = operation === 'enrollment'
    ? alias(value, 'enrollment_id', 'enrollmentId', v => reference.parse(v))
    : alias(value, 'invoice_id', 'invoiceId', v => reference.parse(v));
  const url = alias(value, 'payment_url', 'paymentUrl', paymentUrl);
  if (!externalId || (operation === 'payment' && !url)) throw Error('Incomplete Byaan sales result');
  return { externalId, paymentUrl: url };
}
