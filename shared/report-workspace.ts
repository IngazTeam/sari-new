import { z } from "zod";

export const reportPeriods = ["day", "week", "month", "year"] as const;
export const reportKinds = ["sales", "customers", "conversations"] as const;
export const reportWorkspaceInput = z
  .object({
    kind: z.enum(reportKinds),
    period: z.enum(reportPeriods),
    currency: z.enum(["SAR", "USD"]).default("SAR"),
  })
  .strict();
export type ReportSelection = z.infer<typeof reportWorkspaceInput>;
export const reportSelectionKey = (s: ReportSelection) =>
  JSON.stringify([s.kind, s.period, s.currency]);
export const reportProductLimit = 250;
export const reportItemCharacters = 16384;

/** Inclusive UTC seconds; previous period has exactly the same elapsed seconds. */
export function reportWindow(
  period: ReportSelection["period"],
  now = new Date()
) {
  z.enum(reportPeriods).parse(period);
  if (!Number.isFinite(now.getTime())) throw Error("Invalid report clock");
  const through = new Date(Math.floor(now.getTime() / 1000) * 1000);
  const from =
    period === "day"
      ? new Date(
          Date.UTC(
            through.getUTCFullYear(),
            through.getUTCMonth(),
            through.getUTCDate()
          )
        )
      : new Date(
          through.getTime() +
            1000 -
            { week: 7, month: 30, year: 365 }[period] * 86400000
        );
  const seconds = (through.getTime() - from.getTime()) / 1000 + 1;
  const previousThrough = new Date(from.getTime() - 1000);
  const previousFrom = new Date(from.getTime() - seconds * 1000);
  const db = (v: Date) => v.toISOString().slice(0, 19).replace("T", " ");
  return {
    from: from.toISOString(),
    through: through.toISOString(),
    previousFrom: previousFrom.toISOString(),
    previousThrough: previousThrough.toISOString(),
    seconds,
    sqlFrom: db(from),
    sqlThrough: db(through),
    sqlPreviousFrom: db(previousFrom),
    sqlPreviousThrough: db(previousThrough),
  };
}

const n = z.number().int().nonnegative().safe();
const ratio = z.number().finite().nonnegative().nullable();
const base = {
  merchantId: n.positive(),
  period: z.enum(reportPeriods),
  from: z.string().datetime(),
  through: z.string().datetime(),
  timeZone: z.literal("UTC"),
};
export const salesReportSchema = z
  .object({
    ...base,
    kind: z.literal("sales"),
    currency: z.enum(["SAR", "USD"]),
    previousFrom: z.string().datetime(),
    previousThrough: z.string().datetime(),
    totalOrders: n,
    validAmountOrders: n,
    excludedAmounts: n,
    totalRevenue: n,
    markedPaidMinor: n,
    averageOrderValue: n.nullable(),
    totalConversations: n,
    conversionRate: ratio,
    previousRevenue: n,
    previousExcludedAmounts: n,
    growth: z.number().finite().nullable(),
    growthAvailable: z.boolean(),
    productSample: z
      .object({
        inspectedOrders: n.max(reportProductLimit),
        eligibleOrders: n,
        excludedOrders: n,
        includedItems: n,
        excludedItems: n,
        omittedOrders: n,
        orderLimit: z.literal(reportProductLimit),
      })
      .strict(),
    topProducts: z
      .array(z.object({ name: z.string(), quantity: n, revenue: n }).strict())
      .max(5),
  })
  .strict();
export const customersReportSchema = z
  .object({
    ...base,
    kind: z.literal("customers"),
    totalCustomers: n,
    newCustomers: n,
    activeCustomers: n,
    unknownPhoneConversations: n,
    retentionRate: ratio,
    topCustomers: z
      .array(
        z
          .object({
            conversationId: n.positive(),
            customerPhone: z.string(),
            customerName: z.string().nullable(),
            totalSpent: n.nullable(),
            purchaseCount: n,
          })
          .strict()
      )
      .max(5),
  })
  .strict();
export const conversationsReportSchema = z
  .object({
    ...base,
    kind: z.literal("conversations"),
    totalConversations: n,
    withPurchase: n,
    invalidPurchaseCounters: n,
    averageResponseTime: z.null(),
    satisfactionRate: z.null(),
    responseTimeAvailable: z.literal(false),
    satisfactionAvailable: z.literal(false),
    topicsAvailable: z.literal(false),
    conversionRate: ratio,
    topTopics: z.array(z.never()),
  })
  .strict();
export const reportSnapshotSchema = z.discriminatedUnion("kind", [
  salesReportSchema,
  customersReportSchema,
  conversationsReportSchema,
]);
export type ReportSnapshot = z.infer<typeof reportSnapshotSchema>;
export type SalesReport = z.infer<typeof salesReportSchema>;
export type CustomersReport = z.infer<typeof customersReportSchema>;
export type ConversationsReport = z.infer<typeof conversationsReportSchema>;
