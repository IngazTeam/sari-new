import cron from 'node-cron';
import { getAllMerchants, getGoogleIntegration } from './db';
import { generateDailyReport, generateWeeklyReport, generateMonthlyReport, sendReportViaWhatsApp } from './sheetsReports';
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
function scheduleReport(expression: string, flag: ReportFlag, label: string,
  generate: typeof generateDailyReport, due: () => boolean = () => true) {
  // Local overlap guard only; durable cross-process receipts remain separate work.
  let running = false;
  cron.schedule(expression, async () => {
    if (running || !due()) return;
    running = true;
    try {
      const merchants = await getAllMerchants();
      for (const merchant of merchants) {
        try {
          const integration = await getGoogleIntegration(merchant.id, 'sheets');
          if (merchant.status === 'suspended' || !reportEnabled(integration, flag)) continue;
          const result = await generate(merchant.id, { expectedSpreadsheetId: integration!.sheetId! });
          if (result.success && result.data && await stillEnabled(merchant.id, integration, flag))
            await sendReportViaWhatsApp(merchant.id, label, result.data);
        } catch {
          console.error('[Sheets Cron] Merchant report unconfirmed');
        }
      }
    } catch {
      console.error('[Sheets Cron] Report scan unconfirmed');
    } finally { running = false; }
  });
}
export function startDailyReportsCron() {
  scheduleReport('59 23 * * *', 'sendDailyReports', 'يومي', generateDailyReport);
}
export function startWeeklyReportsCron() {
  scheduleReport('59 23 * * 0', 'sendWeeklyReports', 'أسبوعي', generateWeeklyReport);
}
export function startMonthlyReportsCron() {
  scheduleReport('59 23 28-31 * *', 'sendMonthlyReports', 'شهري', generateMonthlyReport, () => {
    const today = new Date(), tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.getMonth() !== today.getMonth();
  });
}
export function startAllSheetsCronJobs() {
  startDailyReportsCron(); startWeeklyReportsCron(); startMonthlyReportsCron();
  // Product imports require an explicit reviewed snapshot.
}
