/**
 * نظام الإشعارات الشامل
 * يدير إرسال الإشعارات عبر Push Notifications و Email
 * مع دعم تفضيلات التاجر وساعات الهدوء
 */

import { db } from "../db";
import { sendPushNotification } from "./pushNotifications";
import { sendEmail } from "./emailService";
import { notificationPreferences, notificationLogs, notificationSettings } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export type NotificationType = 
  | 'new_order'
  | 'new_message'
  | 'appointment'
  | 'order_status'
  | 'missed_message'
  | 'whatsapp_disconnect'
  | 'weekly_report'
  | 'custom';

export type NotificationMethod = 'push' | 'email' | 'both';

export interface NotificationPayload {
  merchantId: number;
  type: NotificationType;
  title: string;
  body: string;
  url?: string;
  metadata?: Record<string, any>;
}

/**
 * التحقق من ساعات الهدوء
 */
function isInQuietHours(startTime: string, endTime: string): boolean {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;

  // إذا كانت ساعات الهدوء تمتد عبر منتصف الليل
  if (start > end) {
    return currentTime >= start || currentTime < end;
  }
  
  return currentTime >= start && currentTime < end;
}

/**
 * الحصول على تفضيلات الإشعارات للتاجر
 */
async function getMerchantPreferences(merchantId: number) {
  const prefs = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.merchantId, merchantId),
  });

  // إذا لم توجد تفضيلات، إنشاء تفضيلات افتراضية
  if (!prefs) {
    const [newPrefs] = await db.insert(notificationPreferences).values({
      merchantId,
      newOrdersEnabled: true,
      newMessagesEnabled: true,
      appointmentsEnabled: true,
      orderStatusEnabled: true,
      missedMessagesEnabled: true,
      whatsappDisconnectEnabled: true,
      preferredMethod: 'both',
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      instantNotifications: true,
      batchNotifications: false,
      batchInterval: 30,
    });
    return await db.query.notificationPreferences.findFirst({
      where: eq(notificationPreferences.id, newPrefs.insertId),
    });
  }

  return prefs;
}

/**
 * التحقق من الإعدادات العامة للنظام
 */
async function getGlobalSettings() {
  const settings = await db.query.notificationSettings.findFirst();
  
  // إذا لم توجد إعدادات، إنشاء إعدادات افتراضية
  if (!settings) {
    const [newSettings] = await db.insert(notificationSettings).values({
      newOrdersGlobalEnabled: true,
      newMessagesGlobalEnabled: true,
      appointmentsGlobalEnabled: true,
      orderStatusGlobalEnabled: true,
      missedMessagesGlobalEnabled: true,
      whatsappDisconnectGlobalEnabled: true,
      weeklyReportsGlobalEnabled: true,
      weeklyReportDay: 0,
      weeklyReportTime: '09:00',
    });
    return await db.query.notificationSettings.findFirst({
      where: eq(notificationSettings.id, newSettings.insertId),
    });
  }

  return settings;
}

/**
 * التحقق من إمكانية إرسال الإشعار
 */
async function canSendNotification(
  merchantId: number,
  type: NotificationType
): Promise<{ canSend: boolean; method: NotificationMethod }> {
  // التحقق من الإعدادات العامة
  const globalSettings = await getGlobalSettings();
  
  const globalEnabledMap: Record<NotificationType, boolean> = {
    new_order: globalSettings?.newOrdersGlobalEnabled ?? true,
    new_message: globalSettings?.newMessagesGlobalEnabled ?? true,
    appointment: globalSettings?.appointmentsGlobalEnabled ?? true,
    order_status: globalSettings?.orderStatusGlobalEnabled ?? true,
    missed_message: globalSettings?.missedMessagesGlobalEnabled ?? true,
    whatsapp_disconnect: globalSettings?.whatsappDisconnectGlobalEnabled ?? true,
    weekly_report: globalSettings?.weeklyReportsGlobalEnabled ?? true,
    custom: true,
  };

  if (!globalEnabledMap[type]) {
    return { canSend: false, method: 'both' };
  }

  // الحصول على تفضيلات التاجر
  const prefs = await getMerchantPreferences(merchantId);
  
  if (!prefs) {
    return { canSend: true, method: 'both' };
  }

  // التحقق من تفعيل نوع الإشعار
  const enabledMap: Record<NotificationType, boolean> = {
    new_order: prefs.newOrdersEnabled,
    new_message: prefs.newMessagesEnabled,
    appointment: prefs.appointmentsEnabled,
    order_status: prefs.orderStatusEnabled,
    missed_message: prefs.missedMessagesEnabled,
    whatsapp_disconnect: prefs.whatsappDisconnectEnabled,
    weekly_report: true,
    custom: true,
  };

  if (!enabledMap[type]) {
    return { canSend: false, method: prefs.preferredMethod };
  }

  // التحقق من ساعات الهدوء
  if (prefs.quietHoursEnabled && prefs.quietHoursStart && prefs.quietHoursEnd) {
    if (isInQuietHours(prefs.quietHoursStart, prefs.quietHoursEnd)) {
      // خلال ساعات الهدوء، لا نرسل إلا الإشعارات المهمة جداً
      const criticalTypes: NotificationType[] = ['whatsapp_disconnect'];
      if (!criticalTypes.includes(type)) {
        return { canSend: false, method: prefs.preferredMethod };
      }
    }
  }

  return { canSend: true, method: prefs.preferredMethod };
}

/**
 * إرسال إشعار شامل
 */
