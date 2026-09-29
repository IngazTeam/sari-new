/** Compatibility reads share the evidence meanings of the current tenant workspace. */
import { getDb } from "./db/connection";
import { keywordAnalysis, abTestResults } from "../drizzle/schema";
import { eq, asc, desc, and, gte, lte, sql, count } from "drizzle-orm";
import {
  insightPeriod,
  insightWindow,
  legacyInsightTestSelection,
  observationArm,
} from "../shared/insights-workspace";
import { readWeeklyReportRecords } from "./weekly-reports-store";

function assertMerchant(merchantId: number) {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1)
    throw Error("Invalid merchant");
}
export async function getKeywordInsights(
  merchantId: number,
  period: "7d" | "30d" | "90d"
) {
  assertMerchant(merchantId);
  const window = insightWindow(insightPeriod.parse(period));
  const db = await getDb();
  if (!db) throw Error("Insights unavailable");
  return db.transaction(
    async tx => {
      const scope = and(
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
        .where(scope);
      const byCategory = await tx
        .select({ category: keywordAnalysis.category, count: count() })
        .from(keywordAnalysis)
        .where(scope)
        .groupBy(keywordAnalysis.category)
        .orderBy(asc(keywordAnalysis.category));
      const topKeywords = await tx
        .select({
          keyword: keywordAnalysis.keyword,
          category: keywordAnalysis.category,
          count: keywordAnalysis.frequency,
        })
        .from(keywordAnalysis)
        .where(scope)
        .orderBy(desc(keywordAnalysis.frequency), asc(keywordAnalysis.id))
        .limit(10);
      return {
        total: Number(stats.total),
        suggested: Number(stats.suggested || 0),
        // A status flag is not proof a response was created, enabled, matched, or delivered.
        applied: null,
        markedResponseCreated: Number(stats.markedResponseCreated || 0),
        byCategory: byCategory.map(row => ({
          ...row,
          count: Number(row.count),
        })),
        topKeywords,
        from: window.from,
        through: window.through,
        selectedBy: "last_seen_at" as const,
        frequencyMeaning: "lifetime_count" as const,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
export async function getWeeklyReportsList(merchantId: number, limit = 4) {
  const rows = await readWeeklyReportRecords(merchantId, limit, 1);
  return rows.map(row => ({
    id: row.id,
    weekStart: row.weekStartDate,
    weekEnd: row.weekEndDate,
    totalConversations: row.totalConversations,
    positiveCount: row.positiveCount,
    negativeCount: row.negativeCount,
    neutralCount: row.neutralCount,
    averageSatisfaction: null,
    positiveShare: row.observation.positiveShare,
    observation: row.observation,
    evidenceKind: row.evidenceKind,
    emailSent: row.emailSent,
  }));
}
export async function getActiveABTests(
  merchantId: number,
  input?: { limit?: number; page?: number }
) {
  assertMerchant(merchantId);
  const selection = legacyInsightTestSelection.parse(input ?? {});
  const db = await getDb();
  if (!db) throw Error("Insights unavailable");
  const rows = await db
    .select()
    .from(abTestResults)
    .where(
      and(
        eq(abTestResults.merchantId, merchantId),
        eq(abTestResults.status, "running")
      )
    )
    .orderBy(desc(abTestResults.createdAt), desc(abTestResults.id))
    .limit(selection.limit)
    .offset((selection.page - 1) * selection.limit);
  return rows.map(row => ({
    id: row.id,
    keyword: row.keyword,
    responseA: row.variantAText,
    responseB: row.variantBText,
    usageCountA: row.variantAUsageCount,
    usageCountB: row.variantBUsageCount,
    successRateA: null,
    successRateB: null,
    observationA: observationArm(
      row.variantAUsageCount,
      row.variantASuccessCount
    ),
    observationB: observationArm(
      row.variantBUsageCount,
      row.variantBSuccessCount
    ),
    evidenceKind: "legacy_observation_counters" as const,
    statisticalConfidence: null,
    activationAllowed: false,
    status: row.status,
    page: selection.page,
    pageSize: selection.limit,
  }));
}
