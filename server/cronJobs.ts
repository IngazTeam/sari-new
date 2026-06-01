/**
 * Cron Jobs — Sari Platform
 * All scheduled background tasks
 */

import cron from "node-cron";
import { runRemindersForAllMerchants } from "./appointmentReminders";
import { runTrialExpiryCheck } from "./cron/trial-expiry-check";
import { runDailyForAllMerchants, runWeeklyForAllMerchants } from "./ai/sales-conductor";
import { runFollowUps } from "./ai/proactive-followup";
import { detectLostDeals } from "./ai/loss-detector";
import { checkOpenAiHealth } from "./cron/ai-health-monitor";
import { sendDailyAiReport } from "./cron/ai-daily-report";

/**
 * Start all Cron Jobs
 */
export function startCronJobs() {
  console.log("[Cron] Starting cron jobs...");

  // Appointment Reminders — every hour at minute 0
  cron.schedule("0 * * * *", async () => {
    console.log("[Cron] Running appointment reminders...");
    try {
      await runRemindersForAllMerchants();
      console.log("[Cron] Appointment reminders completed successfully");
    } catch (error) {
      console.error("[Cron] Error running appointment reminders:", error);
    }
  });

  // Trial Expiry Check — daily at 9:00 AM
  cron.schedule("0 9 * * *", async () => {
    console.log("[Cron] Running trial expiry check...");
    try {
      await runTrialExpiryCheck();
      console.log("[Cron] Trial expiry check completed successfully");
    } catch (error) {
      console.error("[Cron] Error running trial expiry check:", error);
    }
  });

  // Sales Conductor: Daily analysis — every day at 3:00 AM
  cron.schedule("0 3 * * *", async () => {
    console.log("[Cron] Running Sales Conductor daily analysis...");
    try {
      await runDailyForAllMerchants();
      console.log("[Cron] Sales Conductor daily analysis completed");
    } catch (error) {
      console.error("[Cron] Error running Sales Conductor daily:", error);
    }
  });

  // Sales Conductor: Weekly analysis — every Sunday at 4:00 AM
  cron.schedule("0 4 * * 0", async () => {
    console.log("[Cron] Running Sales Conductor weekly analysis...");
    try {
      await runWeeklyForAllMerchants();
      console.log("[Cron] Sales Conductor weekly analysis completed");
    } catch (error) {
      console.error("[Cron] Error running Sales Conductor weekly:", error);
    }
  });

  // Proactive Follow-up — every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    try {
      const result = await runFollowUps();
      if (result.sent > 0) {
        console.log(`[Cron] Follow-ups: ${result.sent} sent, ${result.cancelled} cancelled`);
      }
    } catch (error) {
      console.error("[Cron] Error running follow-ups:", error);
    }
  });

  // Loss Detector — every hour at minute 30
  cron.schedule("30 * * * *", async () => {
    try {
      const results = await detectLostDeals();
      if (results.length > 0) {
        console.log(`[Cron] Loss Detector: ${results.length} lost deals classified`);
      }
    } catch (error) {
      console.error("[Cron] Error running loss detector:", error);
    }
  });

  // AI Health Monitor — every 15 minutes at minute 7 (offset to avoid collision)
  cron.schedule("7,22,37,52 * * * *", async () => {
    try {
      await checkOpenAiHealth();
    } catch (error) {
      console.error("[Cron] Error running AI health check:", error);
    }
  });

  // AI Daily Report — every day at 8:00 AM (Riyadh time = 5:00 AM UTC)
  cron.schedule("0 5 * * *", async () => {
    console.log("[Cron] Sending AI daily usage report...");
    try {
      await sendDailyAiReport();
      console.log("[Cron] AI daily report sent successfully");
    } catch (error) {
      console.error("[Cron] Error sending AI daily report:", error);
    }
  });

  console.log("[Cron] Cron jobs started successfully");
  console.log("[Cron] - Appointment reminders: Every hour at minute 0");
  console.log("[Cron] - Trial expiry check: Every day at 9:00 AM");
  console.log("[Cron] - Sales Conductor daily: Every day at 3:00 AM");
  console.log("[Cron] - Sales Conductor weekly: Every Sunday at 4:00 AM");
  console.log("[Cron] - Proactive follow-ups: Every 15 minutes");
  console.log("[Cron] - Loss Detector: Every hour at minute 30");
  console.log("[Cron] - AI Health Monitor: Every 15 minutes");
  console.log("[Cron] - AI Daily Report: Every day at 8:00 AM (Riyadh)");
}

/**
 * Stop all Cron Jobs
 */
export function stopCronJobs() {
  console.log("[Cron] Stopping cron jobs...");
  cron.getTasks().forEach((task) => task.stop());
  console.log("[Cron] All cron jobs stopped");
}