export async function sendNotification(payload: NotificationPayload): Promise<boolean> {
  try {
    // التحقق من إمكانية الإرسال
    const { canSend, method } = await canSendNotification(payload.merchantId, payload.type);
    
    if (!canSend) {
      console.log(`[Notification] Skipped: ${payload.type} for merchant ${payload.merchantId} (disabled or quiet hours)`);
      return false;
    }

    // تسجيل الإشعار في قاعدة البيانات
    const [logResult] = await db.insert(notificationLogs).values({
      merchantId: payload.merchantId,
      type: payload.type,
      method,
      title: payload.title,
      body: payload.body,
      url: payload.url,
      status: 'pending',
      metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
    });

    const logId = logResult.insertId;

    // إرسال الإشعار حسب الطريقة المفضلة
    let pushSuccess = false;
    let emailSuccess = false;

    if (method === 'push' || method === 'both') {
      try {
        pushSuccess = await sendPushNotification({
          merchantId: payload.merchantId,
          title: payload.title,
          body: payload.body,
          url: payload.url,
        });
      } catch (error) {
        console.error('[Notification] Push failed:', error);
      }
    }

    if (method === 'email' || method === 'both') {
      try {
        // الحصول على بريد التاجر
        const merchant = await db.query.merchants.findFirst({
          where: (merchants, { eq }) => eq(merchants.id, payload.merchantId),
        });

        if (merchant?.email) {
          emailSuccess = await sendEmail({
            to: merchant.email,
            subject: payload.title,
            html: `
              <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
                <h2 style="color: #2563eb;">${payload.title}</h2>
                <p style="font-size: 16px; line-height: 1.6;">${payload.body}</p>
                ${payload.url ? `<a href="${payload.url}" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px;">عرض التفاصيل</a>` : ''}
              </div>
            `,
            type: 'notification',
            merchantId: payload.merchantId,
            metadata: payload.metadata,
          });
        }
      } catch (error) {
        console.error('[Notification] Email failed:', error);
      }
    }

    // تحديث حالة الإشعار
    const success = (method === 'both' && (pushSuccess || emailSuccess)) ||
                    (method === 'push' && pushSuccess) ||
                    (method === 'email' && emailSuccess);

    await db.update(notificationLogs)
      .set({
        status: success ? 'sent' : 'failed',
        sentAt: success ? new Date() : null,
        error: success ? null : 'Failed to send notification',
      })
      .where(eq(notificationLogs.id, logId));

    return success;
  } catch (error) {
    console.error('[Notification] Error:', error);
    return false;
  }
}

/**
 * إرسال إشعار طلب جديد
 */
export async function notifyNewOrder(merchantId: number, orderId: number, orderTotal: number) {
  return sendNotification({
    merchantId,
    type: 'new_order',
    title: '🛒 طلب جديد',
    body: `لديك طلب جديد بقيمة ${orderTotal} ريال`,
    url: `/merchant/orders/${orderId}`,
    metadata: { orderId, orderTotal },
  });
}

/**
 * إرسال إشعار رسالة جديدة
 */
export async function notifyNewMessage(merchantId: number, customerName: string, messagePreview: string) {
  return sendNotification({
    merchantId,
    type: 'new_message',
    title: `💬 رسالة جديدة من ${customerName}`,
    body: messagePreview,
    url: '/merchant/conversations',
    metadata: { customerName },
  });
}

/**
 * إرسال إشعار موعد جديد
 */
export async function notifyNewAppointment(merchantId: number, appointmentId: number, customerName: string, serviceTitle: string, appointmentTime: Date) {
  const timeStr = new Date(appointmentTime).toLocaleString('ar-SA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return sendNotification({
    merchantId,
    type: 'appointment',
    title: '📅 موعد جديد',
    body: `موعد جديد مع ${customerName} لخدمة ${serviceTitle} في ${timeStr}`,
    url: `/merchant/calendar`,
    metadata: { appointmentId, customerName, serviceTitle },
  });
}

/**
 * إرسال إشعار تغيير حالة الطلب
 */
export async function notifyOrderStatusChange(merchantId: number, orderId: number, newStatus: string) {
  const statusMap: Record<string, string> = {
    pending: 'قيد الانتظار',
    confirmed: 'مؤكد',
    processing: 'قيد التجهيز',
    shipped: 'تم الشحن',
    delivered: 'تم التوصيل',
    cancelled: 'ملغي',
  };

  return sendNotification({
    merchantId,
    type: 'order_status',
    title: '📦 تحديث حالة الطلب',
    body: `تم تحديث حالة الطلب #${orderId} إلى: ${statusMap[newStatus] || newStatus}`,
    url: `/merchant/orders/${orderId}`,
    metadata: { orderId, newStatus },
  });
}

/**
 * إرسال إشعار رسائل فائتة
 */
export async function notifyMissedMessages(merchantId: number, count: number) {
  return sendNotification({
    merchantId,
    type: 'missed_message',
    title: '⚠️ رسائل فائتة',
    body: `لديك ${count} رسالة فائتة لم يتم الرد عليها`,
    url: '/merchant/conversations',
    metadata: { count },
  });
}

/**
 * إرسال إشعار فك ربط واتساب
 */
export async function notifyWhatsAppDisconnect(merchantId: number) {
  return sendNotification({
    merchantId,
    type: 'whatsapp_disconnect',
    title: '🔴 تنبيه: انقطاع اتصال واتساب',
    body: 'تم فك ربط حساب واتساب الخاص بك. يرجى إعادة الربط في أقرب وقت لضمان استمرار الخدمة.',
    url: '/merchant/whatsapp',
    metadata: { timestamp: new Date().toISOString() },
  });
}
