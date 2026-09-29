/**
 * Cron Job: إرسال التقارير الأسبوعية تلقائياً
 * يتم تشغيله كل يوم أحد الساعة 9 صباحاً
 */

import { getAllMerchants } from "../db";
import { generateWeeklySentimentReport } from "../ai/weekly-sentiment";
import { notifyOwner } from "../_core/notification";

/**
 * التحقق وإرسال التقارير الأسبوعية لجميع التجار
 */
export async function checkAndSendWeeklyReports() {
  console.log("[Weekly Reports] Starting weekly report generation...");

  try {
    // الحصول على جميع التجار النشطين
    const merchants = await getAllMerchants();
    const activeMerchants = merchants.filter(m => m.status === "active");

    console.log(
      `[Weekly Reports] Found ${activeMerchants.length} active merchants`
    );

    let successCount = 0;
    let errorCount = 0;

    // إنشاء تقرير لكل تاجر
    for (const merchant of activeMerchants) {
      try {
        console.log(
          `[Weekly Reports] Generating report for merchant ${merchant.id} (${merchant.businessName})`
        );

        // إنشاء التقرير الأسبوعي
        const report = await generateWeeklySentimentReport(merchant.id);

        if (report) {
          successCount++;
          console.log(
            `[Weekly Reports] Report generated for merchant ${merchant.id}; email state: ${report.emailStatus}`
          );

          // إشعار المدير بنجاح الإرسال
          await notifyOwner({
            title: `تقرير أسبوعي: ${merchant.businessName}`,
            content: `تم إنشاء التقرير. المحادثات: ${report.totalConversations}. ${report.emailStatus === "accepted" ? "قبله مزود البريد؛ الوصول غير مؤكد." : report.emailStatus === "failed" ? "فشل إرسال البريد." : "لم يتوفر بريد للمستلم."} هذه تصنيفات مشاعر محفوظة وليست قياس رضا.`,
          });
        } else {
          console.log(
            `[Weekly Reports] ⚠ No data to report for merchant ${merchant.id}`
          );
        }
      } catch (error) {
        errorCount++;
        console.error(
          `[Weekly Reports] ✗ Error generating report for merchant ${merchant.id}:`,
          error
        );

        // إشعار المدير بالخطأ
        await notifyOwner({
          title: `خطأ في التقرير الأسبوعي: ${merchant.businessName}`,
          content: `فشل إنشاء التقرير الأسبوعي. الرجاء التحقق من السجلات.`,
        });
      }
    }

    console.log(
      `[Weekly Reports] Completed. Success: ${successCount}, Errors: ${errorCount}`
    );

    // إشعار المدير بالملخص
    await notifyOwner({
      title: "ملخص التقارير الأسبوعية",
      content: `تم إنشاء ${successCount} تقرير بنجاح من أصل ${activeMerchants.length} تاجر نشط. الأخطاء: ${errorCount}`,
    });

    return {
      success: true,
      totalMerchants: activeMerchants.length,
      successCount,
      errorCount,
    };
  } catch (error) {
    console.error("[Weekly Reports] Fatal error:", error);

    await notifyOwner({
      title: "خطأ حرج في التقارير الأسبوعية",
      content: `فشل تشغيل مهمة التقارير الأسبوعية. الرجاء التحقق من السجلات فوراً.`,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * جدولة المهمة (يتم استدعاؤها من server/_core/index.ts)
 */
export function scheduleWeeklyReports() {
  // كل يوم أحد الساعة 9 صباحاً (cron: 0 9 * * 0)
  // سيتم تفعيلها في server/_core/index.ts
  console.log(
    "[Weekly Reports] Scheduler initialized - will run every Sunday at 9 AM"
  );
}
