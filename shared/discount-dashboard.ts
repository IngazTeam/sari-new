import { z } from 'zod';
export const discountRecordId = z.number().int().positive().max(2147483647);
const wholeAmount = z.number().int().nonnegative().max(2147483647);
// Stored amounts are whole currency units. Reject driver rounding and invalid UTC dates.
export const discountExpiryDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    && value >= '1971-01-01' && value <= '2037-12-31';
}, 'discounts:invalid_expiry');
export const discountCreateInput = z.object({
  code: z.string().trim().toUpperCase().min(4).max(50).refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'discounts:invalid_code'),
  type: z.enum(['percentage', 'fixed']), value: wholeAmount.refine(value => value > 0, 'discounts:invalid_value'),
  minOrderAmount: wholeAmount.optional(), maxUses: discountRecordId.optional(), expiresAt: discountExpiryDate.optional(),
}).strict().refine(data => data.type !== 'percentage' || data.value <= 100, { path: ['value'], message: 'discounts:invalid_percentage' });
export const discountUpdateInput = z.object({
  id: discountRecordId, expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), isActive: z.boolean().optional(), maxUses: discountRecordId.nullable().optional(), expiresAt: discountExpiryDate.nullable().optional(),
}).strict().refine(data => data.isActive !== undefined || data.maxUses !== undefined || data.expiresAt !== undefined, 'discounts:empty_update');
export const discountTargetInput = z.object({ id: discountRecordId }).strict();
export const discountDeleteInput = discountTargetInput.extend({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type DiscountCreateInput = z.infer<typeof discountCreateInput>;
export type DiscountUpdateInput = z.infer<typeof discountUpdateInput>;
