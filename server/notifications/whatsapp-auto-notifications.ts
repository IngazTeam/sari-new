import { getActiveWhatsappAutoNotification } from "../db-notifications";
import { sendTextMessage } from "../whatsapp";

export type TriggerType = 
  | 'order_created' | 'order_confirmed' | 'order_shipped' | 'order_delivered' | 'order_cancelled'
  | 'appointment_created' | 'appointment_reminder' | 'appointment_cancelled' | 'appointment_rescheduled';

interface OrderData {
  orderNumber: string;
  customerName: string;
  total: number;
  currency: string;
  trackingNumber?: string;
  deliveryDate?: string;
}

interface AppointmentData {
  customerName: string;
  serviceName: string;
  appointmentDate: string;
  appointmentTime: string;
  location?: string;
  newDate?: string;
  newTime?: string;
}

function processTemplate(template: string, data: Record<string, any>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value || ''));
  }
  return result;
}

const defaultTemplates: Record<TriggerType, string> = {
  order_created: `مرحباً {{customerName}} 👋\n\nشكراً لطلبك! 🛒\nرقم الطلب: #{{orderNumber}}\nالمبلغ: {{total}} {{currency}}\n\nسنقوم بتجهيز طلبك في أقرب وقت. شكراً لثقتك بنا! 💚`,
  order_confirmed: `مرحباً {{customerName}} 👋\n\nتم تأكيد طلبك #{{orderNumber}} ✅\nجاري تجهيز طلبك الآن.\n\nشكراً لصبرك! 💚`,
  order_shipped: `مرحباً {{customerName}} 📦\n\nطلبك #{{orderNumber}} في الطريق إليك! 🚚\nرقم التتبع: {{trackingNumber}}\nموعد التسليم المتوقع: {{deliveryDate}}\n\nشكراً لتسوقك معنا! 💚`,
  order_delivered: `مرحباً {{customerName}} 🎉\n\nتم تسليم طلبك #{{orderNumber}} بنجاح! ✅\n\nنتمنى أن تكون سعيداً بمشترياتك.\nلا تتردد في التواصل معنا لأي استفسار 💚`,
  order_cancelled: `مرحباً {{customerName}}\n\nنأسف لإبلاغك بإلغاء طلبك #{{orderNumber}} ❌\n\nإذا كان لديك أي استفسار، لا تتردد في التواصل معنا.\nنتطلع لخدمتك مرة أخرى 💚`,
  appointment_created: `مرحباً {{customerName}} 👋\n\nتم تأكيد حجزك لخدمة "{{serviceName}}" ✅\n📅 التاريخ: {{appointmentDate}}\n⏰ الوقت: {{appointmentTime}}\n📍 المكان: {{location}}\n\nنتطلع لرؤيتك! 💚`,
  appointment_reminder: `تذكير: {{customerName}} 📅\n\nموعدك لخدمة "{{serviceName}}" غداً!\n📅 التاريخ: {{appointmentDate}}\n⏰ الوقت: {{appointmentTime}}\n📍 المكان: {{location}}\n\nنتطلع لرؤيتك! 💚`,
  appointment_cancelled: `مرحباً {{customerName}}\n\nنأسف لإبلاغك بإلغاء موعدك لخدمة "{{serviceName}}" ❌\n📅 التاريخ: {{appointmentDate}}\n⏰ الوقت: {{appointmentTime}}\n\nيمكنك حجز موعد جديد في أي وقت.\nنتطلع لخدمتك قريباً 💚`,
  appointment_rescheduled: `مرحباً {{customerName}} 📅\n\nتم تغيير موعدك لخدمة "{{serviceName}}"\n\nالموعد الجديد:\n📅 التاريخ: {{newDate}}\n⏰ الوقت: {{newTime}}\n📍 المكان: {{location}}\n\nنتطلع لرؤيتك! 💚`
};

export async function sendOrderNotification(merchantId: number, customerPhone: string, triggerType: TriggerType, orderData: OrderData): Promise<boolean> {
  const notification = await getActiveWhatsappAutoNotification(merchantId, triggerType);
  const template = notification?.message_template || defaultTemplates[triggerType];
  if (!template) return false;
  
  const message = processTemplate(template, orderData);
  try {
    await sendTextMessage(customerPhone, message);
    return true;
  } catch (e) {
    return false;
  }
}

export async function sendAppointmentNotification(merchantId: number, customerPhone: string, triggerType: TriggerType, appointmentData: AppointmentData): Promise<boolean> {
  const notification = await getActiveWhatsappAutoNotification(merchantId, triggerType);
  const template = notification?.message_template || defaultTemplates[triggerType];
  if (!template) return false;
  
  const message = processTemplate(template, appointmentData);
  try {
    await sendTextMessage(customerPhone, message);
    return true;
  } catch (e) {
    return false;
  }
}

export function getDefaultTemplate(triggerType: TriggerType): string {
  return defaultTemplates[triggerType] || '';
}

export function getAllDefaultTemplates(): Record<TriggerType, string> {
  return { ...defaultTemplates };
}
