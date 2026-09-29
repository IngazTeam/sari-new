import { and, asc, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  keywordAnalysis,
  weeklySentimentReports,
  abTestResults,
} from "../drizzle/schema";
import { getDb } from "./db/connection";
import {
  INSIGHT_PAGE_SIZE,
  insightDate,
  insightPage,
  insightWindow,
  observationArm,
  sentimentObservation,
  type InsightWorkspaceInput,
} from "../shared/insights-workspace";

/** Read-only coherent snapshot. Counts never substitute for a failed source. */
export async function readInsightWorkspace(
  merchantId: number,
  input: InsightWorkspaceInput
) {
  const db = await getDb();
  if (!db) throw Error("Insights unavailable");
  const window = insightWindow(input.period);
  return db.transaction(
    async tx => {
      // Frequency is lifetime; this window selects records by their last observation.
      const keywordWhere = and(
        eq(keywordAnalysis.merchantId, merchantId),
        gte(keywordAnalysis.lastSeenAt, window.sqlFrom),
        lte(keywordAnalysis.lastSeenAt, window.sqlThrough)
      );
      const [stats] = await tx
        .select({
          total: count(),
          suggested: sql<number>`sum(case when trim(coalesce(${keywordAnalysis.suggestedResponse}, '')) <> '' then 1 else 0 end)`,
          markedResponseCreated: sql<number>`sum(case when ${keywordAnalysis.status} = 'response_created' then 1 else 0 end)`,
        })
        .from(keywordAnalysis)
        .where(keywordWhere);
      const keywordPaging = insightPage(input.keywordPage, Number(stats.total));
      const categories = await tx
        .select({ category: keywordAnalysis.category, count: count() })
        .from(keywordAnalysis)
        .where(keywordWhere)
        .groupBy(keywordAnalysis.category)
        .orderBy(asc(keywordAnalysis.category));
      const keywords = await tx
        .select({
          id: keywordAnalysis.id,
          keyword: keywordAnalysis.keyword,
          category: keywordAnalysis.category,
          frequency: keywordAnalysis.frequency,
          status: keywordAnalysis.status,
          suggestedResponse: keywordAnalysis.suggestedResponse,
          firstSeenAt: keywordAnalysis.firstSeenAt,
          lastSeenAt: keywordAnalysis.lastSeenAt,
        })
        .from(keywordAnalysis)
        .where(keywordWhere)
        .orderBy(desc(keywordAnalysis.frequency), asc(keywordAnalysis.id))
        .limit(INSIGHT_PAGE_SIZE)
        .offset(keywordPaging.offset);
      // Periods may overlap. Select by report end date, never add report samples together.
      const reportWhere = and(
        eq(weeklySentimentReports.merchantId, merchantId),
        gte(weeklySentimentReports.weekEndDate, window.sqlFrom),
        lte(weeklySentimentReports.weekEndDate, window.sqlThrough)
      );
      const [reportCount] = await tx
        .select({ total: count() })
        .from(weeklySentimentReports)
        .where(reportWhere);
      const reportPaging = insightPage(
        input.reportPage,
        Number(reportCount.total)
      );
      const reports = await tx
        .select()
        .from(weeklySentimentReports)
        .where(reportWhere)
        .orderBy(
          desc(weeklySentimentReports.weekEndDate),
          desc(weeklySentimentReports.id)
        )
        .limit(INSIGHT_PAGE_SIZE)
        .offset(reportPaging.offset);
      const testWhere = and(
        eq(abTestResults.merchantId, merchantId),
        gte(abTestResults.createdAt, window.sqlFrom),
        lte(abTestResults.createdAt, window.sqlThrough)
      );
      const [testCount] = await tx
        .select({ total: count() })
        .from(abTestResults)
        .where(testWhere);
      const testPaging = insightPage(input.testPage, Number(testCount.total));
      const tests = await tx
        .select()
        .from(abTestResults)
        .where(testWhere)
        .orderBy(desc(abTestResults.createdAt), desc(abTestResults.id))
        .limit(INSIGHT_PAGE_SIZE)
        .offset(testPaging.offset);
      return {
        merchantId,
        period: input.period,
        from: window.from,
        through: window.through,
        keywords: {
          ...keywordPaging,
          suggested: Number(stats.suggested || 0),
          markedResponseCreated: Number(stats.markedResponseCreated || 0),
          categories: categories.map(row => ({
            ...row,
            count: Number(row.count),
          })),
          rows: keywords.map(row => ({
            ...row,
            firstSeenAt: insightDate(row.firstSeenAt),
            lastSeenAt: insightDate(row.lastSeenAt),
          })),
        },
        reports: {
          ...reportPaging,
          rows: reports.map(row => ({
            id: row.id,
            weekStart: insightDate(row.weekStartDate),
            weekEnd: insightDate(row.weekEndDate),
            createdAt: insightDate(row.createdAt),
            observation: sentimentObservation(row),
            emailMarkedSent: Boolean(row.emailSent),
            emailSentAt: insightDate(row.emailSentAt),
          })),
        },
        tests: {
          ...testPaging,
          evidenceKind: "legacy_unverified_observations" as const,
          statisticalConfidence: null,
          activationAllowed: false as const,
          rows: tests.map(row => ({
            id: row.id,
            name: row.testName,
            keyword: row.keyword,
            status: row.status,
            createdAt: insightDate(row.createdAt),
            startedAt: insightDate(row.startedAt),
            completedAt: insightDate(row.completedAt),
            storedSelection: row.winner,
            variantA: {
              text: row.variantAText,
              ...observationArm(
                row.variantAUsageCount,
                row.variantASuccessCount
              ),
            },
            variantB: {
              text: row.variantBText,
              ...observationArm(
                row.variantBUsageCount,
                row.variantBSuccessCount
              ),
            },
          })),
        },
      };
    },
    {
      isolationLevel: "repeatable read",
      // REPEATABLE READ pins its snapshot at the first SELECT. This also avoids
      // the driver's invalid combined "consistent snapshot read only" syntax.
      accessMode: "read only",
    }
  );
}
