/**
 * نظام مزامنة البيانات مع Google Sheets
 * يحفظ الطلبات، العملاء المحتملين، والمحادثات تلقائياً
 */

import * as db from './db';
import * as sheets from './_core/googleSheets';

/**
 * إعداد Spreadsheet الرئيسي للتاجر
 */
export async function setupMerchantSpreadsheet(merchantId: number): Promise<{
  success: boolean;
  spreadsheetId?: string;
  message: string;
}> {
  try {
    const merchant = await db.getMerchantById(merchantId);
    if (!merchant) {
      return { success: false, message: 'التاجر غير موجود' };
    }

    // إنشاء Spreadsheet جديد
    const title = `ساري - ${merchant.businessName || 'بيانات المتجر'}`;
    const result = await sheets.createSpreadsheet(merchantId, title);

    if (!result.success || !result.spreadsheetId) {
      return result;
    }

    const spreadsheetId = result.spreadsheetId;

    // إنشاء الصفحات المطلوبة
    await sheets.addSheet(merchantId, spreadsheetId, 'الطلبات');
    await sheets.addSheet(merchantId, spreadsheetId, 'العملاء المحتملين');
    await sheets.addSheet(merchantId, spreadsheetId, 'المحادثات');
    await sheets.addSheet(merchantId, spreadsheetId, 'المخزون');

    // إضافة Headers للطلبات
    await sheets.writeToSheet(merchantId, spreadsheetId, 'الطلبات!A1:J1', [[
      'رقم الطلب',
      'التاريخ',
      'الوقت',
      'اسم العميل',
      'رقم الجوال',
      'المنتجات',
      'الإجمالي',
      'الحالة',
      'رقم التتبع',
      'ملاحظات'
    ]]);

    // إضافة Headers للعملاء المحتملين
    await sheets.writeToSheet(merchantId, spreadsheetId, 'العملاء المحتملين!A1:H1', [[
      'التاريخ',
      'اسم العميل',
      'رقم الجوال',
      'المصدر',
      'الحالة',
      'آخر تفاعل',
      'عدد الرسائل',
      'ملاحظات'
    ]]);

    // إضافة Headers للمحادثات
    await sheets.writeToSheet(merchantId, spreadsheetId, 'المحادثات!A1:F1', [[
      'التاريخ',
      'الوقت',
      'اسم العميل',
      'رقم الجوال',
      'الاتجاه',
      'الرسالة'
    ]]);

    // إضافة Headers للمخزون
    await sheets.writeToSheet(merchantId, spreadsheetId, 'المخزون!A1:F1', [[
      'رقم المنتج',
      'اسم المنتج',
      'الفئة',
      'السعر',
      'الكمية المتاحة',
      'آخر تحديث'
    ]]);

    console.log('[Sheets Sync] Setup completed for merchant:', merchantId);

    return {
      success: true,
      spreadsheetId,
      message: 'تم إعداد Spreadsheet بنجاح',
    };
  } catch (error: any) {
    console.error('[Sheets Sync] Setup error:', error);
    return {
      success: false,
      message: error.message || 'فشل إعداد Spreadsheet',
    };
  }
}

/**
 * مزامنة طلب جديد إلى Google Sheets
 */
