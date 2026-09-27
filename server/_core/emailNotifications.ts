/**
 * Email Notifications System
 * 
 * This module handles sending email notifications to the admin
 * for various events in the Sari system.
 */

import { notifyOwner } from "./notification";

// ============================================
// Email Templates
// ============================================

/**
 * Template: New WhatsApp Connection Request
 */
export async function notifyWhatsAppConnectionRequest(data: {
  merchantName: string;
  merchantEmail: string;
  businessName: string;
  phoneNumber: string;
  requestedAt: Date;
}): Promise<boolean> {
  const title = "🔗 طلب ربط واتساب جديد";
  const content = `
**تاجر جديد يطلب ربط حساب واتساب**

📋 **معلومات التاجر:**
- الاسم: ${data.merchantName}
- البريد الإلكتروني: ${data.merchantEmail}
- اسم المتجر: ${data.businessName}
- رقم الهاتف: ${data.phoneNumber}
- وقت الطلب: ${data.requestedAt.toLocaleString("ar-SA")}

يرجى مراجعة الطلب واتخاذ الإجراء المناسب.
  `.trim();

  return await notifyOwner({ title, content });
}

/**
 * Template: WhatsApp Disconnection
 */
export async function notifyWhatsAppDisconnection(data: {
  merchantName: string;
  businessName: string;
  phoneNumber: string;
  disconnectedAt: Date;
  reason?: string;
}): Promise<boolean> {
  const title = "❌ فك ربط واتساب";
  const content = `
**تم فك ربط حساب واتساب**

📋 **معلومات التاجر:**
- الاسم: ${data.merchantName}
- اسم المتجر: ${data.businessName}
- رقم الهاتف: ${data.phoneNumber}
- وقت الفك: ${data.disconnectedAt.toLocaleString("ar-SA")}
${data.reason ? `- السبب: ${data.reason}` : ""}

قد يحتاج هذا التاجر إلى المساعدة في إعادة الربط.
  `.trim();

  return await notifyOwner({ title, content });
}

/**
 * Template: New Subscription
 */
export async function notifyNewSubscription(data: {
  merchantName: string;
  businessName: string;
  planName: string;
  planPrice: number;
  billingCycle: string;
  subscribedAt: Date;
}): Promise<boolean> {
  const title = "✨ اشتراك جديد";
  const content = `
**تاجر جديد اشترك في النظام**

📋 **معلومات التاجر:**
- الاسم: ${data.merchantName}
- اسم المتجر: ${data.businessName}

💳 **معلومات الاشتراك:**
- الباقة: ${data.planName}
- السعر: ${data.planPrice} ريال
- دورة الفوترة: ${data.billingCycle}
- تاريخ الاشتراك: ${data.subscribedAt.toLocaleString("ar-SA")}

مبروك! عميل جديد انضم إلى منصة ساري.
  `.trim();

  return await notifyOwner({ title, content });
}

/**
 * Template: Plan Upgrade
 */
export async function notifyPlanUpgrade(data: {
  merchantName: string;
  businessName: string;
  oldPlan: string;
  newPlan: string;
  oldPrice: number;
  newPrice: number;
  upgradedAt: Date;
}): Promise<boolean> {
  const title = "⬆️ ترقية باقة";
  const content = `
**تاجر قام بترقية باقته**

📋 **معلومات التاجر:**
- الاسم: ${data.merchantName}
- اسم المتجر: ${data.businessName}

📊 **تفاصيل الترقية:**
- الباقة القديمة: ${data.oldPlan} (${data.oldPrice} ريال)
- الباقة الجديدة: ${data.newPlan} (${data.newPrice} ريال)
- الفرق: +${data.newPrice - data.oldPrice} ريال
- تاريخ الترقية: ${data.upgradedAt.toLocaleString("ar-SA")}

عميل راضٍ يستثمر أكثر في النظام! 🎉
  `.trim();

  return await notifyOwner({ title, content });
}

/**
 * Template: New Referral
 */
export async function notifyNewReferral(data: {
  referrerName: string;
  referrerBusiness: string;
  newMerchantName: string;
  newMerchantEmail: string;
  referralCode: string;
  referredAt: Date;
}): Promise<boolean> {
  const title = "🎁 إحالة جديدة";
  const content = `
**تاجر جديد انضم عبر إحالة**

👤 **المُحيل:**
- الاسم: ${data.referrerName}
- المتجر: ${data.referrerBusiness}
- كود الإحالة: ${data.referralCode}

🆕 **التاجر الجديد:**
- الاسم: ${data.newMerchantName}
- البريد الإلكتروني: ${data.newMerchantEmail}
- تاريخ التسجيل: ${data.referredAt.toLocaleString("ar-SA")}

برنامج الإحالات يعمل بنجاح! 🚀
  `.trim();

  return await notifyOwner({ title, content });
}

