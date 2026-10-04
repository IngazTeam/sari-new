import {rewardAvailable} from './loyalty/sales-evidence';
/**
 * Loyalty System Integration
 * 
 * This module integrates the loyalty system with orders and WhatsApp messaging.
 */

import * as loyaltyDb from './db_loyalty';
import { getMerchantById, getOrderById } from './db';

/**
 * Calculate points earned from an order
 */
export async function calculatePointsFromOrder(merchantId: number, orderTotal: number): Promise<number> {
  const settings = await loyaltyDb.getLoyaltySettings(merchantId);
  
  if (!settings || !settings.isEnabled) {
    return 0;
  }

  // حساب النقاط: (إجمالي الطلب) × (نقاط لكل وحدة عملة)
  if(!Number.isFinite(orderTotal)||orderTotal<0||!Number.isSafeInteger(settings.pointsPerCurrency)||settings.pointsPerCurrency<0)return 0;
  const points = Math.floor(orderTotal * settings.pointsPerCurrency);
  if(!Number.isSafeInteger(points)||points>10000000)return 0;
  return points;
}

/**
 * Award points to customer for an order
 */
export async function awardPointsForOrder(params: {
  merchantId: number;
  customerPhone: string;
  customerName?: string;
  orderId: number;
  orderTotal: number;
}): Promise<{ points: number; newBalance:number; newTier?: any; tierUpgraded: boolean } | null> {
  try {
    const settings = await loyaltyDb.getLoyaltySettings(params.merchantId);
    
    if (!settings || !settings.isEnabled) {
      console.log('[Loyalty] System is disabled for merchant', params.merchantId);
      return null;
    }

    const points = await calculatePointsFromOrder(params.merchantId, params.orderTotal);
    
    if (points === 0) {
      console.log('[Loyalty] No points to award for order', params.orderId);
      return null;
    }

    // إضافة النقاط للعميل
    const result = await loyaltyDb.addPointsToCustomer(
      params.merchantId,
      params.customerPhone,
      points,
      `Order #${params.orderId}`,
      `طلب رقم #${params.orderId}`,
      params.orderId
    );

    if(result.alreadyApplied)return null;
    console.log('[Loyalty] Awarded', points, 'points to', params.customerPhone, 'for order', params.orderId);

    return {
      points,newBalance:result.newBalance,
      newTier: result.newTier,
      tierUpgraded: result.tierUpgraded,
    };
  } catch (error) {
    console.error('[Loyalty] Error awarding points:', error);
    return null;
  }
}

/**
 * Send WhatsApp notification about points earned
 */
export async function sendPointsEarnedNotification(params: {
  merchantId: number;
  customerPhone: string;
  customerName?: string;
  points: number;
  newBalance: number;
  orderId: number;
}): Promise<void> {
  // No current caller supplies a reviewed, tenant-scoped notification authorization.
  // The previous global sender had an incompatible signature and still logged success.
  throw new Error('loyalty:notification_authorization_required');
}

/**
 * Send WhatsApp notification about tier upgrade
 */
export async function sendTierUpgradeNotification(params: {
  merchantId: number;
  customerPhone: string;
  customerName?: string;
  newTier: any;
}): Promise<void> {
  // No current caller supplies a reviewed, tenant-scoped notification authorization.
  // The previous global sender had an incompatible signature and still logged success.
  throw new Error('loyalty:notification_authorization_required');
}

/**
 * Send WhatsApp notification about reward redemption
 */
export async function sendRewardRedeemedNotification(params: {
  merchantId: number;
  customerPhone: string;
  customerName?: string;
  rewardTitle: string;
  pointsSpent: number;
  newBalance: number;
}): Promise<void> {
  // No current caller supplies a reviewed, tenant-scoped notification authorization.
  // The previous global sender had an incompatible signature and still logged success.
  throw new Error('loyalty:notification_authorization_required');
}

/**
 * Handle loyalty points when order is completed
 * This should be called when order status changes to 'completed'
 */
