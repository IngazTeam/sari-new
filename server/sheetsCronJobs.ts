/**
 * Cron Jobs للتقارير التلقائية في Google Sheets
 */

import cron from 'node-cron';
import { getAllMerchants, getGoogleIntegration } from './db';
import {
  generateDailyReport,
  generateWeeklyReport,
  generateMonthlyReport,
  sendReportViaWhatsApp,
} from './sheetsReports';

type ReportFlag = 'sendDailyReports' | 'sendWeeklyReports' | 'sendMonthlyReports';
function reportEnabled(integration: any, flag: ReportFlag): boolean {
  if (!integration || Number(integration.isActive) !== 1 || !integration.sheetId || !integration.credentials
      || typeof integration.settings !== 'string' || integration.settings.length > 65536) return false;
  try { return JSON.parse(integration.settings)?.[flag] === true; } catch { return false; }
}
async function stillEnabled(merchantId: number, previous: any, flag: ReportFlag) {
  const current = await getGoogleIntegration(merchantId, 'sheets');
  return reportEnabled(current, flag) && current!.id === previous.id && current!.sheetId === previous.sheetId && current!.credentials === previous.credentials;
}

/**
 * تشغيل التقارير اليومية
 * يعمل كل يوم في الساعة 11:59 مساءً
 */
export function startDailyReportsCron() {
  cron.schedule('59 23 * * *', async () => {
    console.log('[Sheets Cron] Running daily reports...');

    try {
      // جلب جميع التجار الذين لديهم Google Sheets مربوط
      const merchants = await getAllMerchants();

      for (const merchant of merchants) {
        const integration = await getGoogleIntegration(merchant.id, 'sheets');

        if (merchant.status === 'suspended' || !reportEnabled(integration, 'sendDailyReports')) {
          continue;
        }

        // توليد التقرير اليومي
        const result = await generateDailyReport(merchant.id);

        if (result.success && result.data) {
          console.log(`[Sheets Cron] Daily report generated for merchant ${merchant.id}`);

          if (await stillEnabled(merchant.id, integration, 'sendDailyReports')) {
            await sendReportViaWhatsApp(merchant.id, 'يومي', result.data);
          }
        }
      }
    } catch (error) {
      console.error('[Sheets Cron] Error running daily reports:', error);
    }
  });

  console.log('[Sheets Cron] Daily reports cron job started (23:59 every day)');
}

/**
 * تشغيل التقارير الأسبوعية
 * يعمل كل يوم أحد في الساعة 11:59 مساءً
 */
export function startWeeklyReportsCron() {
  cron.schedule('59 23 * * 0', async () => {
    console.log('[Sheets Cron] Running weekly reports...');

    try {
      const merchants = await getAllMerchants();

      for (const merchant of merchants) {
        const integration = await getGoogleIntegration(merchant.id, 'sheets');

        if (merchant.status === 'suspended' || !reportEnabled(integration, 'sendWeeklyReports')) {
          continue;
        }

        const result = await generateWeeklyReport(merchant.id);

        if (result.success && result.data) {
          console.log(`[Sheets Cron] Weekly report generated for merchant ${merchant.id}`);

          if (await stillEnabled(merchant.id, integration, 'sendWeeklyReports')) {
            await sendReportViaWhatsApp(merchant.id, 'أسبوعي', result.data);
          }
        }
      }
    } catch (error) {
      console.error('[Sheets Cron] Error running weekly reports:', error);
    }
  });

  console.log('[Sheets Cron] Weekly reports cron job started (23:59 every Sunday)');
}

/**
 * تشغيل التقارير الشهرية
 * يعمل في اليوم الأخير من كل شهر في الساعة 11:59 مساءً
 */
export function startMonthlyReportsCron() {
  cron.schedule('59 23 28-31 * *', async () => {
    console.log('[Sheets Cron] Running monthly reports...');

    try {
      // التحقق من أن اليوم هو آخر يوم في الشهر
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      if (tomorrow.getMonth() === today.getMonth()) {
        // ليس آخر يوم في الشهر
        return;
      }

      const merchants = await getAllMerchants();

      for (const merchant of merchants) {
        const integration = await getGoogleIntegration(merchant.id, 'sheets');

        if (merchant.status === 'suspended' || !reportEnabled(integration, 'sendMonthlyReports')) {
          continue;
        }

        const result = await generateMonthlyReport(merchant.id);

        if (result.success && result.data) {
          console.log(`[Sheets Cron] Monthly report generated for merchant ${merchant.id}`);

          if (await stillEnabled(merchant.id, integration, 'sendMonthlyReports')) {
            await sendReportViaWhatsApp(merchant.id, 'شهري', result.data);
          }
        }
      }
    } catch (error) {
      console.error('[Sheets Cron] Error running monthly reports:', error);
    }
  });

  console.log('[Sheets Cron] Monthly reports cron job started (23:59 last day of month)');
}

/**
 * تشغيل جميع Cron Jobs
 */
export function startAllSheetsCronJobs() {
  startDailyReportsCron();
  startWeeklyReportsCron();
  startMonthlyReportsCron();
  // Product imports require an explicit reviewed snapshot; no unattended product writer.

  console.log('[Sheets Cron] All cron jobs started successfully');
}
