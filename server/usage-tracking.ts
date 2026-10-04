/**
 * Usage Tracking System
 * Tracks and enforces subscription limits for conversations, messages, and voice messages
 */

import {
  getActiveSubscriptionByMerchantId,
  getAllMerchants,
  getPlanById,
  incrementSubscriptionUsage,
  updateSubscription,
} from './db';
import { usageQuota } from '../shared/usage-workspace';
import { TRIAL_USAGE_LIMITS } from '../shared/subscription-usage';
export { TRIAL_USAGE_LIMITS } from '../shared/subscription-usage';

/**
 * Get active subscription for merchant
 */
async function getActiveSubscription(merchantId: number) {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1 || merchantId > 2147483647) throw Error("Invalid usage tenant");
  const subscription = await getActiveSubscriptionByMerchantId(merchantId);
  
  if (!subscription || (subscription.status !== 'active' && subscription.status !== 'trial')) {
    return null;
  }
  
  return subscription;
}

/**
 * Get plan limits
 */
async function getPlanLimits(planId: number | null | undefined, status: string) {
  if (!planId && status === 'trial') return TRIAL_USAGE_LIMITS;
  if (!planId) throw new Error('Subscription plan missing');
  const plan = await getPlanById(planId);
  
  if (!plan) {
    throw new Error('Plan not found');
  }
  
  return {
    maxConversations: plan.conversationLimit,
    maxVoiceMessages: plan.voiceMessageLimit,
  };
}

/**
 * Check if merchant has reached conversation limit
 */
export async function hasReachedConversationLimit(merchantId: number): Promise<boolean> {
  try {
    const subscription = await getActiveSubscription(merchantId);
    
    if (!subscription) {
      console.warn(`[Usage] No active subscription for merchant ${merchantId}`);
      return true; // Block if no subscription
    }
    
    const limits = await getPlanLimits(subscription.planId, subscription.status);
    
    const quota = usageQuota(subscription.conversationsUsed, limits.maxConversations);
    if (quota.used === null || quota.unlimited === null) return true;
    // Unlimited allowance still requires a valid counter.
    if (quota.unlimited) {
      return false;
    }
    
    const reached = subscription.conversationsUsed >= limits.maxConversations;
    
    if (reached) {
      console.warn(`[Usage] Merchant ${merchantId} reached conversation limit: ${subscription.conversationsUsed}/${limits.maxConversations}`);
    }
    
    return reached;
  } catch (error: any) {
    console.error('[Usage] Error checking conversation limit:', error);
    return true; // Billing/quota checks fail closed when their source of truth is unavailable.
  }
}

/**
 * Check if merchant has reached message limit
 */
export async function hasReachedMessageLimit(merchantId: number): Promise<boolean> {
  try {
    if (!Number.isSafeInteger(merchantId) || merchantId < 1 || merchantId > 2147483647) return true;
    const { assertReplyUsageSchema, lockReplyUsageCapacity } = await import('./ai/reply-usage-quota');
    const { checkoutTransaction } = await import('./ai/checkout-agreements');
    await assertReplyUsageSchema();
    await checkoutTransaction(async c => {
      await c.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE', [merchantId]);
      await lockReplyUsageCapacity(c, merchantId);
    });
    // Advisory admission before generation. The final transport gate reserves the same capacity atomically.
    return false;
  } catch {
    return true;
  }
}

/**
 * Check if merchant has reached voice message limit
 */
