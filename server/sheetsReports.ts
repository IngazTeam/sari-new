/**
 * نظام التقارير التلقائية في Google Sheets
 * يولد تقارير يومية/أسبوعية/شهرية تلقائياً
 */

import * as db from './db';
import * as sheets from './_core/googleSheets';

interface ReportData {
  period: string;
  totalOrders: number;
  totalRevenue: number;
  totalConversations: number;
  totalMessages: number;
  newCustomers: number;
  topProducts: Array<{ name: string; count: number }>;
  ordersByStatus: { [key: string]: number };
}

/**
 * توليد تقرير يومي
 */
export async function generateDailyReport(merchantId: number): Promise<{
  success: boolean;
  data?: ReportData;
  message: string;
}> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const data = await collectReportData(merchantId, today, tomorrow);

    // حفظ التقرير في Google Sheets
    await saveReportToSheets(merchantId, 'يومي', data);

    return {
      success: true,
      data,
      message: 'تم توليد التقرير اليومي بنجاح',
    };
  } catch (error: any) {
    console.error('[Sheets Reports] Error generating daily report:', error);
    return {
      success: false,
      message: error.message || 'فشل توليد التقرير اليومي',
    };
  }
}

/**
 * توليد تقرير أسبوعي
 */
export async function generateWeeklyReport(merchantId: number): Promise<{
  success: boolean;
  data?: ReportData;
  message: string;
}> {
  try {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const data = await collectReportData(merchantId, weekAgo, today);

    await saveReportToSheets(merchantId, 'أسبوعي', data);

    return {
      success: true,
      data,
      message: 'تم توليد التقرير الأسبوعي بنجاح',
    };
  } catch (error: any) {
    console.error('[Sheets Reports] Error generating weekly report:', error);
    return {
      success: false,
      message: error.message || 'فشل توليد التقرير الأسبوعي',
    };
  }
}

/**
 * توليد تقرير شهري
 */
export async function generateMonthlyReport(merchantId: number): Promise<{
  success: boolean;
  data?: ReportData;
  message: string;
}> {
  try {
    const today = new Date();
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const data = await collectReportData(merchantId, monthAgo, today);

    await saveReportToSheets(merchantId, 'شهري', data);

    return {
      success: true,
      data,
      message: 'تم توليد التقرير الشهري بنجاح',
    };
  } catch (error: any) {
    console.error('[Sheets Reports] Error generating monthly report:', error);
    return {
      success: false,
      message: error.message || 'فشل توليد التقرير الشهري',
    };
  }
}

/**
 * جمع بيانات التقرير
 */
