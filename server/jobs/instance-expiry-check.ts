/**
 * WhatsApp Instance Expiry Check Job
 * 
 * Runs daily to check for expiring WhatsApp instances and notify merchants
 */

import {
  createNotification,
  getExpiringWhatsAppInstances,
  getMerchantById,
  markWhatsAppInstanceExpired,
} from '../db';
import { notifyOwner } from '../_core/notification';

/**
 * Check for expiring instances and send notifications
 */
export async function checkInstanceExpiry() {
  console.log('[Instance Expiry Check] Starting...');

  try {
    const { expiring7Days, expiring3Days, expiring1Day, expired } = await getExpiringWhatsAppInstances();

    let totalNotified = 0;
    let totalExpired = 0;

    // Handle expired instances
    for (const instance of expired) {
      await markWhatsAppInstanceExpired(instance.id);
      
      const merchant = await getMerchantById(instance.merchantId);
      if (merchant) {
        await notifyMerchantAboutExpiry(merchant, instance, 'expired');
        totalExpired++;
      }
    }

    // Handle instances expiring in 1 day
    for (const instance of expiring1Day) {
      const merchant = await getMerchantById(instance.merchantId);
      if (merchant) {
        await notifyMerchantAboutExpiry(merchant, instance, '1day');
        totalNotified++;
      }
    }

    // Handle instances expiring in 3 days
    for (const instance of expiring3Days) {
      const merchant = await getMerchantById(instance.merchantId);
      if (merchant) {
        await notifyMerchantAboutExpiry(merchant, instance, '3days');
        totalNotified++;
      }
    }

    // Handle instances expiring in 7 days
    for (const instance of expiring7Days) {
      const merchant = await getMerchantById(instance.merchantId);
      if (merchant) {
        await notifyMerchantAboutExpiry(merchant, instance, '7days');
        totalNotified++;
      }
    }

    console.log('[Instance Expiry Check] Completed:', {
      expiring7Days: expiring7Days.length,
      expiring3Days: expiring3Days.length,
      expiring1Day: expiring1Day.length,
      expired: totalExpired,
      notified: totalNotified,
    });

    return {
      expiring7Days: expiring7Days.length,
      expiring3Days: expiring3Days.length,
      expiring1Day: expiring1Day.length,
      expired: totalExpired,
      notified: totalNotified,
    };
  } catch (error) {
    console.error('[Instance Expiry Check] Error:', error);
    return {
      expiring7Days: 0,
      expiring3Days: 0,
      expiring1Day: 0,
      expired: 0,
      notified: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Notify merchant about expiring instance
 */
async function notifyMerchantAboutExpiry(
  merchant: any,
  instance: any,
  urgency: 'expired' | '1day' | '3days' | '7days'
) {
  const urgencyMessages = {
    expired: {
      title: '⚠️ WhatsApp Instance منتهي',
      message: `Instance ${instance.instanceId} انتهت صلاحيته. يرجى تجديده فوراً لتجنب توقف الخدمة.`,
    },
    '1day': {
      title: '🔴 WhatsApp Instance ينتهي خلال 24 ساعة',
      message: `Instance ${instance.instanceId} سينتهي خلال 24 ساعة. يرجى التجديد فوراً.`,
    },
    '3days': {
      title: '🟡 WhatsApp Instance ينتهي خلال 3 أيام',
      message: `Instance ${instance.instanceId} سينتهي خلال 3 أيام. يرجى التجديد قريباً.`,
    },
    '7days': {
      title: '🟢 WhatsApp Instance ينتهي خلال 7 أيام',
      message: `Instance ${instance.instanceId} سينتهي خلال 7 أيام. يرجى التخطيط للتجديد.`,
    },
  };

  const { title, message } = urgencyMessages[urgency];

  // Create notification in database
  await createNotification({
    userId: merchant.userId,
    type: urgency === 'expired' || urgency === '1day' ? 'error' : 'warning',
    title,
    message,
    link: '/merchant/whatsapp-instances',
  });

  // Send notification to owner if this is critical
  if (urgency === 'expired' || urgency === '1day') {
    try {
      await notifyOwner({
        title,
        content: `التاجر: ${merchant.businessName}\n${message}`,
      });
    } catch (error) {
      console.error('[Instance Expiry] Failed to notify owner:', error);
    }
  }
}
