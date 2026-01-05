import { notifyOwner } from "../_core/notification";
import { 
  getPushNotificationSettings, 
  createPushNotificationLog, 
  updatePushNotificationLog 
} from "../db-notifications";

export type NotificationType = 
  | 'new_message' 
  | 'new_order' 
  | 'new_appointment' 
  | 'low_stock' 
  | 'payment_received';

interface NotificationData {
  merchantId: number;
  type: NotificationType;
  title: string;
  content: string;
  metadata?: Record<string, any>;
}

// Check if notification should be sent based on settings
async function shouldSendNotification(merchantId: number, type: NotificationType): Promise<boolean> {
  const settings = await getPushNotificationSettings(merchantId);
  
  if (!settings) {
    return true;
  }
  
  if (settings.quiet_hours_enabled) {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const start = settings.quiet_hours_start;
    const end = settings.quiet_hours_end;
    
    if (start > end) {
      if (currentTime >= start || currentTime < end) {
        return false;
      }
    } else {
      if (currentTime >= start && currentTime < end) {
        return false;
      }
    }
  }
  
  switch (type) {
    case 'new_message':
      return settings.new_message_enabled;
    case 'new_order':
      return settings.new_order_enabled;
    case 'new_appointment':
      return settings.new_appointment_enabled;
    case 'low_stock':
      return settings.low_stock_enabled;
    case 'payment_received':
      return settings.payment_received_enabled;
    default:
      return true;
  }
}

export async function sendPushNotification(data: NotificationData): Promise<boolean> {
  const { merchantId, type, title, content } = data;
  
  const shouldSend = await shouldSendNotification(merchantId, type);
  if (!shouldSend) {
    console.log(`[Push Notification] Skipped for merchant ${merchantId}: ${type}`);
    return false;
  }
  
  const logId = await createPushNotificationLog({
    merchantId,
    notificationType: type,
    title,
    content,
    status: 'pending'
  });
  
  try {
    const success = await notifyOwner({ title, content });
    
    await updatePushNotificationLog(logId, {
      status: success ? 'sent' : 'failed',
      sentAt: success ? new Date() : undefined,
      errorMessage: success ? undefined : 'Failed to send notification'
    });
    
    return success;
  } catch (error: any) {
    await updatePushNotificationLog(logId, {
      status: 'failed',
      errorMessage: error.message
    });
    return false;
  }
}

export async function notifyNewMessage(merchantId: number, customerName: string, messagePreview: string): Promise<boolean> {
  return sendPushNotification({
    merchantId,
    type: 'new_message',
    title: `💬 رسالة جديدة من ${customerName}`,
    content: messagePreview.substring(0, 200)
  });
}

export async function notifyNewOrder(merchantId: number, orderNumber: string, total: number, currency: string): Promise<boolean> {
  return sendPushNotification({
    merchantId,
    type: 'new_order',
    title: `🛒 طلب جديد #${orderNumber}`,
    content: `تم استلام طلب جديد بقيمة ${total} ${currency}`
  });
}

export async function notifyNewAppointment(merchantId: number, customerName: string, serviceName: string, appointmentTime: string): Promise<boolean> {
  return sendPushNotification({
    merchantId,
    type: 'new_appointment',
    title: `📅 حجز موعد جديد`,
    content: `${customerName} حجز موعد لخدمة "${serviceName}" في ${appointmentTime}`
  });
}

export async function notifyLowStock(merchantId: number, productName: string, currentStock: number): Promise<boolean> {
  return sendPushNotification({
    merchantId,
    type: 'low_stock',
    title: `⚠️ تنبيه: مخزون منخفض`,
    content: `المنتج "${productName}" - المخزون الحالي: ${currentStock} وحدة`
  });
}

export async function notifyPaymentReceived(merchantId: number, amount: number, currency: string, customerName: string): Promise<boolean> {
  return sendPushNotification({
    merchantId,
    type: 'payment_received',
    title: `💰 تم استلام دفعة`,
    content: `تم استلام ${amount} ${currency} من ${customerName}`
  });
}