async function collectReportData(
  merchantId: number,
  startDate: Date,
  endDate: Date
): Promise<ReportData> {
  // جلب الطلبات
  const orders = await db.getOrdersByMerchantId(merchantId);
  const periodOrders = orders.filter(order => {
    const orderDate = new Date(order.createdAt);
    return orderDate >= startDate && orderDate < endDate;
  });

  // حساب الإيرادات
  const totalRevenue = periodOrders.reduce((sum, order) => sum + order.totalAmount, 0);

  // جلب المحادثات
  const conversations = await db.getConversationsByMerchantId(merchantId);
  const periodConversations = conversations.filter(conv => {
    const convDate = new Date(conv.createdAt);
    return convDate >= startDate && convDate < endDate;
  });

  // حساب عدد الرسائل
  let totalMessages = 0;
  for (const conv of periodConversations) {
    const messages = await db.getMessagesByConversationId(conv.id);
    totalMessages += messages.length;
  }

  // حساب العملاء الجدد
  const newCustomers = periodConversations.length;

  // حساب أكثر المنتجات مبيعاً
  const productCounts: { [key: string]: number } = {};
  for (const order of periodOrders) {
    if (order.items) {
      try {
        const items = JSON.parse(order.items);
        for (const item of items) {
          productCounts[item.name] = (productCounts[item.name] || 0) + item.quantity;
        }
      } catch (e) {
        console.error('[Sheets Reports] Error parsing order items:', e);
      }
    }
  }

  const topProducts = Object.entries(productCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // حساب الطلبات حسب الحالة
  const ordersByStatus: { [key: string]: number } = {};
  for (const order of periodOrders) {
    ordersByStatus[order.status] = (ordersByStatus[order.status] || 0) + 1;
  }

  return {
    period: `${startDate.toLocaleDateString('ar-SA')} - ${endDate.toLocaleDateString('ar-SA')}`,
    totalOrders: periodOrders.length,
    totalRevenue,
    totalConversations: periodConversations.length,
    totalMessages,
    newCustomers,
    topProducts,
    ordersByStatus,
  };
}

/**
 * حفظ التقرير في Google Sheets
 */
async function saveReportToSheets(
  merchantId: number,
  reportType: string,
  data: ReportData
): Promise<void> {
  const integration = await db.getGoogleIntegration(merchantId, 'sheets');

  if (!integration || !integration.isActive || !integration.sheetId) {
    throw new Error('Google Sheets غير مربوط');
  }

  const spreadsheetId = integration.sheetId;

  // إنشاء صفحة التقارير إذا لم تكن موجودة
  try {
    await sheets.addSheet(merchantId, spreadsheetId, 'التقارير');
    
    // إضافة Headers
    await sheets.writeToSheet(merchantId, spreadsheetId, 'التقارير!A1:H1', [[
      'التاريخ',
      'نوع التقرير',
      'الفترة',
      'عدد الطلبات',
      'الإيرادات',
      'المحادثات',
      'الرسائل',
      'عملاء جدد'
    ]]);
  } catch (error) {
    // الصفحة موجودة بالفعل
  }

  // إضافة بيانات التقرير
  const reportDate = new Date().toLocaleDateString('ar-SA');
  const rowData = [[
    reportDate,
    reportType,
    data.period,
    data.totalOrders.toString(),
    `${data.totalRevenue} ريال`,
    data.totalConversations.toString(),
    data.totalMessages.toString(),
    data.newCustomers.toString()
  ]];

  await sheets.appendToSheet(
    merchantId,
    spreadsheetId,
    'التقارير!A:H',
    rowData
  );

  // إضافة تفاصيل المنتجات الأكثر مبيعاً
  if (data.topProducts.length > 0) {
    try {
      await sheets.addSheet(merchantId, spreadsheetId, `أكثر المنتجات مبيعاً - ${reportType}`);
      
      const productsData = [
        ['المنتج', 'الكمية المباعة'],
        ...data.topProducts.map(p => [p.name, p.count.toString()])
      ];

      await sheets.writeToSheet(
        merchantId,
        spreadsheetId,
        `أكثر المنتجات مبيعاً - ${reportType}!A1:B${productsData.length}`,
        productsData
      );
    } catch (error) {
      // الصفحة موجودة بالفعل
    }
  }

  // تحديث وقت آخر مزامنة
  await db.updateGoogleIntegration(integration.id, {
    lastSync: new Date().toISOString(),
  });

  console.log(`[Sheets Reports] ${reportType} report saved for merchant:`, merchantId);
}

/**
 * توليد تقرير مخصص
 */
export async function generateCustomReport(
  merchantId: number,
  startDate: Date,
  endDate: Date
): Promise<{
  success: boolean;
  data?: ReportData;
  message: string;
}> {
  try {
    const data = await collectReportData(merchantId, startDate, endDate);

    await saveReportToSheets(merchantId, 'مخصص', data);

    return {
      success: true,
      data,
      message: 'تم توليد التقرير المخصص بنجاح',
    };
  } catch (error: any) {
    console.error('[Sheets Reports] Error generating custom report:', error);
    return {
      success: false,
      message: error.message || 'فشل توليد التقرير المخصص',
    };
  }
}

/**
 * إرسال التقرير عبر WhatsApp
 */
export async function sendReportViaWhatsApp(
  merchantId: number,
  reportType: string,
  data: ReportData
): Promise<{ success: boolean; message: string }> {
  try {
    const merchant = await db.getMerchantById(merchantId);
    if (!merchant || !merchant.phone) {
      return { success: false, message: 'رقم التاجر غير متوفر' };
    }

    // تنسيق التقرير
    const reportMessage = `
📊 *تقرير ${reportType}*

📅 الفترة: ${data.period}

📦 *الطلبات:* ${data.totalOrders}
💰 *الإيرادات:* ${data.totalRevenue} ريال
💬 *المحادثات:* ${data.totalConversations}
✉️ *الرسائل:* ${data.totalMessages}
👥 *عملاء جدد:* ${data.newCustomers}

🏆 *أكثر المنتجات مبيعاً:*
${data.topProducts.map((p, i) => `${i + 1}. ${p.name} (${p.count})`).join('\n')}

📈 *الطلبات حسب الحالة:*
${Object.entries(data.ordersByStatus).map(([status, count]) => `• ${translateOrderStatus(status)}: ${count}`).join('\n')}

---
تم إنشاء التقرير بواسطة ساري 🤖
    `.trim();

    // إرسال الرسالة عبر WhatsApp
    const { sendTextMessage } = await import('./whatsapp');
    await sendTextMessage(merchant.phone, reportMessage);

    return {
      success: true,
      message: 'تم إرسال التقرير بنجاح',
    };
  } catch (error: any) {
    console.error('[Sheets Reports] Error sending report via WhatsApp:', error);
    return {
      success: false,
      message: error.message || 'فشل إرسال التقرير',
    };
  }
}

/**
 * ترجمة حالة الطلب إلى العربية
 */
function translateOrderStatus(status: string): string {
  const statusMap: { [key: string]: string } = {
    'pending': 'قيد الانتظار',
    'confirmed': 'مؤكد',
    'processing': 'قيد المعالجة',
    'shipped': 'تم الشحن',
    'delivered': 'تم التوصيل',
    'cancelled': 'ملغي',
    'refunded': 'تم الاسترجاع',
  };

  return statusMap[status] || status;
}