export async function hasReachedVoiceMessageLimit(merchantId: number): Promise<boolean> {
  try {
    const subscription = await getActiveSubscription(merchantId);
    
    if (!subscription) {
      console.warn(`[Usage] No active subscription for merchant ${merchantId}`);
      return true;
    }
    
    const limits = await getPlanLimits(subscription.planId, subscription.status);
    
    const quota = usageQuota(subscription.voiceMessagesUsed, limits.maxVoiceMessages);
    if (quota.used === null || quota.unlimited === null) return true;
    // Unlimited allowance still requires a valid counter.
    if (quota.unlimited) {
      return false;
    }
    
    const reached = subscription.voiceMessagesUsed >= limits.maxVoiceMessages;
    
    if (reached) {
      console.warn(`[Usage] Merchant ${merchantId} reached voice message limit: ${subscription.voiceMessagesUsed}/${limits.maxVoiceMessages}`);
    }
    
    return reached;
  } catch (error: any) {
    console.error('[Usage] Error checking voice message limit:', error);
    return true;
  }
}

/**
 * Increment conversation usage
 */
export async function incrementConversationUsage(merchantId: number): Promise<void> {
  try {
    const subscription = await getActiveSubscription(merchantId);
    
    if (!subscription) {
      console.warn(`[Usage] No active subscription for merchant ${merchantId}, skipping increment`);
      return;
    }
    
    await incrementSubscriptionUsage(subscription.id, 1, 0, 0);
    console.log(`[Usage] Incremented conversations for merchant ${merchantId}`);
  } catch (error: any) {
    console.error('[Usage] Error incrementing conversation usage:', error);
  }
}

/**
 * Increment message usage
 */
export async function incrementMessageUsage(merchantId: number): Promise<void> {
  try {
    const subscription = await getActiveSubscription(merchantId);
    
    if (!subscription) {
      console.warn(`[Usage] No active subscription for merchant ${merchantId}, skipping increment`);
      return;
    }
    
    await incrementSubscriptionUsage(subscription.id, 0, 0, 1);
    console.log(`[Usage] Incremented messages for merchant ${merchantId}`);
  } catch (error: any) {
    console.error('[Usage] Error incrementing message usage:', error);
  }
}

/**
 * Increment voice message usage
 */
export async function incrementVoiceMessageUsage(merchantId: number): Promise<void> {
  try {
    const subscription = await getActiveSubscription(merchantId);
    
    if (!subscription) {
      console.warn(`[Usage] No active subscription for merchant ${merchantId}, skipping increment`);
      return;
    }
    
    await incrementSubscriptionUsage(subscription.id, 0, 1, 0);
    console.log(`[Usage] Incremented voice messages for merchant ${merchantId}`);
  } catch (error: any) {
    console.error('[Usage] Error incrementing voice message usage:', error);
  }
}

/**
 * Calculate next reset date (monthly)
 */
function getNextResetDate(lastResetAt: string | Date): Date {
  const next = new Date(lastResetAt);
  next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * Reset monthly usage for all active subscriptions
 * This should be called by a cron job monthly
 */
export async function resetMonthlyUsage(): Promise<void> {
  try {
    console.log('[Usage] Starting monthly usage reset...');
    
    // Get all merchants and their subscriptions
    const merchants = await getAllMerchants();
    const activeSubscriptions = [];
    
    for (const merchant of merchants) {
      const subscription = await getActiveSubscriptionByMerchantId(merchant.id);
      if (subscription && subscription.status === 'active') {
        activeSubscriptions.push(subscription);
      }
    }
    
    let resetCount = 0;
    
    for (const subscription of activeSubscriptions) {
      const nextReset = getNextResetDate(subscription.lastResetAt);
      const now = new Date();
      
      // Check if it's time to reset
      if (now >= nextReset) {
        await updateSubscription(subscription.id, {
          conversationsUsed: 0,
          messagesUsed: 0,
          voiceMessagesUsed: 0,
          lastResetAt: now as any,
        });
        
        resetCount++;
        console.log(`[Usage] Reset usage for subscription ${subscription.id} (merchant ${subscription.merchantId})`);
      }
    }
    
    console.log(`[Usage] Monthly reset completed: ${resetCount} subscriptions reset`);
  } catch (error: any) {
    console.error('[Usage] Error resetting monthly usage:', error);
  }
}
