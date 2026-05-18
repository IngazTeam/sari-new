/**
 * نظام التقارير التلقائية في Google Sheets
 * يولد تقارير يومية/أسبوعية/شهرية تلقائياً
 */

import {
  getConversationsByMerchantId,
  getGoogleIntegration,
  getMerchantById,
  getMessagesByConversationId,
  getOrdersByMerchantId,
  getPool,
  getWhatsAppInstancesByMerchantId,
  updateGoogleIntegration,
} from './db';
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
  const pool = await getPool();

  // RPT-03 FIX: Filter orders in SQL instead of loading all into memory
  let periodOrders: any[] = [];
  if (pool) {
    try {
      const [rows] = await pool.execute(
        `SELECT * FROM orders WHERE merchant_id = ? AND created_at >= ? AND created_at < ?`,
        [merchantId, startDate.toISOString(), endDate.toISOString()]
      );
      periodOrders = rows as any[];
    } catch {
      // Fallback to in-memory filter if SQL fails
      const orders = await getOrdersByMerchantId(merchantId);
      periodOrders = orders.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= startDate && orderDate < endDate;
      });
    }
  }

  // حساب الإيرادات
  const totalRevenue = periodOrders.reduce((sum, order) => {
    const amount = order.totalAmount ?? order.total_amount ?? 0;
    return sum + Number(amount);
  }, 0);

  // RPT-02 FIX: Count conversations and messages with aggregate SQL queries
  let totalConversations = 0;
  let totalMessages = 0;
  let newCustomers = 0;

  if (pool) {
    try {
      // Conversation count
      const [convRows] = await pool.execute(
        `SELECT COUNT(*) as cnt FROM conversations 
         WHERE merchant_id = ? AND created_at >= ? AND created_at < ?`,
        [merchantId, startDate.toISOString(), endDate.toISOString()]
      );
      totalConversations = Number((convRows as any[])[0]?.cnt) || 0;
      newCustomers = totalConversations;

      // Message count — single aggregate instead of N+1
      const [msgRows] = await pool.execute(
        `SELECT COUNT(*) as cnt FROM messages m
         INNER JOIN conversations c ON c.id = m.conversation_id
         WHERE c.merchant_id = ? AND m.created_at >= ? AND m.created_at < ?`,
        [merchantId, startDate.toISOString(), endDate.toISOString()]
      );
      totalMessages = Number((msgRows as any[])[0]?.cnt) || 0;
    } catch (e: any) {
      console.warn('[Sheets Reports] Aggregate query fallback:', e.message);
      // Fallback to old logic
      const conversations = await getConversationsByMerchantId(merchantId);
      const periodConversations = conversations.filter(conv => {
        const convDate = new Date(conv.createdAt);
        return convDate >= startDate && convDate < endDate;
      });
      totalConversations = periodConversations.length;
      newCustomers = periodConversations.length;
      for (const conv of periodConversations) {
        const messages = await getMessagesByConversationId(conv.id);
        totalMessages += messages.length;
      }
    }
  }

  // حساب أكثر المنتجات مبيعاً
  const productCounts: { [key: string]: number } = {};
  for (const order of periodOrders) {
    const rawItems = order.items;
    if (rawItems) {
      try {
        const items = typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems;
        for (const item of items) {
          const name = item.name || item.productName || 'غير معروف';
          productCounts[name] = (productCounts[name] || 0) + (item.quantity || 1);
        }
      } catch (e) {
        // Silent — skip malformed items
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
    const status = order.status || 'unknown';
    ordersByStatus[status] = (ordersByStatus[status] || 0) + 1;
  }

  return {
    period: `${startDate.toLocaleDateString('ar-SA')} - ${endDate.toLocaleDateString('ar-SA')}`,
    totalOrders: periodOrders.length,
    totalRevenue,
    totalConversations,
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
  const integration = await getGoogleIntegration(merchantId, 'sheets');

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
  await updateGoogleIntegration(integration.id, {
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
    const merchant = await getMerchantById(merchantId);
    if (!merchant || !merchant.phone) {
      return { success: false, message: 'رقم التاجر غير متوفر' };
    }

    // RPT-01 FIX: Use merchant's own WhatsApp instance (not global ENV credentials)
    const instances = await getWhatsAppInstancesByMerchantId(merchantId);
    const activeInstance = instances.find((i: any) => i.status === 'active');
    if (!activeInstance) {
      console.warn(`[Sheets Reports] No active WhatsApp instance for merchant ${merchantId} — skipping report send`);
      return { success: false, message: 'لا يوجد اتصال واتساب نشط' };
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
${data.topProducts.length > 0 ? data.topProducts.map((p, i) => `${i + 1}. ${p.name} (${p.count})`).join('\n') : 'لا توجد مبيعات في هذه الفترة'}

📈 *الطلبات حسب الحالة:*
${Object.keys(data.ordersByStatus).length > 0 ? Object.entries(data.ordersByStatus).map(([status, count]) => `• ${translateOrderStatus(status)}: ${count}`).join('\n') : 'لا توجد طلبات'}

---
تم إنشاء التقرير بواسطة ساري 🤖
    `.trim();

    // إرسال الرسالة عبر WhatsApp instance التاجر
    const { sendMessageWithCredentials } = await import('./whatsapp');
    const result = await sendMessageWithCredentials(
      (activeInstance as any).instanceId,
      (activeInstance as any).token,
      (activeInstance as any).apiUrl || 'https://api.green-api.com',
      merchant.phone,
      reportMessage
    );

    if (!result.success) {
      console.error(`[Sheets Reports] WhatsApp send failed for merchant ${merchantId}:`, result.error);
      return { success: false, message: result.error || 'فشل إرسال التقرير' };
    }

    console.log(`[Sheets Reports] ✅ ${reportType} report sent via WhatsApp to merchant ${merchantId}`);
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
