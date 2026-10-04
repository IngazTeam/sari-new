/**
 * نظام مزامنة البيانات مع Google Sheets
 * يحفظ الطلبات، العملاء المحتملين، والمحادثات تلقائياً
 */

import {
  getGoogleIntegration,
  getOrderById,
  updateGoogleIntegration,
} from './db';
import * as sheets from './_core/googleSheets';
import { formatMinorMoney } from '../shared/product-money';
import type { SheetEvidenceHooks } from './integrations/salla-sheet-evidence';

/**
 * مزامنة طلب جديد إلى Google Sheets
 */
export async function syncOrderToSheets(orderId: number, guard?: { merchantId:number; beforeSend:()=>Promise<void>; evidence?:SheetEvidenceHooks }): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const order = await getOrderById(orderId);
    if (!order) {
      return { success: false, message: 'الطلب غير موجود' };
    }

    const merchantId = order.merchantId;
    if (guard && merchantId !== guard.merchantId) throw new Error('Order merchant changed');
    const integration = await getGoogleIntegration(merchantId, 'sheets');

    if (!integration || !integration.isActive || !integration.sheetId) {
      return { success: false, message: 'Google Sheets غير مربوط' };
    }

    const spreadsheetId = integration.sheetId;

    // تنسيق بيانات الطلب
    const orderDate = new Date(order.createdAt);
    const dateStr = orderDate.toLocaleDateString('ar-SA');
    const timeStr = orderDate.toLocaleTimeString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
    });

    // تنسيق المنتجات
    let productsStr = 'N/A';
    if (order.items) {
      try {
        const items = JSON.parse(order.items);
        productsStr = items.map((item: any) =>
          `${item.name} (${item.quantity}x)`
        ).join(', ');
      } catch (e) {
        console.error('[Sheets Sync] Error parsing order items:', e);
      }
    }

    const rowData = [[
      order.id.toString(),
      dateStr,
      timeStr,
      order.customerName || 'غير محدد',
      order.customerPhone || 'غير محدد',
      productsStr,
      formatMinorMoney(order.totalAmount),
      translateOrderStatus(order.status),
      order.trackingNumber || '-',
      order.notes || '-'
    ]];

    // إضافة الصف إلى Sheet
    const result = await sheets.appendToSheet(
      merchantId,
      spreadsheetId,
      'الطلبات!A:J',
      rowData,
      guard ? { raw:true, evidence:guard.evidence ? {...guard.evidence,integrationId:integration.id} : undefined, beforeSend:async()=>{
        const current=await getGoogleIntegration(merchantId,'sheets');
        const identity=(value:string|null)=>{ const credentials=JSON.parse(value||'{}');return credentials.refresh_token||credentials.access_token; };
        if (!current || !current.isActive || current.id!==integration.id || current.sheetId!==spreadsheetId
          || !identity(integration.credentials) || identity(current.credentials)!==identity(integration.credentials)) {
          throw new Error('Sheets connection changed');
        }
        await guard.beforeSend();
      }} : undefined
    );

    if (result.success) {
      // تحديث وقت آخر مزامنة
      // An accepted append remains successful if this optional display timestamp
      // cannot be written. It must never encourage another append of the row.
      try { await updateGoogleIntegration(integration.id, {lastSync: new Date().toISOString()}); }
      catch { console.error('[Sheets Sync] Last-sync timestamp unavailable after accepted append'); }
    }

    return result;
  } catch (error: any) {
    console.error('[Sheets Sync] Error syncing order:', guard?.evidence ? 'sync unconfirmed' : error);
    return {
      success: false,
      message: guard?.evidence ? 'تعذر تأكيد مزامنة الطلب' : error.message || 'فشل مزامنة الطلب',
    };
  }
}

/**
 * مزامنة عميل محتمل إلى Google Sheets
 */
export async function syncLeadToSheets(
  merchantId: number,
  lead: {
    customerName: string;
    customerPhone: string;
    source: string;
    status: string;
    lastInteraction: Date;
    messageCount: number;
    notes?: string;
  }
): Promise<{ success: boolean; message: string }> {
  try {
    const integration = await getGoogleIntegration(merchantId, 'sheets');

    if (!integration || !integration.isActive || !integration.sheetId) {
      return { success: false, message: 'Google Sheets غير مربوط' };
    }

    const spreadsheetId = integration.sheetId;

    const dateStr = new Date().toLocaleDateString('ar-SA');
    const lastInteractionStr = lead.lastInteraction.toLocaleDateString('ar-SA');

    const rowData = [[
      dateStr,
      lead.customerName,
      lead.customerPhone,
      lead.source,
      lead.status,
      lastInteractionStr,
      lead.messageCount.toString(),
      lead.notes || '-'
    ]];

    const result = await sheets.appendToSheet(
      merchantId,
      spreadsheetId,
      'العملاء المحتملين!A:H',
      rowData
    );

    if (result.success) {
      await updateGoogleIntegration(integration.id, {
        lastSync: new Date().toISOString(),
      });
    }

    return result;
  } catch (error: any) {
    console.error('[Sheets Sync] Error syncing lead:', error);
    return {
      success: false,
      message: error.message || 'فشل مزامنة العميل المحتمل',
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
