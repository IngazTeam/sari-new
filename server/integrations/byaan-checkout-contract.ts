import { z } from 'zod';
const id = z.string().regex(/^[1-9][0-9]{0,14}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const time = z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$/).nullable();
const timezone = z.string().min(1).max(100).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
});
export const byaanCheckoutInput = z.object({ courseId: id, sessionId: id.optional() }).strict();
export const byaanCheckoutReceipt = z.object({
  success: z.literal(true), kind: z.literal('checkout_invitation'), course_id: id, session_id: id.nullable(),
  requires_session: z.boolean(), available: z.boolean(), currency: z.literal('SAR'),
  amount_minor: z.number().int().nonnegative().max(9_999_999_999), tax_minor: z.number().int().nonnegative().max(9_999_999_999),
  checkout_url: z.string().url().max(2048).nullable(), quoted_at: z.string().datetime({ offset: true }),
  schedule: z.object({ date, time, timezone }).strict(),
  price_guaranteed: z.literal(false), payment_status: z.literal('not_created'), enrollment_status: z.literal('not_created'),
  sessions: z.array(z.object({ id: z.number().int().positive().max(999_999_999_999_999),
    date, time, available: z.boolean() }).strict()).max(500),
}).strict();
export type ByaanCheckoutQuote = z.infer<typeof byaanCheckoutReceipt>;

export function readByaanCheckoutQuote(raw: unknown, input: z.infer<typeof byaanCheckoutInput>, domain: string, now = Date.now()) {
  const value = byaanCheckoutReceipt.parse(raw);
  if (value.course_id !== input.courseId || value.session_id !== (input.sessionId ?? null)
    || Math.abs(now - Date.parse(value.quoted_at)) > 300_000
    || (value.available && (value.requires_session || !value.checkout_url))
    || (!value.available && value.checkout_url !== null) || value.tax_minor > value.amount_minor
    || (value.requires_session && value.session_id !== null)
    || new Set(value.sessions.map(s => s.id)).size !== value.sessions.length
    || (value.available && value.session_id !== null && !value.sessions.some(s => String(s.id) === value.session_id && s.available
      && s.date === value.schedule.date && s.time === value.schedule.time))) throw Error('Invalid checkout invitation');
  if (value.checkout_url) {
    const url = new URL(value.checkout_url);
    if (url.origin !== `https://${domain}` || url.username || url.password || url.hash
      || !/^\/courses\/[^/]+\/checkout$/.test(url.pathname)
      || Array.from(url.searchParams.keys()).some(key => key !== 'session_id')
      || url.searchParams.getAll('session_id').length > 1
      || url.searchParams.get('session_id') !== (input.sessionId ?? null)) throw Error('Invalid checkout destination');
  }
  return value;
}
