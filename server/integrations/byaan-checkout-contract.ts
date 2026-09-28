import { z } from 'zod';
const id = z.string().regex(/^[1-9][0-9]{0,14}$/);
export const byaanCheckoutInput = z.object({ courseId: id, sessionId: id.optional() }).strict();
const receipt = z.object({
  success: z.literal(true), kind: z.literal('checkout_invitation'), course_id: id, session_id: id.nullable(),
  requires_session: z.boolean(), available: z.boolean(), currency: z.literal('SAR'),
  amount_minor: z.number().int().nonnegative().max(9_999_999_999), tax_minor: z.number().int().nonnegative().max(9_999_999_999),
  checkout_url: z.string().url().max(2048).nullable(), quoted_at: z.string().datetime({ offset: true }),
  price_guaranteed: z.literal(false), payment_status: z.literal('not_created'), enrollment_status: z.literal('not_created'),
  sessions: z.array(z.object({ id: z.number().int().positive().safe(), date: z.string().nullable(), time: z.string().nullable(), available: z.boolean() }).strict()).max(500),
}).strict();

export function readByaanCheckoutQuote(raw: unknown, input: z.infer<typeof byaanCheckoutInput>, domain: string, now = Date.now()) {
  const value = receipt.parse(raw);
  if (value.course_id !== input.courseId || value.session_id !== (input.sessionId ?? null)
    || Math.abs(now - Date.parse(value.quoted_at)) > 300_000
    || (value.available && (value.requires_session || !value.checkout_url))
    || (!value.available && value.checkout_url !== null)) throw Error('Invalid checkout invitation');
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
