/**
 * Cron Job: تنبيهات انتهاء الاشتراك
 * يعمل يومياً للتحقق من الاشتراكات القريبة من الانتهاء وإرسال تنبيهات
 */

import cron from 'node-cron';
import * as db from '../db';
import { sendSubscriptionExpiryEmail } from '../notifications/email-notifications';

/**
 * التحقق من الاشتراكات القريبة من الانتهاء وإرسال تنبيهات
 */
async function checkExpiringSubscriptions() {
  try {
    console.log('[Subscription Expiry] Starting expiry check...');

    // الحصول على جميع التجار النشطين
    const merchants = await db.getAllMerchants();
    const activeMerchants = merchants.filter(m => m.status === 'active' && m.subscriptionId);

    console.log(`[Subscription Expiry] Found ${activeMerchants.length} active merchants with subscriptions`);

    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    for (const merchant of activeMerchants) {
      try {
        if (!merchant.subscriptionId) continue;

        const subscription = await db.getSubscriptionById(merchant.subscriptionId);
        if (!subscription || subscription.status !== 'active') continue;

        const plan = await db.getPlanById(subscription.planId);
        if (!plan) continue;

        const endDate = new Date(subscription.endDate);
        const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        // إرسال تنبيه عند 3 أيام أو 1 يوم أو يوم الانتهاء
        if (daysUntilExpiry > 0 && daysUntilExpiry <= 3) {
          const shouldSend = await shouldSendExpiryAlert(merchant.id, daysUntilExpiry);

          if (shouldSend) {
            const user = await db.getUserById(merchant.userId);
            if (user?.email) {
              console.log(`[Subscription Expiry] Sending alert to ${merchant.businessName} (${daysUntilExpiry} days left)`);

              await sendSubscriptionExpiryEmail(
                user.email,
                merchant.businessName,
                plan.name,
                endDate
              );

              await saveExpiryAlertLog(merchant.id, daysUntilExpiry);
            }
          }
        }
      } catch (error) {
        console.error(`[Subscription Expiry] Error processing merchant ${merchant.id}:`, error);
      }
    }

    console.log('[Subscription Expiry] Expiry check completed');
  } catch (error) {
    console.error('[Subscription Expiry] Error in checkExpiringSubscriptions:', error);
  }
}

/**
 * التحقق من ضرورة إرسال التنبيه (لتجنب الإرسال المتكرر)
 */
async function shouldSendExpiryAlert(merchantId: number, daysLeft: number): Promise<boolean> {
  const lastAlert = await getLastExpiryAlert(merchantId);

  if (!lastAlert) {
    // لم يتم إرسال أي تنبيه من قبل
    return true;
  }

  // إرسال تنبيه جديد فقط إذا تغير عدد الأيام المتبقية
  if (lastAlert.daysLeft !== daysLeft) {
    return true;
  }

  // أو إذا مر أكثر من 24 ساعة على آخر تنبيه
  const hoursSinceLastAlert = (Date.now() - lastAlert.timestamp) / (1000 * 60 * 60);
  if (hoursSinceLastAlert >= 24) {
    return true;
  }

  return false;
}

// تخزين مؤقت لسجلات التنبيهات (في الإنتاج، يُفضل استخدام قاعدة البيانات)
const expiryAlertLogs: Map<number, { daysLeft: number; timestamp: number }> = new Map();

async function getLastExpiryAlert(merchantId: number) {
  return expiryAlertLogs.get(merchantId) || null;
}

async function saveExpiryAlertLog(merchantId: number, daysLeft: number) {
  expiryAlertLogs.set(merchantId, {
    daysLeft,
    timestamp: Date.now()
  });
}

/**
 * تشغيل Cron Job
 * يعمل يومياً في الساعة 9 صباحاً
 */
export function startSubscriptionExpiryCron() {
  // كل يوم في الساعة 9 صباحاً
  cron.schedule('0 9 * * *', async () => {
    console.log('[Subscription Expiry Cron] Running scheduled task...');
    await checkExpiringSubscriptions();
  });

  console.log('[Subscription Expiry Cron] Scheduled to run daily at 9:00 AM');

  // تشغيل فوري عند بدء الخادم (للاختبار)
  // checkExpiringSubscriptions();
}
