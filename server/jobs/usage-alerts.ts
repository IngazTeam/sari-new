/**
 * Cron Job: تنبيهات الاستخدام
 * يعمل كل ساعة للتحقق من استخدام التجار وإرسال تنبيهات عند الوصول إلى 80%
 */

import cron from 'node-cron';
import * as db from '../db';
import { sendUsageWarningEmail } from '../notifications/email-notifications';

/**
 * التحقق من استخدام التجار وإرسال تنبيهات
 */
async function checkUsageAndSendAlerts() {
  try {
    console.log('[Usage Alerts] Starting usage check...');

    // الحصول على جميع التجار النشطين
    const merchants = await db.getAllMerchants();
    const activeMerchants = merchants.filter(m => m.status === 'active');

    console.log(`[Usage Alerts] Found ${activeMerchants.length} active merchants`);

    for (const merchant of activeMerchants) {
      try {
        // الحصول على الباقة الحالية
        if (!merchant.subscriptionId) continue;
        const subscription = await db.getSubscriptionById(merchant.subscriptionId);
        if (!subscription || subscription.status !== 'active') continue;

        const plan = await db.getPlanById(subscription.planId);
        if (!plan) continue;

        // التحقق من استخدام المحادثات
        if (plan.conversationLimit > 0) {
          const percentage = (subscription.conversationsUsed / plan.conversationLimit) * 100;
          
          // إرسال تنبيه عند 80% أو 90% أو 95%
          if (percentage >= 80 && percentage < 100) {
            const shouldSend = await shouldSendAlert(
              merchant.id,
              'conversations',
              percentage
            );

            if (shouldSend) {
              const user = await db.getUserById(merchant.userId);
              if (user?.email) {
                console.log(`[Usage Alerts] Sending conversations alert to ${merchant.businessName} (${percentage.toFixed(0)}%)`);
                
                await sendUsageWarningEmail(
                  user.email,
                  merchant.businessName,
                  plan.name,
                  subscription.conversationsUsed,
                  plan.conversationLimit,
                  'conversations'
                );

                // حفظ سجل الإرسال
                await saveAlertLog(merchant.id, 'conversations', percentage);
              }
            }
          }
        }

        // التحقق من استخدام الرسائل الصوتية
        if (plan.voiceMessageLimit > 0) {
          const percentage = (subscription.voiceMessagesUsed / plan.voiceMessageLimit) * 100;
          
          if (percentage >= 80 && percentage < 100) {
            const shouldSend = await shouldSendAlert(
              merchant.id,
              'voice_messages',
              percentage
            );

            if (shouldSend) {
              const user = await db.getUserById(merchant.userId);
              if (user?.email) {
                console.log(`[Usage Alerts] Sending voice messages alert to ${merchant.businessName} (${percentage.toFixed(0)}%)`);
                
                await sendUsageWarningEmail(
                  user.email,
                  merchant.businessName,
                  plan.name,
                  subscription.voiceMessagesUsed,
                  plan.voiceMessageLimit,
                  'voice_messages'
                );

                await saveAlertLog(merchant.id, 'voice_messages', percentage);
              }
            }
          }
        }
      } catch (error) {
        console.error(`[Usage Alerts] Error processing merchant ${merchant.id}:`, error);
      }
    }

    console.log('[Usage Alerts] Usage check completed');
  } catch (error) {
    console.error('[Usage Alerts] Error in checkUsageAndSendAlerts:', error);
  }
}

/**
 * التحقق من ضرورة إرسال التنبيه (لتجنب الإرسال المتكرر)
 */
async function shouldSendAlert(
  merchantId: number,
  type: 'conversations' | 'voice_messages',
  currentPercentage: number
): Promise<boolean> {
  // الحصول على آخر تنبيه تم إرساله
  const lastAlert = await getLastAlert(merchantId, type);
  
  if (!lastAlert) {
    // لم يتم إرسال أي تنبيه من قبل
    return true;
  }

  // إرسال تنبيه جديد فقط إذا زادت النسبة بـ 5% على الأقل
  const percentageDiff = currentPercentage - lastAlert.percentage;
  if (percentageDiff >= 5) {
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
const alertLogs: Map<string, { percentage: number; timestamp: number }> = new Map();

async function getLastAlert(merchantId: number, type: string) {
  const key = `${merchantId}-${type}`;
  return alertLogs.get(key) || null;
}

async function saveAlertLog(merchantId: number, type: string, percentage: number) {
  const key = `${merchantId}-${type}`;
  alertLogs.set(key, {
    percentage,
    timestamp: Date.now()
  });
}

/**
 * تشغيل Cron Job
 * يعمل كل ساعة
 */
export function startUsageAlertsCron() {
  // كل ساعة عند الدقيقة 0
  cron.schedule('0 * * * *', async () => {
    console.log('[Usage Alerts Cron] Running scheduled task...');
    await checkUsageAndSendAlerts();
  });

  console.log('[Usage Alerts Cron] Scheduled to run every hour');
  
  // تشغيل فوري عند بدء الخادم (للاختبار)
  // checkUsageAndSendAlerts();
}
