/**
 * Cron Job للتقارير الأسبوعية
 * يرسل تقرير أسبوعي لكل تاجر كل يوم أحد الساعة 9 صباحاً
 */

import cron from 'node-cron';
import * as db from './db';
import { sendEmail } from './_core/emailService';
import { sendNotification } from './_core/notificationService';
import { notificationSettings } from '../drizzle/schema';

interface WeeklyStats {
  merchantId: number;
  merchantName: string;
  totalOrders: number;
  totalRevenue: number;
  totalMessages: number;
  totalConversations: number;
  newCustomers: number;
  appointmentsBooked: number;
}

/**
 * جمع إحصائيات الأسبوع الماضي للتاجر
 */
async function getWeeklyStats(merchantId: number): Promise<WeeklyStats> {
  const merchant = await db.getMerchantById(merchantId);
  
  // حساب تاريخ بداية ونهاية الأسبوع الماضي
  const now = new Date();
  const lastSunday = new Date(now);
  lastSunday.setDate(now.getDate() - now.getDay()); // آخر يوم أحد
  lastSunday.setHours(0, 0, 0, 0);
  
  const lastSaturday = new Date(lastSunday);
  lastSaturday.setDate(lastSunday.getDate() - 1); // آخر يوم سبت
  lastSaturday.setHours(23, 59, 59, 999);
  
  const weekStart = new Date(lastSaturday);
  weekStart.setDate(lastSaturday.getDate() - 6); // بداية الأسبوع (الأحد قبل الماضي)
  weekStart.setHours(0, 0, 0, 0);

  // جمع الإحصائيات
  const orders = await db.getOrdersByMerchantId(merchantId);
  const weekOrders = orders.filter(o => {
    const orderDate = new Date(o.createdAt);
    return orderDate >= weekStart && orderDate <= lastSaturday;
  });

  const conversations = await db.getConversationsByMerchantId(merchantId);
  const weekConversations = conversations.filter(c => {
    const convDate = new Date(c.createdAt);
    return convDate >= weekStart && convDate <= lastSaturday;
  });

  // حساب إجمالي الرسائل
  let totalMessages = 0;
  for (const conv of weekConversations) {
    const messages = await db.getMessagesByConversationId(conv.id);
    totalMessages += messages.length;
  }

  // حساب العملاء الجدد
  const newCustomers = weekConversations.filter(c => {
    const convDate = new Date(c.createdAt);
    return convDate >= weekStart && convDate <= lastSaturday;
  }).length;

  // حساب المواعيد المحجوزة
  const appointments = await db.getAppointmentsByMerchantId(merchantId);
  const weekAppointments = appointments.filter(a => {
    const appDate = new Date(a.createdAt);
    return appDate >= weekStart && appDate <= lastSaturday;
  });

  return {
    merchantId,
    merchantName: merchant?.businessName || 'تاجر',
    totalOrders: weekOrders.length,
    totalRevenue: weekOrders.reduce((sum, o) => sum + o.totalAmount, 0),
    totalMessages,
    totalConversations: weekConversations.length,
    newCustomers,
    appointmentsBooked: weekAppointments.length,
  };
}

/**
 * إنشاء محتوى HTML للتقرير الأسبوعي
 */
