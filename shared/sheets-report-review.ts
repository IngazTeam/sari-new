import { z } from "zod";
import { sheetsReportData } from "./sheets-report-data";
const sheetId = z.string().regex(/^[A-Za-z0-9_-]{1,255}$/),
  phone = z.string().regex(/^[1-9]\d{6,14}$/);
export const sheetsReportReview = z
  .object({ reviewed: z.literal(true), expectedSpreadsheetId: sheetId })
  .strict();
export const sheetsCustomReportReview = sheetsReportReview
  .extend({ startDate: z.date(), endDate: z.date() })
  .strict()
  .refine(
    v =>
      v.endDate.getTime() > v.startDate.getTime() &&
      v.endDate.getTime() - v.startDate.getTime() <= 366 * 86400000,
    "Invalid report period"
  );
export const sheetsSendReportReview = sheetsReportReview
  .extend({
    reportType: z.enum(["يومي", "أسبوعي", "شهري"]),
    expectedRecipientPhone: phone,
    expectedInstanceId: z.number().int().positive(),
  })
  .strict();
export const sheetsReportContext = z
  .object({
    actorId: z.number().int().positive(),
    merchantId: z.number().int().positive(),
    spreadsheetId: sheetId.nullable(),
    recipientPhone: phone.nullable(),
    instanceId: z.number().int().positive().nullable(),
    senderPhone: phone.nullable(),
    canSend: z.boolean(),
  })
  .strict();
export const sheetsReportReceipt = z
  .object({
    success: z.literal(true),
    actorId: z.number().int().positive(),
    merchantId: z.number().int().positive(),
    spreadsheetId: sheetId,
    channel: z.enum(["sheet", "whatsapp"]),
    reportKind: z.enum(["daily", "weekly", "monthly", "custom"]),
    data: sheetsReportData,
    recipientPhone: phone.optional(),
    messageId: z.string().min(1).max(255).optional(),
  })
  .strict();
