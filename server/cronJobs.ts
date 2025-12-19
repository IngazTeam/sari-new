/**
 * Cron Jobs للمهام المجدولة
 * يتم تشغيلها تلقائياً في الخلفية
 */

import cron from "node-cron";
import { runRemindersForAllMerchants } from "./appointmentReminders";

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

  console.log("[Cron] Cron jobs started successfully");
  console.log("[Cron] - Appointment reminders: Every hour at minute 0");
}

/**
 * إيقاف جميع Cron Jobs
 */
export function stopCronJobs() {
  console.log("[Cron] Stopping cron jobs...");
  cron.getTasks().forEach((task) => task.stop());
  console.log("[Cron] All cron jobs stopped");
}