function generateWeeklyReportHTML(stats: WeeklyStats): string {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>التقرير الأسبوعي</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f5f7fa;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
    }
    .header p {
      margin: 10px 0 0 0;
      opacity: 0.9;
    }
    .content {
      padding: 30px;
    }
    .greeting {
      font-size: 18px;
      color: #333;
      margin-bottom: 20px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      margin: 30px 0;
    }
    .stat-card {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      border: 2px solid #e9ecef;
    }
    .stat-value {
      font-size: 32px;
      font-weight: bold;
      color: #667eea;
      margin-bottom: 5px;
    }
    .stat-label {
      font-size: 14px;
      color: #6c757d;
    }
    .highlight {
      background: #e7f3ff;
      border-right: 4px solid #2196F3;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .footer {
      background: #f8f9fa;
      padding: 20px;
      text-align: center;
      color: #6c757d;
      font-size: 14px;
    }
    .button {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 12px 30px;
      text-decoration: none;
      border-radius: 6px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 التقرير الأسبوعي</h1>
      <p>ملخص أداء متجرك خلال الأسبوع الماضي</p>
    </div>
    
    <div class="content">
      <div class="greeting">
        مرحباً ${stats.merchantName}! 👋
      </div>
      
      <p>إليك ملخص شامل لأداء متجرك خلال الأسبوع الماضي:</p>
      
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${stats.totalOrders}</div>
          <div class="stat-label">طلبات جديدة</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-value">${stats.totalRevenue.toFixed(2)} ريال</div>
          <div class="stat-label">إجمالي المبيعات</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-value">${stats.totalMessages}</div>
          <div class="stat-label">رسائل واتساب</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-value">${stats.totalConversations}</div>
          <div class="stat-label">محادثات نشطة</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-value">${stats.newCustomers}</div>
          <div class="stat-label">عملاء جدد</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-value">${stats.appointmentsBooked}</div>
          <div class="stat-label">مواعيد محجوزة</div>
        </div>
      </div>
      
      ${stats.totalOrders > 0 ? `
      <div class="highlight">
        <strong>🎉 أداء رائع!</strong><br>
        متوسط قيمة الطلب: ${(stats.totalRevenue / stats.totalOrders).toFixed(2)} ريال
      </div>
      ` : ''}
      
      <div style="text-align: center;">
        <a href="https://sary.live/merchant/dashboard" class="button">
          عرض التفاصيل الكاملة
        </a>
      </div>
    </div>
    
    <div class="footer">
      <p>هذا تقرير تلقائي يُرسل كل يوم أحد</p>
      <p>يمكنك تعطيل هذه التقارير من إعدادات الإشعارات</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * إرسال التقرير الأسبوعي لتاجر واحد
 */
async function sendWeeklyReportToMerchant(merchantId: number): Promise<boolean> {
  try {
    const merchant = await db.getMerchantById(merchantId);
    if (!merchant || !merchant.email) {
      console.log(`[Weekly Report] Merchant ${merchantId} has no email, skipping`);
      return false;
    }

    // جمع الإحصائيات
    const stats = await getWeeklyStats(merchantId);

    // إرسال البريد الإلكتروني
    const emailHtml = generateWeeklyReportHTML(stats);
    const emailSent = await sendEmail({
      to: merchant.email,
      subject: `📊 التقرير الأسبوعي - ${stats.merchantName}`,
      html: emailHtml,
      type: 'report',
      merchantId,
      metadata: { reportType: 'weekly', stats },
    });

    // إرسال إشعار Push أيضاً
    if (emailSent) {
      await sendNotification({
        merchantId,
        type: 'weekly_report',
        title: '📊 التقرير الأسبوعي جاهز',
        body: `${stats.totalOrders} طلبات، ${stats.totalRevenue.toFixed(0)} ريال مبيعات هذا الأسبوع`,
        url: '/merchant/dashboard',
        metadata: { stats },
      });
    }

    return emailSent;
  } catch (error) {
    console.error(`[Weekly Report] Error sending report to merchant ${merchantId}:`, error);
    return false;
  }
}

/**
 * إرسال التقارير الأسبوعية لجميع التجار
 */
async function sendWeeklyReportsToAll(): Promise<void> {
  console.log('[Weekly Report Cron] Starting weekly reports job...');
  
  try {
    const dbConn = await db.getDb();
    if (!dbConn) {
      console.error('[Weekly Report Cron] Database connection failed');
      return;
    }

    // التحقق من الإعدادات العامة
    const settings = await dbConn.query.notificationSettings.findFirst();
    if (settings && !settings.weeklyReportsGlobalEnabled) {
      console.log('[Weekly Report Cron] Weekly reports are globally disabled');
      return;
    }

    // الحصول على جميع التجار
    const merchants = await db.getAllMerchants();
    console.log(`[Weekly Report Cron] Found ${merchants.length} merchants`);

    let successCount = 0;
    let failCount = 0;

    for (const merchant of merchants) {
      const success = await sendWeeklyReportToMerchant(merchant.id);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
      
      // تأخير بسيط بين كل تاجر لتجنب الضغط على الخادم
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[Weekly Report Cron] Completed: ${successCount} sent, ${failCount} failed`);
  } catch (error) {
    console.error('[Weekly Report Cron] Error:', error);
  }
}

/**
 * تهيئة Cron Job
 * يعمل كل يوم أحد الساعة 9 صباحاً (بتوقيت السعودية UTC+3)
 */
export function initWeeklyReportCron() {
  // Cron expression: 0 9 * * 0 (كل يوم أحد الساعة 9 صباحاً)
  // بما أن الخادم يعمل بتوقيت UTC، نحتاج لطرح 3 ساعات = 6 صباحاً UTC
  cron.schedule('0 6 * * 0', async () => {
    console.log('[Weekly Report Cron] Triggered at', new Date().toISOString());
    await sendWeeklyReportsToAll();
  }, {
    timezone: 'UTC'
  });

  console.log('[Weekly Report Cron] Initialized - will run every Sunday at 9:00 AM (Saudi time)');
}

/**
 * إرسال تقرير يدوي (للاختبار)
 */
export async function sendManualWeeklyReport(merchantId: number): Promise<boolean> {
  console.log(`[Weekly Report] Sending manual report to merchant ${merchantId}`);
  return await sendWeeklyReportToMerchant(merchantId);
}
