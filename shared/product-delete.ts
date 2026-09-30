import { z } from "zod";
const id = z.number().int().positive().max(2147483647);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const ids = z
  .array(id)
  .min(1)
  .max(100)
  .refine(values => new Set(values).size === values.length)
  .transform(values => [...values].sort((a, b) => a - b));
export const productDeleteReviewInput = z.object({ ids }).strict();
export const productDeleteWriteInput = z
  .object({
    ids,
    requestId: z.string().uuid(),
    expectedDigest: digest,
    reviewed: z.literal(true),
  })
  .strict();
export const productDeleteReceiptInput = z
  .object({ requestId: z.string().uuid() })
  .strict();
export const productDeleteReceipt = z
  .object({
    merchantId: id,
    actorId: id,
    requestId: z.string().uuid(),
    kind: z.literal("delete"),
    ids,
    digest,
    createdAt: z.string().datetime(),
  })
  .strict();
export type ProductDeleteReceipt = z.infer<typeof productDeleteReceipt>;

const count = z.number().int().nonnegative().safe();
export const productDeleteReviewSchema = z.object({
  merchantId: id,
  selection: productDeleteReviewInput,
  digest,
  canManage: z.boolean(),
  canDelete: z.boolean(),
  items: z
    .array(
      z.object({
        id,
        name: z.string(),
        price: z.number().int(),
        priceUnit: z.enum(["minor", "unverified"]),
        currency: z.enum(["SAR", "USD"]),
        status: z.enum(["active", "draft", "archived"]),
        variants: count,
        options: count,
        locked: z.boolean(),
        blocked: z.boolean(),
        references: z.object({
          rewards: count,
          comparisons: count,
          reviews: count,
          promotions: count,
          unreadablePromotions: count,
          foreignDetails: count,
        }),
      })
    )
    .min(1)
    .max(100),
});
