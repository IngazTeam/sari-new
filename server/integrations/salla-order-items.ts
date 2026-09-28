import { z } from 'zod';
import { sallaExternalId } from '../../shared/salla-sales-observations';

// SKU is an identity, not display text: never strip markup, trim or change case.
export const sallaOrderSku = z.string().min(1).max(100).refine(v => v === v.trim() && !/[\u0000-\u001f\u007f<>]/.test(v));
export const sallaOrderItems = z.array(z.object({
  sallaProductId: sallaExternalId, sku: sallaOrderSku,
  quantity: z.number().int().min(1).max(10000), price: z.number().int().nonnegative().max(2147483647),
}).strict()).min(1).max(100).superRefine((items, ctx) => {
  if (new Set(items.map(p => p.sallaProductId)).size !== items.length
    || new Set(items.map(p => p.sku.toLowerCase())).size !== items.length)
    ctx.addIssue({ code: 'custom', message: 'Ambiguous Salla item selection' });
});
const lineId = z.union([sallaExternalId, z.number().int().positive().safe().transform(String)]);
const response = z.object({ status: z.literal(200), success: z.literal(true), data: z.array(z.object({
  id: lineId, sku: sallaOrderSku, quantity: z.number().int().min(1).max(10000), currency: z.literal('SAR'),
  options: z.array(z.unknown()).max(0),
})).min(1).max(100),
  // This endpoint currently documents an unpaginated list. Never silently accept
  // a future partial-page response as the complete cart.
  pagination: z.never().optional(),
});
/** Order-line IDs are not product IDs. Match the documented SKU and exact
 * quantity against the server-owned selection, with no partial or fuzzy cart. */
export function readSallaOrderItems(raw: unknown, selection: z.infer<typeof sallaOrderItems>) {
  const expected = sallaOrderItems.parse(selection), lines = response.parse(raw).data;
  if (lines.length !== expected.length || new Set(lines.map(p => p.id)).size !== lines.length
    || new Set(lines.map(p => p.sku.toLowerCase())).size !== lines.length) throw Error('Ambiguous Salla order lines');
  return expected.map(item => {
    const line = lines.find(p => p.sku === item.sku);
    if (!line || line.quantity !== item.quantity) throw Error('Salla order items changed');
    return { sallaProductId: item.sallaProductId, sku: item.sku, quantity: item.quantity, orderItemId: line.id };
  });
}
