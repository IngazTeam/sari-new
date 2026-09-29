/**
 * نظام التقارير الأسبوعية للمشاعر
 */

import {
  createWeeklySentimentReport,
  getMerchantById,
  getUserById,
  markReportEmailSent,
} from "../db";
import { analyzeSentiment } from "./sentiment-analysis";
import { sendEmail } from "../reports/email-sender";
import { renderWeeklyReportEmail } from "../reports/weekly-report-email";
import {
  previousReportWindow,
  readWeeklyAnalysisInput,
} from "../reports/weekly-cohort";

interface WeeklySentimentReport {
  merchantId: number;
  emailStatus: "recipient_unavailable" | "failed" | "accepted";
  weekStartDate: Date;
  weekEndDate: Date;
  totalConversations: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  positivePercentage: number;
  negativePercentage: number;
  neutralPercentage: number;
  topKeywords: Array<{ keyword: string; count: number }>;
  improvementSuggestions: string[];
  unclassifiedCount: number;
  failedAnalysisCount: number;
  inputLimitedCount: number;
}

/**
 * إنشاء تقرير أسبوعي للمشاعر
 */
export async function generateWeeklySentimentReport(
  merchantId: number
): Promise<WeeklySentimentReport | null> {
  try {
    const window = previousReportWindow();
    const weekStart = window.start,
      weekEnd = window.end;
    const weekConversations = await readWeeklyAnalysisInput(merchantId, window);

    if (weekConversations.length === 0) {
      console.log(
        `[Weekly Report] No conversations found for merchant ${merchantId} in the past week`
      );
      return null;
    }

    // تحليل المشاعر لكل محادثة
    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;
    let failedAnalysisCount = 0;
    const keywordMap = new Map<string, number>();

    for (const conversation of weekConversations) {
      const conversationText = conversation.text;
      if (!conversationText) continue;
      let sentiment;
      try {
        sentiment = await analyzeSentiment(conversationText, {
          merchantId,
          taskType: "sari.sentiment.weekly",
        });
      } catch {
        failedAnalysisCount++;
        continue;
      }

      if (sentiment.sentiment === "positive" || sentiment.sentiment === "happy")
        positiveCount++;
      else if (
        sentiment.sentiment === "negative" ||
        sentiment.sentiment === "angry" ||
        sentiment.sentiment === "sad" ||
        sentiment.sentiment === "frustrated"
      )
        negativeCount++;
      else if (sentiment.sentiment === "neutral") neutralCount++;
      else {
        failedAnalysisCount++;
        continue;
      }

      // استخراج الكلمات المفتاحية (بسيط)
      const words = conversationText.split(/\s+/);
      for (const word of words) {
        if (word.length > 3) {
          keywordMap.set(word, (keywordMap.get(word) || 0) + 1);
        }
      }
    }

    const totalConversations = weekConversations.length;
    const positivePercentage = (positiveCount / totalConversations) * 100;
    const negativePercentage = (negativeCount / totalConversations) * 100;
    const neutralPercentage = (neutralCount / totalConversations) * 100;

    // أكثر 10 كلمات تكراراً
    const topKeywords = Array.from(keywordMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword, count]) => ({ keyword, count }));

    // اقتراحات التحسين
    const improvementSuggestions = [];
    if (negativePercentage > 20) {
      improvementSuggestions.push(
        "راجع الرسائل المصنفة سلبية في العينة قبل اتخاذ إجراء؛ هذا تصنيف آلي وليس قياس رضا."
      );
    }
    if (topKeywords.length > 0) {
      improvementSuggestions.push(
        `الكلمات الأكثر تكراراً: ${topKeywords
          .slice(0, 3)
          .map(k => k.keyword)
          .join("، ")}. قد تحتاج لردود سريعة مخصصة.`
      );
    }

    const report: WeeklySentimentReport = {
      merchantId,
      emailStatus: "recipient_unavailable",
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      totalConversations,
      unclassifiedCount:
        totalConversations - positiveCount - negativeCount - neutralCount,
      failedAnalysisCount,
      inputLimitedCount: weekConversations.filter(
        c => c.unavailable === "input_limit"
      ).length,
      positiveCount,
      negativeCount,
      neutralCount,
      positivePercentage,
      negativePercentage,
      neutralPercentage,
      topKeywords,
      improvementSuggestions,
    };

    // حفظ التقرير في قاعدة البيانات
    const reportId = await createWeeklySentimentReport({
      merchantId,
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      totalConversations,
      positiveCount,
      negativeCount,
      neutralCount,
      topKeywords: topKeywords.map(k => k.keyword),
      topComplaints: [], // يمكن إضافته لاحقاً
      recommendations: improvementSuggestions,
    });

    // إرسال التقرير عبر البريد الإلكتروني
    const merchant = await getMerchantById(merchantId);
    if (merchant) {
      const user = await getUserById(merchant.userId);
      if (user?.email) {
        const accepted = await sendWeeklyReportEmail(
          user.email,
          merchant.businessName,
          report
        );
        report.emailStatus = accepted ? "accepted" : "failed";
        if (accepted) await markReportEmailSent(reportId);
      }
    }

    return report;
  } catch (error) {
    console.error("[Weekly Report] Error generating report:", error);
    throw error;
  }
}

/**
 * إرسال التقرير الأسبوعي عبر البريد الإلكتروني
 */
async function sendWeeklyReportEmail(
  email: string,
  businessName: string,
  report: WeeklySentimentReport
) {
  const html = renderWeeklyReportEmail(
    {
      weekStartDate: report.weekStartDate.toISOString(),
      weekEndDate: report.weekEndDate.toISOString(),
      totalConversations: report.totalConversations,
      positiveCount: report.positiveCount,
      negativeCount: report.negativeCount,
      neutralCount: report.neutralCount,
      topKeywords: JSON.stringify(report.topKeywords.map(k => k.keyword)),
      topComplaints: JSON.stringify([]),
      recommendations: JSON.stringify(report.improvementSuggestions),
    },
    businessName
  );
  try {
    return await sendEmail({
      to: email,
      subject: "تقرير المشاعر المحفوظ — ساري",
      html,
    });
  } catch {
    return false;
  }
}
