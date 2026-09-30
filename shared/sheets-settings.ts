import { z } from "zod";
export const sheetReportFlags = z
  .object({
    sendDailyReports: z.boolean(),
    sendWeeklyReports: z.boolean(),
    sendMonthlyReports: z.boolean(),
  })
  .strict();
export const sheetsSettingsChange = z
  .object({
    expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
    reviewed: z.literal(true),
    changes: sheetReportFlags.partial().refine(v => Object.keys(v).length > 0),
  })
  .strict();
export const sheetsDisconnect = z
  .object({
    expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
    reviewed: z.literal(true),
  })
  .strict();
export const sheetsSettingsView = z
  .object({
    merchantId: z.number().int().positive(),
    actorId: z.number().int().positive(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    isConnected: z.boolean(),
    oauthReady: z.boolean(),
    hasIntegration: z.boolean(),
    state: z.enum([
      "unlinked",
      "credentials_invalid",
      "oauth_disabled",
      "needs_destination",
      "ready",
    ]),
    spreadsheetId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,255}$/)
      .optional(),
    lastSync: z.string().datetime().optional(),
    reports: sheetReportFlags,
  })
  .strict();
export type SheetsSettingsView = z.infer<typeof sheetsSettingsView>;
