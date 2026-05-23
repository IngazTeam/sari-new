/**
 * Subscription Management Cron Jobs
 * 
 * This file contains scheduled jobs for subscription management:
 * - Check expired subscriptions (hourly)
 * - Send expiry reminders (daily)
 * - Auto-renew subscriptions (daily)
 */

import cron from 'node-cron';
import {
  checkExpiredSubscriptions,
  sendExpiryReminders,
  autoRenewSubscriptions,
} from '../_core/subscriptionManager';

/**
 * Check for expired subscriptions every hour
 * Updates subscription status and sends notifications
 */
export function startExpiredSubscriptionsJob() {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    console.log('[Subscription Jobs] Running expired subscriptions check...');
    try {
      const result = await checkExpiredSubscriptions();
      console.log('[Subscription Jobs] Expired subscriptions check completed:', result);
    } catch (error) {
      console.error('[Subscription Jobs] Error checking expired subscriptions:', error);
    }
  });

  console.log('[Subscription Jobs] Expired subscriptions job started (runs hourly)');
}

/**
 * Send expiry reminders daily at 9:00 AM
 * Sends reminders for subscriptions expiring in 7, 3, and 1 days
 */
export function startExpiryRemindersJob() {
  // Run daily at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('[Subscription Jobs] Sending expiry reminders...');
    try {
      // @ts-ignore
      const result = await sendExpiryReminders();
      console.log('[Subscription Jobs] Expiry reminders sent:', result);
    } catch (error) {
      console.error('[Subscription Jobs] Error sending expiry reminders:', error);
    }
  });

  console.log('[Subscription Jobs] Expiry reminders job started (runs daily at 9:00 AM)');
}

/**
 * Auto-renew subscriptions daily at 2:00 AM
 * Processes subscriptions with auto-renew enabled
 */
export function startAutoRenewJob() {
  // Run daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('[Subscription Jobs] Processing auto-renewals...');
    try {
      const result = await autoRenewSubscriptions();
      console.log('[Subscription Jobs] Auto-renewals processed:', result);
    } catch (error) {
      console.error('[Subscription Jobs] Error processing auto-renewals:', error);
    }
  });

  console.log('[Subscription Jobs] Auto-renew job started (runs daily at 2:00 AM)');
}

/**
 * Start all subscription-related cron jobs
 */
export function startSubscriptionJobs() {
  console.log('[Subscription Jobs] Starting all subscription jobs...');
  
  startExpiredSubscriptionsJob();
  startExpiryRemindersJob();
  startAutoRenewJob();
  
  console.log('[Subscription Jobs] All subscription jobs started successfully');
}