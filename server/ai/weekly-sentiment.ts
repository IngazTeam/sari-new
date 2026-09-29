/**
 * نظام التقارير الأسبوعية للمشاعر
 */

import {
  createWeeklySentimentReport,
  getConversationsByMerchantId,
  getMerchantById,
  getMessagesByConversationId,
  getUserById,
  markReportEmailSent,
} from "../db";
import { analyzeSentiment } from "./sentiment-analysis";
import { sendEmail } from "../reports/email-sender";
import { renderWeeklyReportEmail } from "../reports/weekly-report-email";

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
  // P3: Sales KPIs
  salesKPIs?: {
    conversionRate: number;
    totalPaid: number;
    totalLost: number;
    topLossReason: string | null;
  };
}

/**
 * إنشاء تقرير أسبوعي للمشاعر
 */
export async function generateWeeklySentimentReport(
  merchantId: number
): Promise<WeeklySentimentReport | null> {
  try {
    // حساب تاريخ بداية ونهاية الأسبوع الماضي
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() - now.getDay()); // الأحد الماضي
    weekEnd.setHours(23, 59, 59, 999);

    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6); // الاثنين قبل أسبوع
    weekStart.setHours(0, 0, 0, 0);

    // الحصول على المحادثات في هذا الأسبوع
    const conversations = await getConversationsByMerchantId(merchantId);
    const weekConversations = conversations.filter(c => {
      const createdAt = new Date(c.createdAt);
      return createdAt >= weekStart && createdAt <= weekEnd;
    });

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
    const keywordMap = new Map<string, number>();

    for (const conversation of weekConversations) {
      // الحصول على رسائل المحادثة
      const messages = await getMessagesByConversationId(conversation.id);
      const customerMessages = messages.filter(m => m.direction === "incoming");

      if (customerMessages.length === 0) continue;

      // تحليل المشاعر
      const conversationText = customerMessages.map(m => m.content).join(" ");
      const sentiment = await analyzeSentiment(conversationText, {
        merchantId,
        taskType: "sari.sentiment.weekly",
      });

      if (sentiment.sentiment === "positive" || sentiment.sentiment === "happy")
        positiveCount++;
      else if (
        sentiment.sentiment === "negative" ||
        sentiment.sentiment === "angry" ||
        sentiment.sentiment === "sad" ||
        sentiment.sentiment === "frustrated"
      )
        negativeCount++;
      else neutralCount++;

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
        "نسبة المشاعر السلبية مرتفعة. يُنصح بمراجعة الردود وتحسين خدمة العملاء."
      );
    }
    if (positivePercentage < 50) {
      improvementSuggestions.push(
        "يمكن تحسين رضا العملاء من خلال ردود أسرع وأكثر ودية."
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
      positiveCount,
      negativeCount,
      neutralCount,
      positivePercentage,
      negativePercentage,
      neutralPercentage,
      topKeywords,
      improvementSuggestions,
    };

    // P3: Load Sales KPIs from loss-detector pipeline
    try {
      const { getPipelineSummary } = await import("./loss-detector");
      const pipeline = await getPipelineSummary(merchantId);
      const totalPaid = pipeline.stages["paid"] || 0;
      const totalLost = pipeline.stages["lost"] || 0;
      const total = totalPaid + totalLost;
      const topLoss = Object.entries(pipeline.lossReasons).sort(
        (a, b) => b[1] - a[1]
      )[0];
      report.salesKPIs = {
        conversionRate: total > 0 ? Math.round((totalPaid / total) * 100) : 0,
        totalPaid,
        totalLost,
        topLossReason: topLoss ? topLoss[0] : null,
      };
      // Sales-based improvement suggestions
      if (report.salesKPIs.conversionRate < 20 && total > 0) {
        improvementSuggestions.push(
          `📉 نسبة التحويل منخفضة (${report.salesKPIs.conversionRate}%). راجع أسعارك أو أضف عروض.`
        );
      }
      if (report.salesKPIs.topLossReason === "price") {
        improvementSuggestions.push(
          "💰 أكثر سبب لخسارة العملاء هو السعر. فكّر بإضافة باقات بأسعار مختلفة."
        );
      }
      if (report.salesKPIs.topLossReason === "no_response") {
        improvementSuggestions.push(
          "👻 كثير من العملاء يختفون. حاول تحسين المتابعة الاستباقية."
        );
      }
    } catch {
      // Sales KPIs are supplementary — non-blocking
    }

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
