import { and, desc, eq } from "drizzle-orm";
import { weeklySentimentReports } from "../drizzle/schema";
import { getDb } from "./db/connection";
import { sentimentObservation } from "../shared/insights-workspace";

/** Compatibility records retain raw legacy fields; consumers get explicit evidence limits. */
function withEvidence(row: typeof weeklySentimentReports.$inferSelect) {
  return {
    ...row,
    observation: sentimentObservation(row),
    evidenceKind: "legacy_report_without_generation_evidence" as const,
    measuredSatisfaction: null,
    salesProficiency: null,
  };
}
export async function readWeeklyReportRecords(
  merchantId: number,
  limit: number,
  page: number
) {
  if (
    !Number.isSafeInteger(merchantId) ||
    merchantId < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 52 ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 100000
  )
    throw Error("Invalid report selection");
  const db = await getDb();
  if (!db) throw Error("Report data unavailable");
  const rows = await db
    .select()
    .from(weeklySentimentReports)
    .where(eq(weeklySentimentReports.merchantId, merchantId))
    .orderBy(
      desc(weeklySentimentReports.weekEndDate),
      desc(weeklySentimentReports.id)
    )
    .limit(limit)
    .offset((page - 1) * limit);
  return rows.map(withEvidence);
}
export async function readWeeklyReportRecord(
  merchantId: number,
  reportId: number
) {
  if (![merchantId, reportId].every(v => Number.isSafeInteger(v) && v > 0))
    throw Error("Invalid report selection");
  const db = await getDb();
  if (!db) throw Error("Report data unavailable");
  const [row] = await db
    .select()
    .from(weeklySentimentReports)
    .where(
      and(
        eq(weeklySentimentReports.merchantId, merchantId),
        eq(weeklySentimentReports.id, reportId)
      )
    )
    .limit(1);
  return row ? withEvidence(row) : null;
}
