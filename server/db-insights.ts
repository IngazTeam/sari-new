/**
 * دوال قاعدة البيانات للوحة التحكم التحليلية
 */

import { getDb } from "./db";
import { keywordAnalysis, weeklySentimentReports, abTestResults } from "../drizzle/schema";
import { eq, desc, and, gte, lte, sql, count } from "drizzle-orm";

/**
 * الحصول على إحصائيات الكلمات المفتاحية
 */
export async function getKeywordInsights(merchantId: number, period: '7d' | '30d' | '90d') {
  const db = await getDb();
  if (!db) return null;

  const daysAgo = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysAgo);

  // إجمالي الكلمات
  const allKeywords = await db.select().from(keywordAnalysis)
    .where(
      and(
        eq(keywordAnalysis.merchantId, merchantId),
        // @ts-ignore
        gte(keywordAnalysis.createdAt, startDate)
      )
    );

  // الكلمات حسب الفئة
  const byCategory = await db
    .select({
      category: keywordAnalysis.category,
      count: count()
    })
    .from(keywordAnalysis)
    .where(
      and(
        eq(keywordAnalysis.merchantId, merchantId),
        // @ts-ignore
        gte(keywordAnalysis.createdAt, startDate)
      )
    )
    .groupBy(keywordAnalysis.category);

  // أكثر الكلمات تكراراً
  const topKeywords = await db.select().from(keywordAnalysis)
    .where(
      and(
        eq(keywordAnalysis.merchantId, merchantId),
        // @ts-ignore
        gte(keywordAnalysis.createdAt, startDate)
      )
    )
    .orderBy(desc(keywordAnalysis.frequency))
    .limit(10);

  return {
    total: allKeywords.length,
    suggested: allKeywords.filter(k => k.suggestedResponse !== null).length,
    applied: allKeywords.filter(k => k.status === 'response_created').length,
    byCategory: byCategory.map(c => ({
      category: c.category,
      count: Number(c.count)
    })),
    topKeywords: topKeywords.map(k => ({
      keyword: k.keyword,
      category: k.category,
      count: k.frequency
    }))
  };
}

/**
 * الحصول على تقارير المشاعر الأسبوعية
 */
export async function getWeeklyReportsList(merchantId: number, limit: number = 4) {
  const db = await getDb();
  if (!db) return [];

  const reports = await db.select().from(weeklySentimentReports)
    .where(eq(weeklySentimentReports.merchantId, merchantId))
    .orderBy(desc(weeklySentimentReports.weekStartDate))
    .limit(limit);

  return reports.map(r => ({
    id: r.id,
    weekStart: r.weekStartDate,
    weekEnd: r.weekEndDate,
    totalConversations: r.totalConversations,
    positiveCount: r.positiveCount,
    negativeCount: r.negativeCount,
    neutralCount: r.neutralCount,
    averageSatisfaction: r.positivePercentage, // استخدام النسبة الإيجابية كمؤشر للرضا
    emailSent: r.emailSent
  }));
}

/**
 * الحصول على اختبارات A/B النشطة
 */
export async function getActiveABTests(merchantId: number) {
  const db = await getDb();
  if (!db) return [];

  const tests = await db.select().from(abTestResults)
    .where(
      and(
        eq(abTestResults.merchantId, merchantId),
        eq(abTestResults.status, 'running')
      )
    )
    .orderBy(desc(abTestResults.createdAt));

  return tests.map(t => {
    const successRateA = t.variantAUsageCount > 0 
      ? (t.variantASuccessCount / t.variantAUsageCount) * 100 
      : 0;
    const successRateB = t.variantBUsageCount > 0 
      ? (t.variantBSuccessCount / t.variantBUsageCount) * 100 
      : 0;

    return {
      id: t.id,
      keyword: t.keyword,
      responseA: t.variantAText,
      responseB: t.variantBText,
      usageCountA: t.variantAUsageCount,
      usageCountB: t.variantBUsageCount,
      successRateA,
      successRateB,
      status: t.status
    };
  });
}