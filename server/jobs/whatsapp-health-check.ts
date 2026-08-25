/**
 * WhatsApp Instance Health Check Job
 *
 * Runs every five minutes. A definitive disconnect opens one durable incident
 * with at most two merchant alert cycles: immediately and once after 24 hours.
 * The incident stops producing alerts after 48 hours and closes on recovery.
 */

import { notifyOwner } from '../_core/notification';
import { sendMerchantWhatsApp } from '../channels/whatsapp/service';
import { getWhatsAppProvider } from '../channels/whatsapp/providers';
import type { WhatsAppProviderConfig, WhatsAppProviderKind } from '../channels/whatsapp/types';
import {
  reserveWhatsAppDisconnectAlert,
  resolveWhatsAppDisconnectIncident,
} from './whatsapp-disconnect-incidents';
import {
  chooseHealthyAlertSender,
  classifyWhatsAppHealth,
  disconnectAlertMessage,
} from './whatsapp-disconnect-policy';
import { sendWhatsAppDisconnectEmail } from './whatsapp-disconnect-email';

type ProbedInstance = {
  instance: any;
  classification: ReturnType<typeof classifyWhatsAppHealth>;
  detail: string;
};

type AlertSenderRoute = {
  instance: any;
  sendingMerchantId: number;
};

function providerConfig(instance: any): WhatsAppProviderConfig {
  return {
    provider: (instance.provider || 'green_api') as WhatsAppProviderKind,
    instanceId: String(instance.instanceId || ''),
    token: String(instance.token || ''),
    apiUrl: instance.apiUrl,
    phoneNumberId: instance.phoneNumberId,
    providerAccountId: instance.providerAccountId,
  };
}

function reconnectUrl(): string {
  try {
    const origin = new URL(process.env.VITE_APP_URL || 'https://sary.live');
    if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('Unsafe URL');
    return new URL('/merchant/whatsapp-instances', origin.origin).toString();
  } catch {
    return 'https://sary.live/merchant/whatsapp-instances';
  }
}

async function probeInstance(instance: any): Promise<ProbedInstance> {
  const provider = getWhatsAppProvider((instance.provider || 'green_api') as WhatsAppProviderKind);
  const result = await provider.health(providerConfig(instance));
  return {
    instance,
    classification: classifyWhatsAppHealth(result),
    detail: String(result.detail || 'unknown').slice(0, 100),
  };
}

