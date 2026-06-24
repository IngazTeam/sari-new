/**
 * WhatsApp Instance Health Check Job
 * 
 * Runs every 5 minutes to verify all active WhatsApp instances are still
 * authorized on Green API. When an instance becomes disconnected (notAuthorized),
 * it creates an in-app notification for the merchant and logs the event.
 * 
 * This prevents the "invisible disconnect" problem where messages silently stop
 * arriving because the WhatsApp session expired without anyone noticing.
 */

import { notifyOwner } from '../_core/notification';

// Track last notification time per instance to avoid spam (max 1 per 4 hours)
const lastNotifiedAt: Map<number, number> = new Map();
const NOTIFICATION_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function checkWhatsAppHealth(): Promise<{
  checked: number;
  healthy: number;
  disconnected: number;
  errors: number;
}> {
  const stats = { checked: 0, healthy: 0, disconnected: 0, errors: 0 };

  try {
    const {
      getAllMerchants,
      getWhatsAppInstancesByMerchantId,
      createNotification,
    } = await import('../db');
    const { default: axios } = await import('axios');

    const allMerchants = await getAllMerchants();
    if (!allMerchants || allMerchants.length === 0) return stats;

    for (const merchant of allMerchants) {
      try {
        const instances = await getWhatsAppInstancesByMerchantId(merchant.id);
        const activeInstances = instances.filter(
          (i: any) => i.status === 'active' && i.instanceId && i.token
        );

        if (activeInstances.length === 0) continue;

        for (const instance of activeInstances) {
          stats.checked++;
          const apiUrl = (instance as any).apiUrl || 'https://api.green-api.com';
          const baseURL = `${apiUrl}/waInstance${instance.instanceId}`;

          try {
            const stateRes = await axios.get(
              `${baseURL}/getStateInstance/${instance.token}`,
              { timeout: 10000 }
            );
            const state = stateRes.data?.stateInstance || 'unknown';

            if (state === 'authorized') {
              stats.healthy++;
            } else {
              stats.disconnected++;
              console.warn(
                `[WhatsApp Health] ⚠️ Instance ${instance.instanceId} ` +
                `(merchant ${merchant.id} — ${merchant.businessName}) is "${state}"`
              );

              // Check cooldown — don't spam notifications
              const lastNotified = lastNotifiedAt.get(instance.id) || 0;
              const now = Date.now();
              if (now - lastNotified < NOTIFICATION_COOLDOWN_MS) {
                continue; // Skip, recently notified
              }
              lastNotifiedAt.set(instance.id, now);

              // Create in-app notification for the merchant
              await createNotification({
                userId: merchant.userId,
                type: 'error',
                title: '⚠️ واتساب غير متصل',
                message: `رقم الواتساب ${instance.phoneNumber || instance.instanceId} بحاجة لإعادة الربط. اذهب لصفحة إدارة الأرقام واضغط "إعادة الربط".`,
                link: '/merchant/whatsapp-instances',
              });

              // Also notify platform owner for visibility
              try {
                await notifyOwner({
                  title: `⚠️ واتساب مفصول — ${merchant.businessName}`,
                  content: `الرقم ${instance.phoneNumber || instance.instanceId} بحالة "${state}". التاجر: ${merchant.businessName} (ID: ${merchant.id})`,
                });
              } catch { /* silent */ }
            }
          } catch (err: any) {
            stats.errors++;
            if (!err.message?.includes('timeout')) {
              console.error(
                `[WhatsApp Health] Error checking instance ${instance.instanceId}:`,
                err.message
              );
            }
          }
        }
      } catch (err: any) {
        stats.errors++;
      }
    }

    console.log(`[WhatsApp Health] ✅ Check complete:`, stats);
    return stats;
  } catch (error) {
    console.error('[WhatsApp Health] Fatal error:', error);
    return stats;
  }
}