export async function handleOrderCompleted(orderId: number): Promise<void> {
  try {
    const order = await getOrderById(orderId);
    if (!order) {
      console.log('[Loyalty] Order not found:', orderId);
      return;
    }

    // التحقق من أن الطلب مكتمل
    if ((order.status as string) !== 'completed') {
      console.log('[Loyalty] Order is not completed yet:', orderId);
      return;
    }

    // منح النقاط للعميل
    const result = await awardPointsForOrder({
      merchantId: order.merchantId,
      customerPhone: order.customerPhone,
      customerName: order.customerName || undefined,
      orderId: order.id,
      orderTotal: order.totalAmount,
    });

    if (!result) {
      return;
    }

    // إرسال إشعار بالنقاط المكتسبة
    await sendPointsEarnedNotification({
      merchantId: order.merchantId,
      customerPhone: order.customerPhone,
      customerName: order.customerName || undefined,
      points: result.points,
      newBalance: result.newBalance,
      orderId: order.id,
    });

    // إرسال إشعار بالترقية إذا حدثت
    if (result.tierUpgraded && result.newTier) {
      await sendTierUpgradeNotification({
        merchantId: order.merchantId,
        customerPhone: order.customerPhone,
        customerName: order.customerName || undefined,
        newTier: result.newTier,
      });
    }
  } catch (error) {
    console.error('[Loyalty] Error handling order completion:', error);
  }
}

/**
 * Get customer loyalty info for WhatsApp bot
 */
export async function getCustomerLoyaltyInfo(merchantId: number, customerPhone: string): Promise<string> {
  try {
    const settings = await loyaltyDb.getLoyaltySettings(merchantId);
    
    if (!settings || !settings.isEnabled) {
      return 'عذراً، نظام الولاء غير مفعل حالياً.';
    }

    const customerPoints = await loyaltyDb.getCustomerPoints(merchantId, customerPhone);
    

    let tier = null;
    if (customerPoints?.currentTierId) {
      tier = await loyaltyDb.getLoyaltyTierById(customerPoints.currentTierId,merchantId);
    }

    const message = `💎 *معلومات نقاط الولاء*

⭐ نقاطك الحالية: *${customerPoints?.totalPoints || 0}*
📊 إجمالي النقاط: ${customerPoints?.lifetimePoints || 0}
${tier ? `\n🏆 مستواك: ${tier.icon} *${tier.nameAr}*` : ''}

${tier ? `\n✨ مزاياك:\n• خصم ${tier.discountPercentage}%${tier.freeShipping === 1 ? '\n• شحن مجاني' : ''}${tier.priority > 0 ? '\n• أولوية في الخدمة' : ''}` : ''}

💡 اكسب ${settings.pointsPerCurrency} نقطة مقابل كل ${1} ريال من مشترياتك!`;

    return message;
  } catch (error) {
    console.error('[Loyalty] Error getting customer info:', error);
    return 'خلني أتحقق من رصيد نقاطك وأرجع لك 🔍';
  }
}

/**
 * Get available rewards for WhatsApp bot
 */
export async function getAvailableRewardsInfo(merchantId: number, customerPhone: string): Promise<string> {
  try {
    const settings = await loyaltyDb.getLoyaltySettings(merchantId);
    
    if (!settings || !settings.isEnabled) {
      return 'عذراً، نظام الولاء غير مفعل حالياً.';
    }

    const customerPoints = await loyaltyDb.getCustomerPoints(merchantId, customerPhone);
    const currentPoints = customerPoints?.totalPoints || 0;

    const rewards = (await loyaltyDb.getLoyaltyRewards(merchantId, true)).filter(r=>rewardAvailable(r));

    if (rewards.length === 0) {
      return 'لا توجد مكافآت متاحة حالياً.';
    }

    let message = `🎁 *المكافآت المتاحة*\n\n💰 رصيدك: *${currentPoints} نقطة*\n\n`;

    rewards.forEach((reward, index) => {
      const canRedeem = currentPoints >= reward.pointsCost;
      const status = canRedeem ? 'رصيد كافٍ؛ راجع شروط الاستبدال' : '🔒';
      
      message += `${index + 1}. ${status} *${reward.titleAr}*\n`;
      message += `   💎 ${reward.pointsCost} نقطة\n`;
      if (reward.descriptionAr) {
        message += `   📝 ${reward.descriptionAr}\n`;
      }
      message += '\n';
    });

    message += '💡 تواصل معنا لاستبدال المكافآت!';

    return message;
  } catch (error) {
    console.error('[Loyalty] Error getting rewards info:', error);
    return 'خلني أتحقق من المكافآت المتاحة لك وأرجع لك بالتفاصيل 🎁';
  }
}
