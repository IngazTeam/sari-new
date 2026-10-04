import { z } from 'zod';
export const loyaltyId = z.number().int().positive().max(2147483647);
export const loyaltyPointsAmount = z.number().int().min(0).max(10000000);
export const loyaltyPhone = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,20}$/);
export const loyaltyFlag = z.number().int().min(0).max(1);
const label = z.string().trim().min(1).max(255);
const text = z.string().max(10000);
export const loyaltyPage = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).max(1000000).default(0),
});
export const loyaltySettingsInput = z.object({
  isEnabled: loyaltyFlag,
  pointsPerCurrency: loyaltyPointsAmount,
  currencyPerPoint: z.number().int().min(1).max(1000000),
  enableReferralBonus: loyaltyFlag,
  referralBonusPoints: loyaltyPointsAmount,
  enableReviewBonus: loyaltyFlag,
  reviewBonusPoints: loyaltyPointsAmount,
  enableBirthdayBonus: loyaltyFlag,
  birthdayBonusPoints: loyaltyPointsAmount,
  pointsExpiryDays: z.number().int().min(0).max(3650),
});
export const loyaltyDefaults = {
  isEnabled: 0,
  pointsPerCurrency: 1,
  currencyPerPoint: 10,
  enableReferralBonus: 0,
  referralBonusPoints: 50,
  enableReviewBonus: 0,
  reviewBonusPoints: 10,
  enableBirthdayBonus: 0,
  birthdayBonusPoints: 20,
  pointsExpiryDays: 365,
} as const;
export const loyaltyTierInput = z.object({
  name: label.max(100),
  nameAr: label.max(100),
  minPoints: loyaltyPointsAmount,
  discountPercentage: z.number().int().min(0).max(100),
  freeShipping: loyaltyFlag,
  priority: z.number().int().min(0).max(10000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().min(1).max(50),
  benefits: text.nullable(),
});
const date = z
  .string()
  .datetime({ offset: true })
  .refine(
    v => new Date(v).getTime() < 2147483647000 && new Date(v).getTime() > 0
  )
  .nullable();
export const loyaltyRewardInput = z.object({
  title: label,
  titleAr: label,
  description: text.optional().nullable(),
  descriptionAr: text.optional().nullable(),
  type: z.enum(['discount', 'free_product', 'free_shipping', 'gift']),
  pointsCost: loyaltyPointsAmount.refine(v => v > 0),
  discountAmount: loyaltyPointsAmount.optional().nullable(),
  discountType: z.enum(['fixed', 'percentage']).optional().nullable(),
  productId: loyaltyId.optional().nullable(),
  maxRedemptions: loyaltyPointsAmount.optional().nullable(),
  isActive: loyaltyFlag.default(1),
  validFrom: date.optional(),
  validUntil: date.optional(),
  imageUrl: z
    .union([
      z.literal(''),
      z
        .string()
        .url()
        .max(500)
        .refine(v => new URL(v).protocol === 'https:'),
    ])
    .optional()
    .nullable(),
  termsAndConditions: text.optional().nullable(),
  termsAndConditionsAr: text.optional().nullable(),
});
export const loyaltyAdjustmentInput = z.object({
  customerPhone: loyaltyPhone,
  points: loyaltyPointsAmount.refine(v => v > 0),
  reason: label,
  reasonAr: label,
  orderId: loyaltyId.optional(),
});
export function validLoyaltyReward(value: unknown) {
  return loyaltyRewardInput
    .superRefine((v, ctx) => {
      if (
        v.type === 'discount' &&
        (!(Number(v.discountAmount) > 0) ||
          !v.discountType ||
          (v.discountType === 'percentage' && Number(v.discountAmount) > 100))
      )
        ctx.addIssue({
          code: 'custom',
          path: ['discountAmount'],
          message: 'loyalty:discount_invalid',
        });
      if (v.type === 'free_product' && !v.productId)
        ctx.addIssue({
          code: 'custom',
          path: ['productId'],
          message: 'loyalty:product_required',
        });
      if (
        v.validFrom &&
        v.validUntil &&
        new Date(v.validFrom) >= new Date(v.validUntil)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['validUntil'],
          message: 'loyalty:date_range',
        });
    })
    .parse(value);
}

/** Availability is evidence at read time, never a promise that checkout already applied a benefit. */
export function rewardAvailable(
  reward: {
    isActive: number;
    pointsCost: number;
    maxRedemptions: number | null;
    currentRedemptions: number;
    validFrom: string | null;
    validUntil: string | null;
  },
  now = Date.now()
) {
  const time = (value: string) =>
    new Date(
      /[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : value.replace(' ', 'T') + 'Z'
    ).getTime();
  return (
    reward.isActive === 1 &&
    Number.isSafeInteger(reward.pointsCost) &&
    reward.pointsCost > 0 &&
    Number.isSafeInteger(reward.currentRedemptions) &&
    reward.currentRedemptions >= 0 &&
    (reward.maxRedemptions == null ||
      reward.maxRedemptions === 0 ||
      (Number.isSafeInteger(reward.maxRedemptions) &&
        reward.maxRedemptions > reward.currentRedemptions)) &&
    (!reward.validFrom ||
      (Number.isFinite(time(reward.validFrom)) &&
        time(reward.validFrom) <= now)) &&
    (!reward.validUntil ||
      (Number.isFinite(time(reward.validUntil)) &&
        time(reward.validUntil) > now))
  );
}
