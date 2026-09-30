import { z } from "zod";
const id = z.number().int().positive().safe();
// Payment is settled by the payment/provider workflows, never by a manual status command.
export const manualOrderStatuses = [
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export const orderStatusIntent = z
  .object({
    id,
    status: z.enum(manualOrderStatuses),
    trackingNumber: z.string().trim().min(1).max(100).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
    notify: z.boolean(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status === "cancelled" && !v.reason)
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Cancellation reason required",
      });
    if (v.status !== "cancelled" && v.reason)
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Reason applies to cancellation",
      });
    if (!["shipped", "delivered"].includes(v.status) && v.trackingNumber)
      ctx.addIssue({
        code: "custom",
        path: ["trackingNumber"],
        message: "Tracking applies to shipment",
      });
  });
export const orderStatusWrite = z
  .object({
    requestId: z.string().uuid(),
    intent: orderStatusIntent,
    expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
    reviewed: z.literal(true),
  })
  .strict();
export const orderStatusReceiptInput = z
  .object({ requestId: z.string().uuid() })
  .strict();
export const orderStatusHistoryInput = z
  .object({ id, beforeId: id.optional() })
  .strict();
export const orderStatusReceipt = z
  .object({
    version: z.literal("order-status.v1"),
    merchantId: id,
    actorId: id,
    requestId: z.string().uuid(),
    orderId: id,
    from: z.enum([
      "pending",
      "paid",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ]),
    status: z.enum(manualOrderStatuses),
    trackingNumber: z.string().nullable(),
    reason: z.string().nullable(),
    notificationQueued: z.boolean(),
    committedAt: z.string().datetime(),
  })
  .strict();
export type OrderStatusReceipt = z.infer<typeof orderStatusReceipt>;
export type OrderStatusIntent = z.infer<typeof orderStatusIntent>;
export interface OrderStatusReview {
  merchantId: number;
  actorId: number;
  intent: OrderStatusIntent;
  digest: string;
  order: {
    id: number;
    number: string | null;
    customerName: string;
    customerPhone: string;
    status: string;
    paymentStatus: string;
    currency: string;
    totalMinor: number | null;
    trackingNumber: string | null;
  };
  notification: { customerPhone: string; message: string } | null;
}
