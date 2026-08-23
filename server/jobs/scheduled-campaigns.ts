/**
 * Scheduled campaign admission.
 *
 * This job never performs provider I/O. It expands due campaigns into the same
 * durable recipient outbox used by the merchant send endpoint. Atomic campaign
 * claiming makes concurrent cron replicas harmless.
 */

import {
  getActiveSubscriptionByMerchantId,
  getConversationsByMerchantId,
  getDb,
  getPrimaryWhatsAppInstance,
} from '../db.js';
import {
  CampaignDispatchConflictError,
  CampaignTargetingError,
  completeCampaignWithoutRecipients,
  enqueueCampaignDeliveries,
  filterCampaignAudience,
} from '../automation/campaign-delivery-outbox';
import {
  CampaignSuppressionUnavailableError,
  filterCampaignRecipients,
  normalizeCampaignPhone,
} from '../automation/campaign-guard';

export async function checkScheduledCampaigns(): Promise<{
  checked: number;
  queued: number;
  deferred: number;
  failed: number;
}> {
  const db = await getDb();
  if (!db) return { checked: 0, queued: 0, deferred: 0, failed: 0 };
  const { campaigns } = await import('../../drizzle/schema.js');
  const { and, asc, eq, lte } = await import('drizzle-orm');
  const due = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.status, 'scheduled'), lte(campaigns.scheduledAt, new Date() as never)))
    .orderBy(asc(campaigns.scheduledAt), asc(campaigns.id))
    .limit(25);

  let queued = 0;
  let deferred = 0;
  let failed = 0;

  for (const campaign of due) {
    try {
      const [subscription, instance, conversations] = await Promise.all([
        getActiveSubscriptionByMerchantId(campaign.merchantId),
        getPrimaryWhatsAppInstance(campaign.merchantId),
        getConversationsByMerchantId(campaign.merchantId),
      ]);
      if (!subscription || !instance || instance.status !== 'active') {
        deferred++;
        continue;
      }

      let targeted;
      try {
        targeted = filterCampaignAudience(conversations, campaign.targetAudience);
      } catch (error) {
        if (error instanceof CampaignTargetingError) {
          failed++;
          continue;
        }
        throw error;
      }

      const candidates = new Map<string, (typeof targeted)[number]>();
      for (const conversation of targeted) {
        const phone = normalizeCampaignPhone(conversation.customerPhone);
        if (phone && !candidates.has(phone)) candidates.set(phone, conversation);
      }
      if (candidates.size === 0) {
        if (await completeCampaignWithoutRecipients(campaign.id, campaign.merchantId)) queued++;
        continue;
      }

      const guard = await filterCampaignRecipients(campaign.merchantId, Array.from(candidates.keys()));
      if (guard.allowed.length === 0) {
        if (guard.blocked.some(blocked => blocked.reason === 'quiet_hours')) {
          deferred++;
          continue;
        }
        if (await completeCampaignWithoutRecipients(campaign.id, campaign.merchantId)) queued++;
        continue;
      }

      await enqueueCampaignDeliveries({
        campaignId: campaign.id,
        merchantId: campaign.merchantId,
        recipients: guard.allowed.flatMap(phone => {
          const conversation = candidates.get(phone);
          return conversation ? [{ customerId: conversation.id, phone }] : [];
        }),
      });
      queued++;
    } catch (error) {
      if (error instanceof CampaignDispatchConflictError) continue;
      if (error instanceof CampaignSuppressionUnavailableError) {
        deferred++;
        continue;
      }
      failed++;
      console.error('[Scheduled Campaigns] campaign admission failed');
    }
  }

  return { checked: due.length, queued, deferred, failed };
}

let scheduledCampaignTimer: NodeJS.Timeout | null = null;

export function startScheduledCampaignsJob(): void {
  if (scheduledCampaignTimer) return;
  const tick = () => checkScheduledCampaigns().catch(() => {
    console.error('[Scheduled Campaigns] admission batch unavailable');
  });
  void tick();
  scheduledCampaignTimer = setInterval(tick, 60_000);
  scheduledCampaignTimer.unref?.();
}
