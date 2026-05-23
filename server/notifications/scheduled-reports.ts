import { 
  getDueScheduledReports, 
  updateScheduledReport,
  getScheduledReportById
} from "../db-notifications";
// @ts-ignore
import { sendEmail } from "./email-notifications";
import { sendTextMessage } from "../whatsapp";
// @ts-ignore
import { getMerchantById, getConversationStats, getOrderStats, getCustomerStats } from "../db";

interface ReportData {
  conversations?: { total: number; newToday: number; resolved: number };
  orders?: { total: number; newToday: number; revenue: number };
  customers?: { total: number; newToday: number };
}

async function generateReportContent(merchantId: number, report: any): Promise<{ subject: string; html: string; text: string }> {
  const merchant = await (getMerchantById as any)(merchantId);
  const storeName = merchant?.store_name || 'متجرك';
  const reportData: ReportData = {};
  
  if (report.include_conversations) {
    const stats = await getConversationStats(merchantId);
    reportData.conversations = { total: stats?.total || 0, newToday: stats?.newToday || 0, resolved: stats?.resolved || 0 };
  }
  
  if (report.include_orders) {
    const stats = await getOrderStats(merchantId);
    // @ts-ignore
    reportData.orders = { total: stats?.total || 0, newToday: stats?.newToday || 0, revenue: stats?.revenue || 0 };
  }
  
  if (report.include_customers) {
    const stats = await getCustomerStats(merchantId);
    // @ts-ignore
    reportData.customers = { total: stats?.total || 0, newToday: stats?.newToday || 0 };
  }
  
  const periodLabel = report.report_type === 'daily' ? 'اليومي' : report.report_type === 'weekly' ? 'الأسبوعي' : 'الشهري';
  const subject = `📊 تقرير ${storeName} ${periodLabel} - ${new Date().toLocaleDateString('ar-SA')}`;
  
  let html = `<div dir="rtl" style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #16a34a; text-align: center;">📊 ${report.name}</h1>
    <p style="text-align: center; color: #666;">تقرير ${periodLabel} - ${new Date().toLocaleDateString('ar-SA')}</p>
    <hr style="border: 1px solid #eee; margin: 20px 0;">`;
  
  if (reportData.conversations) {
    html += `<div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
      <h3 style="color: #16a34a; margin-top: 0;">💬 المحادثات</h3>
      <p>إجمالي: <strong>${reportData.conversations.total}</strong> | جديدة: <strong>${reportData.conversations.newToday}</strong> | مغلقة: <strong>${reportData.conversations.resolved}</strong></p>
    </div>`;
  }
  
  if (reportData.orders) {
    html += `<div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
      <h3 style="color: #d97706; margin-top: 0;">🛒 الطلبات</h3>
      <p>إجمالي: <strong>${reportData.orders.total}</strong> | جديدة: <strong>${reportData.orders.newToday}</strong> | الإيرادات: <strong>${reportData.orders.revenue} ر.س</strong></p>
    </div>`;
  }
  
  if (reportData.customers) {
    html += `<div style="background: #dbeafe; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
      <h3 style="color: #2563eb; margin-top: 0;">👥 العملاء</h3>
      <p>إجمالي: <strong>${reportData.customers.total}</strong> | جدد: <strong>${reportData.customers.newToday}</strong></p>
    </div>`;
  }
  
  html += `<hr style="border: 1px solid #eee; margin: 20px 0;"><p style="text-align: center; color: #999; font-size: 12px;">تم إنشاء هذا التقرير تلقائياً بواسطة ساري</p></div>`;
  
  let text = `📊 ${report.name}\nتقرير ${periodLabel} - ${new Date().toLocaleDateString('ar-SA')}\n\n`;
  if (reportData.conversations) text += `💬 المحادثات: ${reportData.conversations.total} إجمالي | ${reportData.conversations.newToday} جديدة | ${reportData.conversations.resolved} مغلقة\n`;
  if (reportData.orders) text += `🛒 الطلبات: ${reportData.orders.total} إجمالي | ${reportData.orders.newToday} جديدة | ${reportData.orders.revenue} ر.س\n`;
  if (reportData.customers) text += `👥 العملاء: ${reportData.customers.total} إجمالي | ${reportData.customers.newToday} جدد\n`;
  
  return { subject, html, text };
}

function calculateNextSendTime(report: any): Date {
  const now = new Date();
  const [hours, minutes] = (report.schedule_time || '09:00').split(':').map(Number);
  let nextSend = new Date(now);
  nextSend.setHours(hours, minutes, 0, 0);
  
  switch (report.report_type) {
    case 'daily':
      if (nextSend <= now) nextSend.setDate(nextSend.getDate() + 1);
      break;
    case 'weekly':
      const targetDay = report.schedule_day || 0;
      const currentDay = now.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0 || (daysToAdd === 0 && nextSend <= now)) daysToAdd += 7;
      nextSend.setDate(nextSend.getDate() + daysToAdd);
      break;
    case 'monthly':
      const targetDate = report.schedule_day || 1;
      nextSend.setDate(targetDate);
      if (nextSend <= now) nextSend.setMonth(nextSend.getMonth() + 1);
      break;
  }
  return nextSend;
}

export async function sendReport(reportId: number): Promise<boolean> {
  const report = await getScheduledReportById(reportId);
  if (!report) return false;
  
  try {
    const { subject, html, text } = await generateReportContent(report.merchant_id, report);
    let emailSent = false, whatsappSent = false;
    
    if ((report.delivery_method === 'email' || report.delivery_method === 'both') && report.recipient_email) {
      emailSent = await sendEmail({ to: report.recipient_email, subject, html });
    }
    
    if ((report.delivery_method === 'whatsapp' || report.delivery_method === 'both') && report.recipient_phone) {
      try {
        await sendTextMessage(report.recipient_phone, text);
        whatsappSent = true;
      } catch (e) {
        whatsappSent = false;
      }
    }
    
    const nextSendAt = calculateNextSendTime(report);
    await updateScheduledReport(reportId, { lastSentAt: new Date(), nextSendAt });
    
    return emailSent || whatsappSent;
  } catch (error) {
    console.error(`[Scheduled Reports] Error sending report ${reportId}:`, error);
    return false;
  }
}

export async function processDueReports(): Promise<{ processed: number; sent: number; failed: number }> {
  const dueReports = await getDueScheduledReports();
  let sent = 0, failed = 0;
  
  for (const report of dueReports) {
    const success = await sendReport(report.id);
    if (success) sent++; else failed++;
  }
  
  return { processed: dueReports.length, sent, failed };
}