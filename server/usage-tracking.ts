/**
 * Usage Tracking System
 * Tracks and enforces subscription limits for conversations, messages, and voice messages
 */

import * as db from './db';

/**
 * Get active subscription for merchant
 */
async function getActiveSubscription(merchantId: number) {
  const subscription = await db.getActiveSubscriptionByMerchantId(merchantId);
  
  if (!subscription || subscription.status !== 'active') {
    return null;
  }
  
  return subscription;
}

/**
 * Get plan limits
 */
async function getPlanLimits(planId: number) {
  const plan = await db.getPlanById(planId);
  
  if (!plan) {
    throw new Error('Plan not found');
  }
  
  return {
    maxConversations: plan.conversationLimit,
    maxMessages: -1, // No message limit in current schema, unlimited
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
    
    const limits = await getPlanLimits(subscription.planId);
    
    // Unlimited plan
    if (limits.maxConversations === -1) {
      return false;
    }
    
    const reached = subscription.conversationsUsed >= limits.maxConversations;
    
    if (reached) {
      console.warn(`[Usage] Merchant ${merchantId} reached conversation limit: ${subscription.conversationsUsed}/${limits.maxConversations}`);
    }
    
    return reached;
  } catch (error: any) {
    console.error('[Usage] Error checking conversation limit:', error);
    return false; // Don't block on error
  }
}

/**
 * Check if merchant has reached message limit
 */
export async function hasReachedMessageLimit(merchantId: number): Promise<boolean> {
  try {
    const subscription = await getActiveSubscription(merchantId);
    
    if (!subscription) {
      console.warn(`[Usage] No active subscription for merchant ${merchantId}`);
      return true;
    }
    
    const limits = await getPlanLimits(subscription.planId);
    
    // Unlimited plan
    if (limits.maxMessages === -1) {
      return false;
    }
    
    const reached = subscription.messagesUsed >= limits.maxMessages;
    
    if (reached) {
      console.warn(`[Usage] Merchant ${merchantId} reached message limit: ${subscription.messagesUsed}/${limits.maxMessages}`);
    }
    
    return reached;
  } catch (error: any) {
    console.error('[Usage] Error checking message limit:', error);
    return false;
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
    
    const limits = await getPlanLimits(subscription.planId);
    
    // Unlimited plan
    if (limits.maxVoiceMessages === -1) {
      return false;
    }
    
    const reached = subscription.voiceMessagesUsed >= limits.maxVoiceMessages;
    
    if (reached) {
      console.warn(`[Usage] Merchant ${merchantId} reached voice message limit: ${subscription.voiceMessagesUsed}/${limits.maxVoiceMessages}`);
    }
    
    return reached;
  } catch (error: any) {
    console.error('[Usage] Error checking voice message limit:', error);
    return false;
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
    
    const newCount = (subscription.conversationsUsed || 0) + 1;
    await db.updateSubscription(subscription.id, {
      conversationsUsed: newCount,
    });
    
    console.log(`[Usage] Incremented conversations for merchant ${merchantId}: ${newCount}`);
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
    
    const newCount = (subscription.messagesUsed || 0) + 1;
    await db.updateSubscription(subscription.id, {
      messagesUsed: newCount,
    });
    
    console.log(`[Usage] Incremented messages for merchant ${merchantId}: ${newCount}`);
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
    
    const newCount = (subscription.voiceMessagesUsed || 0) + 1;
    await db.updateSubscription(subscription.id, {
      voiceMessagesUsed: newCount,
    });
    
    console.log(`[Usage] Incremented voice messages for merchant ${merchantId}: ${newCount}`);
  } catch (error: any) {
    console.error('[Usage] Error incrementing voice message usage:', error);
  }
}

/**
 * Get usage statistics for merchant
 */
export async function getUsageStats(merchantId: number) {
  try {
    const subscription = await getActiveSubscription(merchantId);
    
    if (!subscription) {
      return null;
    }
    
    const limits = await getPlanLimits(subscription.planId);
    
    return {
      conversations: {
        used: subscription.conversationsUsed,
        limit: limits.maxConversations,
        percentage: limits.maxConversations === -1 ? 0 : (subscription.conversationsUsed / limits.maxConversations) * 100,
        unlimited: limits.maxConversations === -1,
      },
      messages: {
        used: subscription.messagesUsed,
        limit: limits.maxMessages,
        percentage: limits.maxMessages === -1 ? 0 : (subscription.messagesUsed / limits.maxMessages) * 100,
        unlimited: limits.maxMessages === -1,
      },
      voiceMessages: {
        used: subscription.voiceMessagesUsed,
        limit: limits.maxVoiceMessages,
        percentage: limits.maxVoiceMessages === -1 ? 0 : (subscription.voiceMessagesUsed / limits.maxVoiceMessages) * 100,
        unlimited: limits.maxVoiceMessages === -1,
      },
      lastResetAt: subscription.lastResetAt,
      nextResetAt: getNextResetDate(subscription.lastResetAt),
    };
  } catch (error: any) {
    console.error('[Usage] Error getting usage stats:', error);
    return null;
  }
}

/**
 * Calculate next reset date (monthly)
 */
function getNextResetDate(lastResetAt: Date): Date {
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
    const merchants = await db.getAllMerchants();
    const activeSubscriptions = [];
    
    for (const merchant of merchants) {
      const subscription = await db.getActiveSubscriptionByMerchantId(merchant.id);
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
        await db.updateSubscription(subscription.id, {
          conversationsUsed: 0,
          messagesUsed: 0,
          voiceMessagesUsed: 0,
          lastResetAt: now,
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

/**
 * Check if merchant is approaching any limit (>80%)
 */
export async function isApproachingLimit(merchantId: number): Promise<{
  approaching: boolean;
  warnings: string[];
}> {
  try {
    const stats = await getUsageStats(merchantId);
    
    if (!stats) {
      return { approaching: false, warnings: [] };
    }
    
    const warnings: string[] = [];
    
    if (!stats.conversations.unlimited && stats.conversations.percentage > 80) {
      warnings.push(`المحادثات: ${stats.conversations.used}/${stats.conversations.limit} (${Math.round(stats.conversations.percentage)}%)`);
    }
    
    if (!stats.messages.unlimited && stats.messages.percentage > 80) {
      warnings.push(`الرسائل: ${stats.messages.used}/${stats.messages.limit} (${Math.round(stats.messages.percentage)}%)`);
    }
    
    if (!stats.voiceMessages.unlimited && stats.voiceMessages.percentage > 80) {
      warnings.push(`الرسائل الصوتية: ${stats.voiceMessages.used}/${stats.voiceMessages.limit} (${Math.round(stats.voiceMessages.percentage)}%)`);
    }
    
    return {
      approaching: warnings.length > 0,
      warnings,
    };
  } catch (error: any) {
    console.error('[Usage] Error checking if approaching limit:', error);
    return { approaching: false, warnings: [] };
  }
}
