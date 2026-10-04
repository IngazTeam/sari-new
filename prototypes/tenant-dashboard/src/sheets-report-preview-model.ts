import {
  sheetsReportContext,
  sheetsReportReview,
  sheetsCustomReportReview,
  sheetsSendReportReview,
  sheetsReportReceipt,
} from "../../../shared/sheets-report-review";
import { sheetReportPeriod } from "../../../shared/sheets-report-data";
export const reportPreviewMutations = [
  "sheets.generateDailyReport",
  "sheets.generateWeeklyReport",
  "sheets.generateMonthlyReport",
  "sheets.generateCustomReport",
  "sheets.sendReportViaWhatsApp",
] as const;
export function reportPreviewContext(
  actorId: number,
  merchantId: number,
  mode: string
) {
  const ready = ![
    "empty",
    "unlinked",
    "oauth-disabled",
    "credentials-invalid",
    "destination-missing",
  ].includes(mode);
  return sheetsReportContext.parse({
    actorId,
    merchantId,
    spreadsheetId: ready ? "local-preview-" + merchantId : null,
    recipientPhone: "999" + merchantId + "00001",
    senderPhone: ready ? "999" + merchantId + "00002" : null,
    instanceId: ready ? 1 : null,
    canSend: ready,
  });
}
export function reportPreviewReceipt(
  actorId: number,
  merchantId: number,
  mode: string,
  name: string,
  raw: unknown
) {
  const custom = name === "sheets.generateCustomReport",
    send = name === "sheets.sendReportViaWhatsApp",
    input = (
      custom
        ? sheetsCustomReportReview
        : send
          ? sheetsSendReportReview
          : sheetsReportReview
    ).parse(raw);
  const context = reportPreviewContext(actorId, merchantId, mode),
    kind = custom
      ? "custom"
      : send
        ? (input as any).reportType === "يومي"
          ? "daily"
          : (input as any).reportType === "أسبوعي"
            ? "weekly"
            : "monthly"
        : name === "sheets.generateDailyReport"
          ? "daily"
          : name === "sheets.generateWeeklyReport"
            ? "weekly"
            : "monthly";
  if (
    input.expectedSpreadsheetId !== context.spreadsheetId ||
    (send &&
      (!context.canSend ||
        (input as any).expectedRecipientPhone !== context.recipientPhone ||
        (input as any).expectedInstanceId !== context.instanceId))
  )
    throw { data: { code: "BAD_REQUEST" } };
  const range = custom
    ? {
        start: (input as any).startDate as Date,
        end: (input as any).endDate as Date,
      }
    : sheetReportPeriod(
        kind as "daily" | "weekly" | "monthly",
        new Date("2026-10-04T12:00:00Z")
      );
  return sheetsReportReceipt.parse({
    success: true,
    actorId,
    merchantId,
    spreadsheetId: context.spreadsheetId,
    reportKind: kind,
    channel: send ? "whatsapp" : "sheet",
    ...(send
      ? {
          recipientPhone: context.recipientPhone,
          messageId: "local-preview-report-receipt",
        }
      : {}),
    data: {
      merchantId,
      period: range.start.toISOString() + " / " + range.end.toISOString(),
      startAt: range.start.toISOString(),
      endAt: range.end.toISOString(),
      timeZone: "UTC",
      totalOrders: 14,
      totalConversations: 24,
      totalMessages: 83,
      newCustomers: 9,
      orderValues: [
        {
          currency: "SAR",
          count: 10,
          totalMinor: 125000,
          markedPaidMinor: 74000,
        },
        { currency: "USD", count: 2, totalMinor: 4200, markedPaidMinor: 1200 },
      ],
      excludedAmounts: 1,
      excludedItemOrders: 1,
      topProducts: [{ name: "قهوة تجريبية · Sample coffee", count: 12 }],
      ordersByStatus: { pending: 5, delivered: 8, cancelled: 1 },
    },
  });
}
