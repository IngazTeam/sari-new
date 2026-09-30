import { z } from "zod";

export const customerPageSize = 25;
export const customerActivities = [
  "active",
  "recent",
  "inactive",
  "unknown",
] as const;
export const customerSources = [
  "conversation",
  "order",
  "profile",
  "zid",
  "loyalty",
] as const;
const page = z.number().int().min(1).max(1000000).default(1);
export const customerKeyInput = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .refine(v => !/[\u0000-\u001f\u007f]/.test(v));
export const customerListInput = z
  .object({
    search: z.string().trim().max(120).default(""),
    activity: z.enum(["all", ...customerActivities]).default("all"),
    page,
  })
  .strict();
export const customerDetailInput = z
  .object({ key: customerKeyInput, ordersPage: page, conversationsPage: page })
  .strict();
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const date = z.string().datetime().nullable();
export const customerRowSchema = z
  .object({
    key: customerKeyInput,
    name: z.string().nullable(),
    firstRecordedAt: date,
    lastInteractionAt: date,
    activity: z.enum(customerActivities),
    sources: z.array(z.enum(customerSources)),
    conversationCount: count,
    orderCount: count,
    profileCount: count,
    zidCount: count,
    loyaltyCount: count,
  })
  .strict();
const paging = z
  .object({ page: count, pageSize: z.literal(25), total: count, pages: count })
  .strict();
export const customerListSchema = z
  .object({
    merchantId: count,
    through: z.string().datetime(),
    selection: customerListInput,
    totals: z
      .object({
        all: count,
        active: count,
        recent: count,
        inactive: count,
        unknown: count,
        firstRecordedThisMonth: count,
        excludedEmptyIdentifiers: count,
        excludedInvalidIdentifiers: count,
      })
      .strict(),
    pagination: paging,
    rows: z.array(customerRowSchema).max(customerPageSize),
  })
  .strict();
export const customerDetailSchema = z
  .object({
    merchantId: count,
    through: z.string().datetime(),
    selection: customerDetailInput,
    customer: customerRowSchema.nullable(),
    amounts: z
      .array(
        z
          .object({
            currency: z.enum(["SAR", "USD"]),
            eligibleOrders: count,
            excludedAmounts: count,
            totalMinor: count,
            markedPaidMinor: count,
          })
          .strict()
      )
      .max(2),
    loyalty: z.object({ records: count, points: count.nullable() }).strict(),
    orders: z
      .object({
        pagination: paging,
        rows: z
          .array(
            z
              .object({
                id: count,
                reference: z.string().nullable(),
                customerPhone: z.string(),
                currency: z.enum(["SAR", "USD"]),
                totalMinor: count.nullable(),
                status: z.string(),
                paymentStatus: z.string(),
                createdAt: date,
              })
              .strict()
          )
          .max(customerPageSize),
      })
      .strict(),
    conversations: z
      .object({
        pagination: paging,
        rows: z
          .array(
            z
              .object({
                id: count,
                customerPhone: z.string(),
                name: z.string().nullable(),
                status: z.string(),
                createdAt: date,
                lastMessageAt: date,
              })
              .strict()
          )
          .max(customerPageSize),
      })
      .strict(),
  })
  .strict();
export type CustomerListSelection = z.infer<typeof customerListInput>;
export type CustomerDetailSelection = z.infer<typeof customerDetailInput>;
export type CustomerRow = z.infer<typeof customerRowSchema>;
export type CustomerList = z.infer<typeof customerListSchema>;
export type CustomerDetail = z.infer<typeof customerDetailSchema>;
