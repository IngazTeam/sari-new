import axios from 'axios';
import { z } from 'zod';
import { majorToMinor } from '../../shared/product-money';
import { sallaEvidenceExternalId as sallaExternalId, sallaCheckoutReference, sallaOrderEvidence, sallaTransactionEvidence } from '../../shared/salla-checkout-evidence';

const remoteId = z.union([sallaExternalId, z.number().int().positive().safe().transform(String)]);
const amount = z.object({ amount: z.union([z.string(), z.number()]).transform(majorToMinor), currency: z.literal('SAR') });
const state = z.object({ slug: z.string().regex(/^[a-z_]{1,40}$/) });
const orderEnvelope = z.object({ success: z.literal(true), status: z.literal(200), data: z.object({
  id: remoteId, checkout_id: sallaCheckoutReference.nullish(), draft: z.boolean(), currency: z.literal('SAR'),
  status: state, amounts: z.object({ total: amount }),
}) });
const transactionEnvelope = z.object({ success: z.literal(true), status: z.literal(200), data: z.object({
  id: remoteId, references: z.object({ order_id: remoteId, cart_id: remoteId.nullish() }),
  status: state, total: amount,
}) });
export function readSallaOrderEvidence(raw: unknown, expectedId: string) {
  const { data } = orderEnvelope.parse(raw);
  if (data.id !== sallaExternalId.parse(expectedId)) throw Error('Salla order identity mismatch');
  return sallaOrderEvidence.parse({ orderId: data.id, checkoutId: data.checkout_id ?? null,
    status: data.status.slug, draft: data.draft, totalMinor: data.amounts.total.amount, currency: data.currency });
}
export function readSallaTransactionEvidence(raw: unknown, expectedId: string) {
  const { data } = transactionEnvelope.parse(raw);
  if (data.id !== sallaExternalId.parse(expectedId)) throw Error('Salla transaction identity mismatch');
  return sallaTransactionEvidence.parse({ transactionId: data.id, orderId: data.references.order_id,
    cartId: data.references.cart_id ?? null, status: data.status.slug, totalMinor: data.total.amount, currency: data.total.currency });
}
const http = axios.create({ timeout: 10000, maxContentLength: 2 * 1024 * 1024, maxBodyLength: 2 * 1024 * 1024, maxRedirects: 0 });
const base = 'https://api.salla.dev/admin/v2';
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: 'application/json' });
// GET-only, fixed provider origin. Discard PII and Axios errors (which contain
// authorization and raw customer/payment details) at this boundary.
export async function fetchSallaOrderEvidence(token: string, orderId: string) {
  try {
    if (!token) throw Error();
    const id = sallaExternalId.parse(orderId);
    const response = await http.get(`${base}/orders/${id}`, { headers: headers(token), params: { format: 'light' } });
    return readSallaOrderEvidence(response.data, id);
  } catch { throw Error('Salla order evidence unavailable'); }
}
export async function fetchSallaTransactionEvidence(token: string, transactionId: string) {
  try {
    if (!token) throw Error();
    const id = sallaExternalId.parse(transactionId);
    const response = await http.get(`${base}/transactions/${id}`, { headers: headers(token) });
    return readSallaTransactionEvidence(response.data, id);
  } catch { throw Error('Salla transaction evidence unavailable'); }
}
