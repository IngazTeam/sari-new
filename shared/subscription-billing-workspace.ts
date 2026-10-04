import { z } from "zod";
import { usageQuotaSchema } from "./usage-workspace";
const id = z.number().int().positive().max(2147483647);
const date = z.string().datetime();
export const billingStates = [
  "pending",
  "completed",
  "failed",
  "refunded",
  "requires_review",
] as const;
export const billingTypes = [
  "subscription",
  "addon",
  "renewal",
  "upgrade",
  "downgrade",
] as const;
export const billingHistoryInput = z
  .object({
    beforeId: id.nullable().default(null),
    pageSize: z.union([z.literal(25), z.literal(50)]).default(25),
    status: z.enum(["all", ...billingStates]).default("all"),
    type: z.enum(["all", ...billingTypes]).default("all"),
  })
  .strict();
export const subscriptionBillingSchema = z
  .object({
    actorId: id,
    merchantId: id,
    canManage: z.boolean(),
    canReadPayments: z.boolean(),
    checkedAt: date,
    timezone: z.literal("UTC"),
    state: z.enum([
      "none",
      "ambiguous",
      "unknown",
      "active",
      "trial",
      "expired",
      "pending",
      "cancelled",
    ]),
    subscription: z
      .object({
        id,
        planId: id.nullable(),
        nameAr: z.string().max(255).nullable(),
        nameEn: z.string().max(255).nullable(),
        recordedStatus: z.enum([
          "pending",
          "trial",
          "active",
          "expired",
          "cancelled",
          "unknown",
        ]),
        billingCycle: z.enum(["monthly", "yearly"]).nullable(),
        startDate: date.nullable(),
        endDate: date.nullable(),
        lastResetAt: date.nullable(),
        cancelledAt: date.nullable(),
        daysRemaining: z.number().int().nonnegative().nullable(),
        limitsSource: z.enum(["plan", "trial", "unknown"]),
        quotas: z
          .object({
            conversations: usageQuotaSchema,
            messages: usageQuotaSchema,
            voiceMessages: usageQuotaSchema,
          })
          .strict(),
        resources: z
          .object({
            customers: usageQuotaSchema,
            whatsappNumbers: usageQuotaSchema,
          })
          .strict(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      (v.state === "none" || v.state === "ambiguous") !==
      (v.subscription === null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent subscription selection",
      });
    if (v.canManage && !v.canReadPayments)
      ctx.addIssue({ code: "custom", message: "Inconsistent authority" });
    const s = v.subscription;
    if (
      s &&
      ["active", "trial"].includes(v.state) &&
      (s.recordedStatus !== v.state ||
        !s.startDate ||
        !s.endDate ||
        s.startDate > v.checkedAt ||
        s.endDate <= v.checkedAt ||
        s.endDate <= s.startDate)
    )
      ctx.addIssue({ code: "custom", message: "Inconsistent active period" });
  });
export const billingHistorySchema = z
  .object({
    actorId: id,
    merchantId: id,
    checkedAt: date,
    timezone: z.literal("UTC"),
    input: billingHistoryInput,
    rows: z
      .array(
        z
          .object({
            id,
            type: z.enum([...billingTypes, "unknown"]),
            status: z.enum([...billingStates, "unknown"]),
            amountMinor: z
              .number()
              .int()
              .nonnegative()
              .max(9999999999)
              .nullable(),
            currency: z.enum(["SAR", "USD"]).nullable(),
            createdAt: date.nullable(),
            paidAt: date.nullable(),
            refundedAt: date.nullable(),
          })
          .strict()
          .superRefine((v, ctx) => {
            if (!v.currency && v.amountMinor !== null)
              ctx.addIssue({
                code: "custom",
                message: "Unknown currency amount",
              });
          })
      )
      .max(50),
    nextBeforeId: id.nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.rows.length > v.input.pageSize ||
      v.rows.some(
        (r, i) =>
          (v.input.beforeId !== null && r.id >= v.input.beforeId) ||
          (i > 0 && r.id >= v.rows[i - 1].id) ||
          (v.input.status !== "all" && r.status !== v.input.status) ||
          (v.input.type !== "all" && r.type !== v.input.type)
      ) ||
      (v.nextBeforeId !== null &&
        (v.rows.length !== v.input.pageSize ||
          v.nextBeforeId !== v.rows[v.rows.length - 1]?.id))
    )
      ctx.addIssue({ code: "custom", message: "Inconsistent history page" });
  });
export type SubscriptionBillingWorkspace = z.infer<
  typeof subscriptionBillingSchema
>;
export type BillingHistory = z.infer<typeof billingHistorySchema>;
export type BillingHistoryInput = z.infer<typeof billingHistoryInput>;
