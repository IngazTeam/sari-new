/**
 * نظام الإشعارات الشامل
 * يدير إرسال الإشعارات عبر Push Notifications و Email
 * مع دعم تفضيلات التاجر وساعات الهدوء
 */

import { getDb } from "../db";
import { sendPushNotification } from "./pushNotifications";
import { sendEmail } from "./emailService";
import { notificationPreferences, notificationLogs, notificationSettings, merchants, users } from "../../drizzle/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { z } from 'zod';
import { formatMinorMoney } from '../../shared/product-money';
import type { NoticeHooks } from '../integrations/notice-evidence';
import { deliverNotices,prepareEmailNotice,preparePushNotices,suppressedNotice } from './notice-delivery';

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

function escapeNotificationHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function notificationEmailUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const base = new URL(process.env.VITE_APP_URL || 'https://sary.live');
    const target = new URL(value, base);
    if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password
      || target.origin !== base.origin || target.username || target.password) return null;
    return target.href;
  } catch { return null; }
}

export async function getMerchantNotificationEmail(merchantId:number) {
  z.number().int().positive().parse(merchantId);
  const db=await getDb();if(!db)return null;
  const [recipient]=await db.select({userId:users.id,email:users.email}).from(merchants)
    .innerJoin(users,eq(users.id,merchants.userId))
    .where(and(eq(merchants.id,merchantId),eq(merchants.status,'active'),eq(users.accountStatus,'active'),isNotNull(users.emailVerifiedAt))).limit(1);
  return recipient&&z.string().email().safeParse(recipient.email).success ? {userId:recipient.userId,email:recipient.email!} : null;
}

