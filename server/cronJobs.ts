/**
 * Cron Jobs للمهام المجدولة
 * يتم تشغيلها تلقائياً في الخلفية
 */

import cron from "node-cron";
import { runRemindersForAllMerchants } from "./appointmentReminders";
import { runTrialExpiryCheck } from "./cron/trial-expiry-check";
import { runDailyForAllMerchants, runWeeklyForAllMerchants } from "./ai/sales-conductor";

/**
 * تشغيل جميع Cron Jobs
 */
export function startCronJobs() {
  console.log("[Cron] Starting cron jobs...");

  // تشغيل التذكيرات كل ساعة
  // يعمل في الدقيقة 0 من كل ساعة
  cron.schedule("0 * * * *", async () => {
    console.log("[Cron] Running appointment reminders...");
    try {
      await runRemindersForAllMerchants();
      console.log("[Cron] Appointment reminders completed successfully");
    } catch (error) {
      console.error("[Cron] Error running appointment reminders:", error);
    }
  });

  // تشغيل فحص الفترات التجريبية المنتهية يومياً
  // يعمل كل يوم في الساعة 9 صباحاً
  cron.schedule("0 9 * * *", async () => {
    console.log("[Cron] Running trial expiry check...");
    try {
      await runTrialExpiryCheck();
      console.log("[Cron] Trial expiry check completed successfully");
    } catch (error) {
      console.error("[Cron] Error running trial expiry check:", error);
    }
  });

  // Sales Conductor: تحليل يومي لفعالية استراتيجيات البيع
  // يعمل كل يوم الساعة 3 فجراً (وقت هادئ)
  cron.schedule("0 3 * * *", async () => {
    console.log("[Cron] Running Sales Conductor daily analysis...");
    try {
      await runDailyForAllMerchants();
      console.log("[Cron] Sales Conductor daily analysis completed");
    } catch (error) {
      console.error("[Cron] Error running Sales Conductor daily:", error);
    }
  });

  // Sales Conductor: تحليل أسبوعي عميق (أنماط الاعتراضات)
  // يعمل كل أحد الساعة 4 فجراً
  cron.schedule("0 4 * * 0", async () => {
    console.log("[Cron] Running Sales Conductor weekly analysis...");
    try {
      await runWeeklyForAllMerchants();
      console.log("[Cron] Sales Conductor weekly analysis completed");
    } catch (error) {
      console.error("[Cron] Error running Sales Conductor weekly:", error);
    }
  });

  console.log("[Cron] Cron jobs started successfully");
  console.log("[Cron] - Appointment reminders: Every hour at minute 0");
  console.log("[Cron] - Trial expiry check: Every day at 9:00 AM");
  console.log("[Cron] - Sales Conductor daily: Every day at 3:00 AM");
  console.log("[Cron] - Sales Conductor weekly: Every Sunday at 4:00 AM");
}

/**
 * إيقاف جميع Cron Jobs
 */
export function stopCronJobs() {
  console.log("[Cron] Stopping cron jobs...");
  cron.getTasks().forEach((task) => task.stop());
  console.log("[Cron] All cron jobs stopped");
}

