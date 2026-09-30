import { z } from "zod";
export const quotationSendWorkspaceInput = z
  .object({ quotationId: z.number().int().positive() })
  .strict();
export const quotationDeliveryIdentity = z
  .object({ requestId: z.string().uuid() })
  .strict();
export const quotationDeliveryInput = quotationDeliveryIdentity
  .extend({
    reviewId: z.number().int().positive(),
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    confirmed: z.literal(true),
  })
  .strict();
export const quotationDeliveryGuard = z
  .object({
    deliveryId: z.number().int().positive(),
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type QuotationDeliveryGuard = z.infer<typeof quotationDeliveryGuard>;