export interface NotificationPayload {
  merchantId: number;
  type: NotificationType;
  title: string;
  body: string;
  url?: string;
  metadata?: Record<string, any>;
}
function notificationEmailHtml(payload:NotificationPayload,detailsUrl:string|null) {
  return `<div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
    <h2 style="color: #2563eb;">${escapeNotificationHtml(payload.title)}</h2>
    <p style="font-size: 16px; line-height: 1.6;">${escapeNotificationHtml(payload.body)}</p>
    ${detailsUrl?`<a href="${escapeNotificationHtml(detailsUrl)}" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px;">عرض التفاصيل</a>`:''}
  </div>`;
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
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(notificationPreferences)
    .where(eq(notificationPreferences.merchantId, merchantId))
    .limit(1);

  if (result.length > 0) return result[0];

  // إذا لم توجد تفضيلات، إنشاء تفضيلات افتراضية
  try {
    const [insertResult] = await db.insert(notificationPreferences).values({
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
    const newId = Number(insertResult.insertId);
    const newResult = await db.select().from(notificationPreferences)
      .where(eq(notificationPreferences.id, newId))
      .limit(1);
    return newResult.length > 0 ? newResult[0] : null;
  } catch (e) {
    console.warn('[Notification] Failed to create default preferences:', e);
    return null;
  }
}

/**
 * التحقق من الإعدادات العامة للنظام
 */
async function getGlobalSettings() {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(notificationSettings).limit(1);
  if (result.length > 0) return result[0];
  
  // إذا لم توجد إعدادات، إنشاء إعدادات افتراضية
  try {
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
    const newId = Number(newSettings.insertId);
    const newResult = await db.select().from(notificationSettings)
      .where(eq(notificationSettings.id, newId))
      .limit(1);
    return newResult.length > 0 ? newResult[0] : null;
  } catch (e) {
    console.warn('[Notification] Failed to create global settings:', e);
    return null;
  }
}

/**
 * التحقق من إمكانية إرسال الإشعار
 */
async function canSendNotification(
  merchantId: number,
  type: NotificationType,
  strict=false
): Promise<{ canSend: boolean; method: NotificationMethod }> {
  // التحقق من الإعدادات العامة
  const globalSettings = await getGlobalSettings();
  if(strict&&!globalSettings)throw Error('Notification settings unavailable');
  
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
  if(strict&&!prefs)throw Error('Notification preferences unavailable');
  
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
export async function sendNotification(payload: NotificationPayload, beforeSend?: () => Promise<void>, evidence?:NoticeHooks): Promise<boolean> {
  try {
    // التحقق من إمكانية الإرسال
    const { canSend, method } = await canSendNotification(payload.merchantId, payload.type,Boolean(evidence));
    
    if (!canSend) {
      if(evidence)await deliverNotices(method,(method==='both'?['push','email'] as const:[method]).map(channel=>suppressedNotice(channel,'disabled')),evidence);
      console.log(`[Notification] Skipped: ${payload.type} for merchant ${payload.merchantId} (disabled or quiet hours)`);
      return false;
    }

    // تسجيل الإشعار في قاعدة البيانات
    const db = await getDb();
    if (!db) return false;

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

    if(evidence) {
      const authorize=async()=>{
        const current=await canSendNotification(payload.merchantId,payload.type,true);
        if(!current.canSend||current.method!==method)throw Error('Notification preference changed');await beforeSend?.();
      };
      const prepared=method==='push'||method==='both'?await preparePushNotices(payload.merchantId,{title:payload.title,body:payload.body,url:payload.url},authorize):[];
      if(method==='email'||method==='both') {
        const recipient=await getMerchantNotificationEmail(payload.merchantId),detailsUrl=notificationEmailUrl(payload.url);
        prepared.push(recipient?prepareEmailNotice({userId:recipient.userId,to:recipient.email,subject:payload.title,
          html:notificationEmailHtml(payload,detailsUrl)},async()=>{
          const current=await getMerchantNotificationEmail(payload.merchantId);
          if(!current||current.userId!==recipient.userId||current.email!==recipient.email)throw Error('Notification recipient changed');await authorize();
        }):suppressedNotice('email','unavailable'));
      }
      const success=await deliverNotices(method,prepared,evidence);
      try{await db.update(notificationLogs).set({status:success?'sent':'failed',sentAt:success?new Date():null,error:success?null:'Not all notification targets accepted'}).where(eq(notificationLogs.id,logId));}
      catch{console.warn('[Notification] Receipt saved; display log unavailable');}
      return success;
    }

    // إرسال الإشعار حسب الطريقة المفضلة
    let pushSuccess = false;
    let emailSuccess = false;
    const authorize = beforeSend ? async () => {
      const current = await canSendNotification(payload.merchantId, payload.type);
      if (!current.canSend || current.method !== method) throw new Error('Notification preference changed');
      await beforeSend();
    } : undefined;

    if (method === 'push' || method === 'both') {
      try {
        const pushResult = await sendPushNotification(
          payload.merchantId,
          {
            title: payload.title,
            body: payload.body,
            url: payload.url,
          },
          authorize
        );
        pushSuccess = pushResult.success > 0 && pushResult.failed === 0;
      } catch (error) {
        console.error('[Notification] Push failed:', error);
      }
    }

    if (method === 'email' || method === 'both') {
      try {
        const recipient=await getMerchantNotificationEmail(payload.merchantId);
        if (recipient) {
          const detailsUrl = notificationEmailUrl(payload.url);
          emailSuccess = await sendEmail({
            to: recipient.email,
            subject: payload.title,
            html: notificationEmailHtml(payload,detailsUrl),
            type: 'notification',
            merchantId: payload.merchantId,
            metadata: payload.metadata,
            beforeSend: async()=>{
              const current=await getMerchantNotificationEmail(payload.merchantId);
              if(!current||current.userId!==recipient.userId||current.email!==recipient.email)throw new Error('Notification recipient changed');
              await authorize?.();
            },
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

    try {
      await db.update(notificationLogs)
        .set({
          status: success ? 'sent' : 'failed',
          sentAt: success ? new Date() : null,
          error: success ? null : 'Failed to send notification',
        })
        .where(eq(notificationLogs.id, logId));
    } catch (e) {
      console.warn('[Notification] Failed to update log status:', e);
    }

    return success;
  } catch (error) {
    console.error('[Notification] Error:', evidence?'delivery unconfirmed':error);
    return false;
  }
}

/**
 * إرسال إشعار طلب جديد
 */
export async function notifyNewOrder(merchantId: number, orderId: number, orderTotal: number, beforeSend?: () => Promise<void>, evidence?:NoticeHooks) {
  return sendNotification({
    merchantId,
    type: 'new_order',
    title: '🛒 طلب جديد',
    body: `لديك طلب جديد بقيمة ${formatMinorMoney(orderTotal)}`,
    url: `/merchant/orders`,
    metadata: { orderId, orderTotal },
  }, beforeSend,evidence);
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
