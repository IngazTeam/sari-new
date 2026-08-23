export type TriggerType =
  | 'order_created' | 'order_confirmed' | 'order_shipped' | 'order_delivered' | 'order_cancelled'
  | 'appointment_created' | 'appointment_reminder' | 'appointment_cancelled' | 'appointment_rescheduled';

const defaultTemplates: Record<TriggerType, string> = {
  order_created: `مرحباً {{customerName}} 👋\n\nشكراً لطلبك! 🛒\nرقم الطلب: #{{orderNumber}}\nالمبلغ: {{total}} {{currency}}\n\nسنراجع طلبك ونطلعك على حالته. شكراً لثقتك بنا! 💚`,
  order_confirmed: `مرحباً {{customerName}} 👋\n\nتم تأكيد طلبك #{{orderNumber}} ✅\nبدأ تجهيز الطلب وفق حالة المتجر.\n\nشكراً لصبرك! 💚`,
  order_shipped: `مرحباً {{customerName}} 📦\n\nطلبك #{{orderNumber}} في الطريق إليك! 🚚\nرقم التتبع: {{trackingNumber}}\n\nيمكنك متابعة الشحنة برقم التتبع. شكراً لتسوقك معنا! 💚`,
  order_delivered: `مرحباً {{customerName}} 🎉\n\nتم تسجيل طلبك #{{orderNumber}} كمُسلّم ✅\n\nلا تتردد في التواصل معنا لأي استفسار 💚`,
  order_cancelled: `مرحباً {{customerName}}\n\nتم إلغاء طلبك #{{orderNumber}} ❌\n\nإذا كان لديك أي استفسار، لا تتردد في التواصل معنا.`,
  appointment_created: `مرحباً {{customerName}} 👋\n\nتم تأكيد حجزك لخدمة "{{serviceName}}" ✅\n📅 التاريخ: {{appointmentDate}}\n⏰ الوقت: {{appointmentTime}}\n📍 المكان: {{location}}`,
  appointment_reminder: `تذكير: {{customerName}} 📅\n\nموعدك لخدمة "{{serviceName}}" غداً.\n📅 التاريخ: {{appointmentDate}}\n⏰ الوقت: {{appointmentTime}}\n📍 المكان: {{location}}`,
  appointment_cancelled: `مرحباً {{customerName}}\n\nتم إلغاء موعدك لخدمة "{{serviceName}}" ❌\n📅 التاريخ: {{appointmentDate}}\n⏰ الوقت: {{appointmentTime}}`,
  appointment_rescheduled: `مرحباً {{customerName}} 📅\n\nتم تغيير موعدك لخدمة "{{serviceName}}".\n\nالموعد الجديد:\n📅 التاريخ: {{newDate}}\n⏰ الوقت: {{newTime}}\n📍 المكان: {{location}}`,
};

export function getDefaultTemplate(triggerType: TriggerType): string {
  return defaultTemplates[triggerType] || '';
}

export function getAllDefaultTemplates(): Record<TriggerType, string> {
  return { ...defaultTemplates };
}
