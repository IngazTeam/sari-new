/**
 * Cron Jobs للتقارير التلقائية في Google Sheets
 */

import cron from 'node-cron';
import * as db from './db';
import {
  generateDailyReport,
  generateWeeklyReport,
  generateMonthlyReport,
  sendReportViaWhatsApp,
} from './sheetsReports';

/**
 * تشغيل التقارير اليومية
 * يعمل كل يوم في الساعة 11:59 مساءً
 */
export function startDailyReportsCron() {
  cron.schedule('59 23 * * *', async () => {
    console.log('[Sheets Cron] Running daily reports...');

    try {
      // جلب جميع التجار الذين لديهم Google Sheets مربوط
      const merchants = await db.getAllMerchants();

      for (const merchant of merchants) {
        const integration = await db.getGoogleIntegration(merchant.id, 'sheets');

        if (!integration || !integration.isActive) {
          continue;
        }

        // توليد التقرير اليومي
        const result = await generateDailyReport(merchant.id);

        if (result.success && result.data) {
          console.log(`[Sheets Cron] Daily report generated for merchant ${merchant.id}`);

          // إرسال التقرير عبر WhatsApp (اختياري)
          // RPT-04 FIX: Safe JSON parse
          let settings: any = {};
          try { settings = integration.settings ? JSON.parse(integration.settings) : {}; } catch { /* corrupted */ }
          if (settings.sendDailyReports) {
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
      const merchants = await db.getAllMerchants();

      for (const merchant of merchants) {
        const integration = await db.getGoogleIntegration(merchant.id, 'sheets');

        if (!integration || !integration.isActive) {
          continue;
        }

        const result = await generateWeeklyReport(merchant.id);

        if (result.success && result.data) {
          console.log(`[Sheets Cron] Weekly report generated for merchant ${merchant.id}`);

          // RPT-04 FIX: Safe JSON parse
          let settings: any = {};
          try { settings = integration.settings ? JSON.parse(integration.settings) : {}; } catch { /* corrupted */ }
          if (settings.sendWeeklyReports) {
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

      const merchants = await db.getAllMerchants();

      for (const merchant of merchants) {
        const integration = await db.getGoogleIntegration(merchant.id, 'sheets');

        if (!integration || !integration.isActive) {
          continue;
        }

        const result = await generateMonthlyReport(merchant.id);

        if (result.success && result.data) {
          console.log(`[Sheets Cron] Monthly report generated for merchant ${merchant.id}`);

          // RPT-04 FIX: Safe JSON parse
          let settings: any = {};
          try { settings = integration.settings ? JSON.parse(integration.settings) : {}; } catch { /* corrupted */ }
          if (settings.sendMonthlyReports) {
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
  startProductAutoSyncCron();

  console.log('[Sheets Cron] All cron jobs started successfully');
}

/**
 * مزامنة المنتجات تلقائياً من Google Sheets
 * يعمل كل 30 دقيقة لضمان تحديث البوت بأحدث المنتجات
 */
export function startProductAutoSyncCron() {
  cron.schedule('*/30 * * * *', async () => {
    console.log('[Sheets Cron] Running product auto-sync...');

    try {
      const merchants = await db.getAllMerchants();

      for (const merchant of merchants) {
        const integration = await db.getGoogleIntegration(merchant.id, 'sheets');

        if (!integration || !integration.isActive || !integration.sheetId) {
          continue;
        }

        // Check if auto-sync is enabled in settings
        const settings = integration.settings ? JSON.parse(integration.settings) : {};
        if (settings.autoSyncProducts === false) {
          continue; // Skip if explicitly disabled
        }

        try {
          const { syncProductsFromSheets } = await import('./sheetsSync');
          const result = await syncProductsFromSheets(merchant.id);

          if (result.success && (result.created > 0 || result.updated > 0)) {
            console.log(`[Sheets Cron] Product sync for merchant ${merchant.id}: ${result.created} new, ${result.updated} updated`);
          }
        } catch (error) {
          console.error(`[Sheets Cron] Product sync error for merchant ${merchant.id}:`, error);
        }
      }
    } catch (error) {
      console.error('[Sheets Cron] Error running product auto-sync:', error);
    }
  });

  console.log('[Sheets Cron] Product auto-sync cron job started (every 30 minutes)');
}
