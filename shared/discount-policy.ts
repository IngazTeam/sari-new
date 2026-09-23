import { z } from 'zod';

export const discountPolicySchema = z.object({
  enabled: z.boolean(),
  maxPercent: z.number().int().min(1).max(50),
  expireHours: z.number().int().min(1).max(168),
}).strict();
export type DiscountPolicy = z.infer<typeof discountPolicySchema>;
export const defaultDiscountPolicy: DiscountPolicy = { enabled: false, maxPercent: 15, expireHours: 48 };
export const discountPolicyUpdateSchema = z.object({
  policy: discountPolicySchema,
  expectedRevision: z.number().int().min(0).max(2147483646),
  evidence: z.string().regex(/^[a-f0-9]{64}$/),
  reviewed: z.literal(true),
}).strict();

export const discountSettingsKeys = ['autoDiscountEnabled', 'autoDiscountMaxPercent', 'autoDiscountExpireHours', 'autoDiscountRevision'] as const;
export function hasDiscountSettings(input: object): boolean {
  return discountSettingsKeys.some(key => Object.prototype.hasOwnProperty.call(input, key));
}