export async function syncOrderToSheets(orderId: number): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const order = await db.getOrderById(orderId);
    if (!order) {
      return { success: false, message: 'الطلب غير موجود' };
    }

    const merchantId = order.merchantId;
    const integration = await db.getGoogleIntegration(merchantId, 'sheets');

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
      `${order.totalAmount} ريال`,
      translateOrderStatus(order.status),
      order.trackingNumber || '-',
      order.notes || '-'
    ]];

    // إضافة الصف إلى Sheet
    const result = await sheets.appendToSheet(
      merchantId,
      spreadsheetId,
      'الطلبات!A:J',
      rowData
    );

    if (result.success) {
      // تحديث وقت آخر مزامنة
      await db.updateGoogleIntegration(integration.id, {
        lastSync: new Date().toISOString(),
      });
    }

    return result;
  } catch (error: any) {
    console.error('[Sheets Sync] Error syncing order:', error);
    return {
      success: false,
      message: error.message || 'فشل مزامنة الطلب',
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
    const integration = await db.getGoogleIntegration(merchantId, 'sheets');

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
      await db.updateGoogleIntegration(integration.id, {
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
 * تصدير المحادثات إلى Google Sheets
 */
export async function exportConversationsToSheets(
  merchantId: number,
  conversationIds: number[]
): Promise<{ success: boolean; message: string }> {
  try {
    const integration = await db.getGoogleIntegration(merchantId, 'sheets');

    if (!integration || !integration.isActive || !integration.sheetId) {
      return { success: false, message: 'Google Sheets غير مربوط' };
    }

    const spreadsheetId = integration.sheetId;

    // جلب المحادثات والرسائل
    const rows: any[][] = [];

    for (const conversationId of conversationIds) {
      const conversation = await db.getConversationById(conversationId);
      if (!conversation) continue;

      const messages = await db.getMessagesByConversationId(conversationId);

      for (const message of messages) {
        const messageDate = new Date(message.createdAt);
        const dateStr = messageDate.toLocaleDateString('ar-SA');
        const timeStr = messageDate.toLocaleTimeString('ar-SA', {
          hour: '2-digit',
          minute: '2-digit',
        });

        rows.push([
          dateStr,
          timeStr,
          conversation.customerName || 'غير محدد',
          conversation.customerPhone,
          message.direction === 'incoming' ? 'وارد' : 'صادر',
          message.content || '-'
        ]);
      }
    }

    if (rows.length === 0) {
      return { success: false, message: 'لا توجد محادثات للتصدير' };
    }

    const result = await sheets.appendToSheet(
      merchantId,
      spreadsheetId,
      'المحادثات!A:F',
      rows
    );

    if (result.success) {
      await db.updateGoogleIntegration(integration.id, {
        lastSync: new Date().toISOString(),
      });
    }

    return result;
  } catch (error: any) {
    console.error('[Sheets Sync] Error exporting conversations:', error);
    return {
      success: false,
      message: error.message || 'فشل تصدير المحادثات',
    };
  }
}

/**
 * مزامنة المخزون إلى Google Sheets
 */
export async function syncInventoryToSheets(merchantId: number): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const integration = await db.getGoogleIntegration(merchantId, 'sheets');

    if (!integration || !integration.isActive || !integration.sheetId) {
      return { success: false, message: 'Google Sheets غير مربوط' };
    }

    const spreadsheetId = integration.sheetId;

    // جلب المنتجات
    const products = await db.getProductsByMerchantId(merchantId);

    if (products.length === 0) {
      return { success: false, message: 'لا توجد منتجات للمزامنة' };
    }

    // مسح البيانات القديمة (بعد الـ header)
    // ثم إضافة البيانات الجديدة
    const rows = products.map(product => [
      product.id.toString(),
      product.name,
      product.category || '-',
      `${product.price} ريال`,
      product.stock?.toString() || '0',
      new Date().toLocaleDateString('ar-SA')
    ]);

    // كتابة البيانات (بدءاً من الصف 2)
    const result = await sheets.writeToSheet(
      merchantId,
      spreadsheetId,
      `المخزون!A2:F${rows.length + 1}`,
      rows
    );

    if (result.success) {
      await db.updateGoogleIntegration(integration.id, {
        lastSync: new Date().toISOString(),
      });
    }

    return result;
  } catch (error: any) {
    console.error('[Sheets Sync] Error syncing inventory:', error);
    return {
      success: false,
      message: error.message || 'فشل مزامنة المخزون',
    };
  }
}

/**
 * تحديث المخزون من Google Sheets
 */
export async function updateInventoryFromSheets(merchantId: number): Promise<{
  success: boolean;
  updatedCount: number;
  message: string;
}> {
  try {
    const integration = await db.getGoogleIntegration(merchantId, 'sheets');

    if (!integration || !integration.isActive || !integration.sheetId) {
      return { success: false, updatedCount: 0, message: 'Google Sheets غير مربوط' };
    }

    const spreadsheetId = integration.sheetId;

    // قراءة البيانات من Sheet
    const result = await sheets.readFromSheet(
      merchantId,
      spreadsheetId,
      'المخزون!A2:F'
    );

    if (!result.success || !result.values || result.values.length === 0) {
      return { success: false, updatedCount: 0, message: 'لا توجد بيانات للتحديث' };
    }

    let updatedCount = 0;

    // تحديث كل منتج
    for (const row of result.values) {
      const [productIdStr, , , , stockStr] = row;
      
      if (!productIdStr || !stockStr) continue;

      const productId = parseInt(productIdStr);
      const stock = parseInt(stockStr);

      if (isNaN(productId) || isNaN(stock)) continue;

      try {
        await db.updateProduct(productId, { stock });
        updatedCount++;
      } catch (error) {
        console.error(`[Sheets Sync] Error updating product ${productId}:`, error);
      }
    }

    if (updatedCount > 0) {
      await db.updateGoogleIntegration(integration.id, {
        lastSync: new Date().toISOString(),
      });
    }

    return {
      success: true,
      updatedCount,
      message: `تم تحديث ${updatedCount} منتج بنجاح`,
    };
  } catch (error: any) {
    console.error('[Sheets Sync] Error updating inventory from sheets:', error);
    return {
      success: false,
      updatedCount: 0,
      message: error.message || 'فشل تحديث المخزون',
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
