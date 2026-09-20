import { TRPCError } from '@trpc/server';
import {
  getConversationByMerchantAndPhone,
  getCustomerCountByMerchant,
  getMerchantCurrentSubscription,
  getSubscriptionPlanById,
  getWhatsAppInstancesByMerchantId,
} from '../db';

function verifiedCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر التحقق من حدود الاشتراك' });
  }
  return value;
}

/**
 * Check if merchant can add new customers based on subscription limits
 * @param merchantId The merchant ID
 * @param customerPhone The customer phone to check (optional - for existing customer check)
 * @returns true if can add, throws TRPCError if limit reached
 */
export async function checkCustomerLimit(merchantId: number, customerPhone?: string): Promise<boolean> {
  // Get current subscription
  const subscription = await getMerchantCurrentSubscription(merchantId);
  
  if (!subscription) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'لا يوجد اشتراك نشط. يرجى تفعيل اشتراكك للمتابعة.',
    });
  }

  // Get subscription plan details
  // @ts-ignore
  const plan = await getSubscriptionPlanById(subscription.planId);
  
  if (!plan) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'خطأ في تحميل تفاصيل الباقة',
    });
  }

  // If checking for existing customer, allow
  if (customerPhone) {
    const existingConversation = await getConversationByMerchantAndPhone(merchantId, customerPhone);
    if (existingConversation) {
      return true; // Existing customer, no limit check needed
    }
  }

  // Get current customer count
  const currentCustomerCount = await getCustomerCountByMerchant(merchantId);

  // Check if limit reached
  if (verifiedCount(currentCustomerCount) >= verifiedCount(plan.maxCustomers)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `لقد وصلت إلى الحد الأقصى للعملاء (${plan.maxCustomers}) في باقتك الحالية. يرجى الترقية للباقة الأعلى لإضافة المزيد من العملاء.`,
    });
  }

  return true;
}

/**
 * Check if merchant can add new WhatsApp numbers based on subscription limits
 * @param merchantId The merchant ID
 * @returns true if can add, throws TRPCError if limit reached
 */
export async function checkWhatsAppNumberLimit(merchantId: number): Promise<boolean> {
  // Get current subscription
  const subscription = await getMerchantCurrentSubscription(merchantId);
  
  if (!subscription) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'لا يوجد اشتراك نشط. يرجى تفعيل اشتراكك للمتابعة.',
    });
  }

  // Get subscription plan details
  // @ts-ignore
  const plan = await getSubscriptionPlanById(subscription.planId);
  
  if (!plan) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'خطأ في تحميل تفاصيل الباقة',
    });
  }

  // Get current WhatsApp numbers count
  const whatsappNumbers = await getWhatsAppInstancesByMerchantId(merchantId);
  const currentCount = whatsappNumbers.length;

  // Check if limit reached
  if (verifiedCount(currentCount) >= verifiedCount(plan.maxWhatsAppNumbers)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `لقد وصلت إلى الحد الأقصى لأرقام الواتساب (${plan.maxWhatsAppNumbers}) في باقتك الحالية. يرجى الترقية للباقة الأعلى أو شراء خدمة إضافية.`,
    });
  }

  return true;
}

/**
 * Get remaining customer slots for a merchant
 * @param merchantId The merchant ID
 * @returns Object with current count, max count, and remaining slots
 */
export async function getRemainingCustomerSlots(merchantId: number): Promise<{
  current: number;
  max: number;
  remaining: number;
  percentage: number;
}> {
  const subscription = await getMerchantCurrentSubscription(merchantId);
  
  if (!subscription) {
    return { current: 0, max: 0, remaining: 0, percentage: 0 };
  }

  // @ts-ignore
  const plan = await getSubscriptionPlanById(subscription.planId);
  
  if (!plan) {
    return { current: 0, max: 0, remaining: 0, percentage: 0 };
  }

  const currentCount = verifiedCount(await getCustomerCountByMerchant(merchantId));
  const maximum = verifiedCount(plan.maxCustomers);
  const remaining = Math.max(0, maximum - currentCount);
  const percentage = maximum === 0 ? (currentCount === 0 ? 0 : 100) : (currentCount / maximum) * 100;

  return {
    current: currentCount,
    max: maximum,
    remaining,
    percentage: Math.min(100, percentage),
  };
}