/**
 * Template: Weekly Report
 */
export async function notifyWeeklyReport(data: {
  weekStart: Date;
  weekEnd: Date;
  totalMerchants: number;
  newMerchants: number;
  activeSubscriptions: number;
  totalRevenue: number;
  totalOrders: number;
  totalConversations: number;
  topPerformingMerchants: Array<{
    name: string;
    business: string;
    orders: number;
    revenue: number;
  }>;
}): Promise<boolean> {
  const title = "📊 التقرير الأسبوعي";
  
  const topMerchants = data.topPerformingMerchants
    .map((m, i) => `${i + 1}. ${m.business} - ${m.orders} طلب - ${m.revenue} ريال`)
    .join("\n");

  const content = `
**ملخص أداء منصة ساري الأسبوعي**

📅 **الفترة:** ${data.weekStart.toLocaleDateString("ar-SA")} - ${data.weekEnd.toLocaleDateString("ar-SA")}

📈 **إحصائيات عامة:**
- إجمالي التجار: ${data.totalMerchants}
- تجار جدد: ${data.newMerchants}
- اشتراكات نشطة: ${data.activeSubscriptions}
- إجمالي الإيرادات: ${data.totalRevenue.toLocaleString()} ريال
- إجمالي الطلبات: ${data.totalOrders}
- إجمالي المحادثات: ${data.totalConversations}

🏆 **أفضل التجار أداءً:**
${topMerchants}

استمر في التميز! 💪
  `.trim();

  return await notifyOwner({ title, content });
}

/**
 * Template: New Order Notification
 */
export async function notifyNewOrder(data: {
  merchantName: string;
  businessName: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  itemsCount: number;
  orderDate: Date;
}, beforeSend?: () => Promise<void>): Promise<boolean> {
  const title = "🛒 طلب جديد";
  const content = `
**طلب جديد تم إنشاؤه**

🏪 **معلومات المتجر:**
- التاجر: ${data.merchantName}
- المتجر: ${data.businessName}

📦 **تفاصيل الطلب:**
- رقم الطلب: ${data.orderNumber}
- العميل: ${data.customerName}
- رقم الجوال: ${data.customerPhone}
- عدد المنتجات: ${data.itemsCount}
- الإجمالي: ${data.totalAmount} ريال
- التاريخ: ${data.orderDate.toLocaleString("ar-SA")}

يمكنك متابعة الطلب من لوحة المتجر.
  `.trim();

  return await notifyOwner({ title, content }, beforeSend);
}

/**
 * Template: Marketing Campaign Notification
 */
export async function notifyMarketingCampaign(data: {
  merchantName: string;
  businessName: string;
  campaignName: string;
  targetAudience: string;
  recipientsCount: number;
  scheduledAt?: Date;
  sentAt?: Date;
  status: "scheduled" | "sent" | "failed";
}): Promise<boolean> {
  const statusEmoji = {
    scheduled: "⏰",
    sent: "✅",
    failed: "❌",
  };

  const statusText = {
    scheduled: "مجدولة",
    sent: "تم الإرسال",
    failed: "فشلت",
  };

  const title = `${statusEmoji[data.status]} حملة تسويقية ${statusText[data.status]}`;
  const content = `
**حملة تسويقية جديدة**

🏪 **معلومات المتجر:**
- التاجر: ${data.merchantName}
- المتجر: ${data.businessName}

📢 **تفاصيل الحملة:**
- اسم الحملة: ${data.campaignName}
- الجمهور المستهدف: ${data.targetAudience}
- عدد المستلمين: ${data.recipientsCount}
- الحالة: ${statusText[data.status]}
${data.scheduledAt ? `- موعد الإرسال: ${data.scheduledAt.toLocaleString("ar-SA")}` : ""}
${data.sentAt ? `- تاريخ الإرسال: ${data.sentAt.toLocaleString("ar-SA")}` : ""}

${data.status === "sent" ? "الحملة تم إرسالها بنجاح! 🎯" : ""}
${data.status === "failed" ? "يرجى مراجعة سبب الفشل." : ""}
  `.trim();

  return await notifyOwner({ title, content });
}

// ============================================
// Helper Functions
// ============================================

/**
 * Send multiple notifications in batch
 */
export async function sendBatchNotifications(
  notifications: Array<() => Promise<boolean>>
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const notify of notifications) {
    try {
      const result = await notify();
      if (result) {
        success++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error("Error sending notification:", error);
      failed++;
    }
  }

  return { success, failed };
}

/**
 * Format date for Arabic locale
 */
export function formatArabicDate(date: Date): string {
  return date.toLocaleString("ar-SA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format currency in SAR
 */
export function formatCurrency(amount: number): string {
  return `${amount.toLocaleString()} ريال`;
}