function configuredPositiveId(name: string): number | null {
  const value = process.env[name]?.trim();
  if (!value) return null;
  if (!/^\d{1,10}$/.test(value)) throw new Error(`${name} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

async function configuredPlatformAlertSender(
  getWhatsAppInstanceById: (id: number) => Promise<any>,
): Promise<AlertSenderRoute | null> {
  const instanceRecordId = configuredPositiveId('SARI_ALERT_WHATSAPP_INSTANCE_ID');
  const sendingMerchantId = configuredPositiveId('SARI_ALERT_WHATSAPP_MERCHANT_ID');
  if (!instanceRecordId && !sendingMerchantId) return null;
  if (!instanceRecordId || !sendingMerchantId) {
    throw new Error('Both SARI_ALERT_WHATSAPP_INSTANCE_ID and SARI_ALERT_WHATSAPP_MERCHANT_ID are required');
  }

  const instance = await getWhatsAppInstanceById(instanceRecordId);
  if (!instance || instance.merchantId !== sendingMerchantId || instance.status !== 'active') {
    throw new Error('Configured platform WhatsApp alert sender is unavailable or ownership-mismatched');
  }
  const probe = await probeInstance(instance);
  if (probe.classification !== 'healthy') {
    throw new Error(`Configured platform WhatsApp alert sender is not healthy (${probe.detail})`);
  }
  return { instance, sendingMerchantId };
}

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
      getWhatsAppInstanceById,
      getUserById,
      createNotification,
    } = await import('../db');
    const allMerchants = await getAllMerchants();
    if (!allMerchants?.length) return stats;
    let platformSenderLoaded = false;
    let platformSender: AlertSenderRoute | null = null;

    const getPlatformSender = async (): Promise<AlertSenderRoute | null> => {
      if (platformSenderLoaded) return platformSender;
      platformSenderLoaded = true;
      try {
        platformSender = await configuredPlatformAlertSender(getWhatsAppInstanceById);
      } catch (error: any) {
        console.error('[WhatsApp Health] Platform alert sender configuration failed', {
          error: String(error?.message || 'unknown').slice(0, 200),
        });
      }
      return platformSender;
    };

    for (const merchant of allMerchants) {
      try {
        const instances = await getWhatsAppInstancesByMerchantId(merchant.id);
        const activeInstances = instances.filter(
          (instance: any) => instance.status === 'active' && instance.instanceId && instance.token,
        );
        if (!activeInstances.length) continue;

        // Probe every candidate before sending so an alert can use a different,
        // provider-verified instance belonging to the same merchant.
        const probes: ProbedInstance[] = [];
        for (const instance of activeInstances) {
          stats.checked += 1;
          try {
            const probe = await probeInstance(instance);
            probes.push(probe);
            if (probe.classification === 'healthy') {
              stats.healthy += 1;
              await resolveWhatsAppDisconnectIncident({ merchantId: merchant.id, instanceId: instance.id });
            } else if (probe.classification === 'disconnected') {
              stats.disconnected += 1;
            } else {
              stats.errors += 1;
              console.warn('[WhatsApp Health] Transient provider health failure', {
                merchantId: merchant.id,
                instanceRecordId: instance.id,
                detail: probe.detail,
              });
            }
          } catch (error: any) {
            stats.errors += 1;
            console.error('[WhatsApp Health] Instance probe failed', {
              merchantId: merchant.id,
              instanceRecordId: instance.id,
              error: String(error?.message || 'unknown').slice(0, 200),
            });
          }
        }

        const healthyInstances = probes
          .filter(probe => probe.classification === 'healthy')
          .map(probe => probe.instance);
        let merchantUser: Awaited<ReturnType<typeof getUserById>> | undefined;
        let userLoaded = false;

        for (const probe of probes.filter(item => item.classification === 'disconnected')) {
          const instance = probe.instance;
          const reservation = await reserveWhatsAppDisconnectAlert({
            merchantId: merchant.id,
            instanceId: instance.id,
          });
          if (!reservation) continue;

          const phoneNumber = instance.phoneNumber || String(instance.instanceId);
          const stageLabel = reservation.sequence === 1 ? 'التنبيه الأول' : 'التذكير الأخير';
          const notificationBody = reservation.sequence === 1
            ? `رقم الواتساب ${phoneNumber} بحاجة لإعادة الربط. سنرسل تذكيرًا أخيرًا بعد 24 ساعة إذا استمر الانقطاع.`
            : `رقم الواتساب ${phoneNumber} ما زال غير متصل. هذا التذكير الأخير ضمن نافذة 48 ساعة.`;

          try {
            await createNotification({
              userId: merchant.userId,
              type: 'error',
              title: `⚠️ واتساب غير متصل — ${stageLabel}`,
              message: notificationBody,
              link: '/merchant/whatsapp-instances',
            });
          } catch (error: any) {
            console.error('[WhatsApp Health] In-app alert failed', {
              merchantId: merchant.id,
              incidentId: reservation.incidentId,
              error: String(error?.message || 'unknown').slice(0, 200),
            });
          }

          if (!userLoaded) {
            merchantUser = await getUserById(merchant.userId);
            userLoaded = true;
          }
          if (merchantUser?.email) {
            try {
              const emailSent = await sendWhatsAppDisconnectEmail(
                merchantUser.email,
                merchant.businessName,
                phoneNumber,
                probe.detail,
                { sequence: reservation.sequence, detectedAt: reservation.detectedAt },
              );
              if (!emailSent) {
                console.warn('[WhatsApp Health] Email alert was rejected', {
                  merchantId: merchant.id,
                  incidentId: reservation.incidentId,
                });
              }
            } catch (error: any) {
              console.error('[WhatsApp Health] Email alert failed', {
                merchantId: merchant.id,
                incidentId: reservation.incidentId,
                error: String(error?.message || 'unknown').slice(0, 200),
              });
            }
          }

          const recipientPhone = (merchant as any).emergencyPhone || merchant.phone;
          const merchantSender = chooseHealthyAlertSender(healthyInstances, instance.id, recipientPhone);
          let senderRoute: AlertSenderRoute | null = merchantSender
            ? { instance: merchantSender, sendingMerchantId: merchant.id }
            : null;
          if (!senderRoute && recipientPhone) {
            const configuredSender = await getPlatformSender();
            const safeConfiguredSender = configuredSender
              ? chooseHealthyAlertSender([configuredSender.instance], instance.id, recipientPhone)
              : null;
            if (configuredSender && safeConfiguredSender) {
              senderRoute = { instance: safeConfiguredSender, sendingMerchantId: configuredSender.sendingMerchantId };
            }
          }
          if (senderRoute && recipientPhone) {
            try {
              const delivery = await sendMerchantWhatsApp({
                merchantId: senderRoute.sendingMerchantId,
                instanceRecordId: senderRoute.instance.id,
                to: recipientPhone,
                kind: 'text',
                text: disconnectAlertMessage({
                  businessName: merchant.businessName,
                  phoneNumber,
                  sequence: reservation.sequence,
                  reconnectUrl: reconnectUrl(),
                }),
                idempotencyKey: `whatsapp-disconnect:${reservation.incidentId}:${reservation.sequence}`,
              });
              if (!delivery.accepted) {
                console.warn('[WhatsApp Health] Alternate WhatsApp alert was rejected', {
                  merchantId: merchant.id,
                  incidentId: reservation.incidentId,
                  errorCode: delivery.errorCode,
                });
              }
            } catch (error: any) {
              console.error('[WhatsApp Health] Alternate WhatsApp alert failed', {
                merchantId: merchant.id,
                incidentId: reservation.incidentId,
                error: String(error?.message || 'unknown').slice(0, 200),
              });
            }
          } else {
            console.info('[WhatsApp Health] WhatsApp alert channel unavailable; email and in-app retained', {
              merchantId: merchant.id,
              incidentId: reservation.incidentId,
            });
          }

          try {
            await notifyOwner({
              title: `⚠️ واتساب مفصول — ${merchant.businessName}`,
              content: `${stageLabel}: مثيل واتساب للتاجر ${merchant.businessName} (ID: ${merchant.id}) بحالة "${probe.detail}".`,
            });
          } catch {
            // The merchant channels above are independent of the owner channel.
          }
        }
      } catch (error: any) {
        stats.errors += 1;
        console.error('[WhatsApp Health] Merchant health cycle failed', {
          merchantId: merchant.id,
          error: String(error?.message || 'unknown').slice(0, 200),
        });
      }
    }

    console.log('[WhatsApp Health] Check complete', stats);
    return stats;
  } catch (error) {
    console.error('[WhatsApp Health] Fatal error:', error);
    return stats;
  }
}
