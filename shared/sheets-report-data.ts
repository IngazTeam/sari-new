import { z } from "zod";
const count = z.number().int().nonnegative().safe();
export const sheetsReportData = z
  .object({
    merchantId: z.number().int().positive(),
    period: z.string(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    timeZone: z.literal("UTC"),
    totalOrders: count,
    totalConversations: count,
    totalMessages: count,
    newCustomers: count,
    orderValues: z
      .array(
        z
          .object({
            currency: z.enum(["SAR", "USD"]),
            count,
            totalMinor: count,
            markedPaidMinor: count,
          })
          .strict()
      )
      .max(2),
    excludedAmounts: count,
    excludedItemOrders: count,
    topProducts: z
      .array(
        z
          .object({
            name: z.string().min(1).max(255),
            count: z.number().int().positive().safe(),
          })
          .strict()
      )
      .max(5),
    ordersByStatus: z.record(z.string(), count),
  })
  .strict();
export type SheetsReportData = z.infer<typeof sheetsReportData>;
export function sheetOrderValuesText(data: SheetsReportData) {
  return data.orderValues.length
    ? data.orderValues
        .map(
          v =>
            `${(v.totalMinor / 100).toFixed(2)} ${v.currency} (المعلّم مدفوعًا: ${(v.markedPaidMinor / 100).toFixed(2)} ${v.currency})`
        )
        .join(" | ")
    : "لا قيم طلبات قابلة للتحقق";
}
export function sheetReportPeriod(
  kind: "daily" | "weekly" | "monthly",
  now = new Date()
) {
  if (!Number.isFinite(now.getTime())) throw Error("Invalid report time");
  const end = new Date(now),
    start =
      kind === "daily"
        ? new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
          )
        : new Date(now.getTime() - (kind === "weekly" ? 7 : 30) * 86400000);
  return { start, end };
}
