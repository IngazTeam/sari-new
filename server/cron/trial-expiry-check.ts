/**
 * Cron Job: Check Trial Expiry
 * Runs daily to check for expiring trials and send notifications
 */

import * as db from '../db';
import { sendTrialExpiryEmail } from '../_core/email';

/**
 * Check for trials expiring in 3 days and send warning emails
 */
export async function checkTrialsExpiring3Days() {
  console.log('[Cron] Checking for trials expiring in 3 days...');

  try {
    const users = await db.getUsersWithExpiringTrial(3);

    console.log(`[Cron] Found ${users.length} users with trials expiring in 3 days`);

    for (const user of users) {
      if (!user.email) continue;

      try {
        await sendTrialExpiryEmail({
          name: user.name || 'عزيزي المستخدم',
          email: user.email,
          daysRemaining: 3,
        });

        console.log(`[Cron] Sent 3-day expiry email to ${user.email}`);
      } catch (error) {
        console.error(`[Cron] Failed to send email to ${user.email}:`, error);
      }
    }
  } catch (error) {
    console.error('[Cron] Error checking 3-day expiring trials:', error);
  }
}

/**
 * Check for trials expiring in 1 day and send urgent warning emails
 */
export async function checkTrialsExpiring1Day() {
  console.log('[Cron] Checking for trials expiring in 1 day...');

  try {
    const users = await db.getUsersWithExpiringTrial(1);

    console.log(`[Cron] Found ${users.length} users with trials expiring in 1 day`);

    for (const user of users) {
      if (!user.email) continue;

      try {
        await sendTrialExpiryEmail({
          name: user.name || 'عزيزي المستخدم',
          email: user.email,
          daysRemaining: 1,
        });

        console.log(`[Cron] Sent 1-day expiry email to ${user.email}`);
      } catch (error) {
        console.error(`[Cron] Failed to send email to ${user.email}:`, error);
      }
    }
  } catch (error) {
    console.error('[Cron] Error checking 1-day expiring trials:', error);
  }
}

/**
 * Check for expired trials and deactivate them
 */
export async function checkExpiredTrials() {
  console.log('[Cron] Checking for expired trials...');

  try {
    const users = await db.getUsersWithExpiredTrial();

    console.log(`[Cron] Found ${users.length} users with expired trials`);

    for (const user of users) {
      try {
        // Deactivate trial on user record
        await db.deactivateUserTrial(user.id);

        // Update merchant subscription status to expired
        const merchant = await db.getMerchantByUserId(user.id);
        if (merchant) {
          await db.updateMerchant(merchant.id, { subscriptionStatus: 'expired' });
        }

        // Send expiry notification email
        if (user.email) {
          try {
            await sendTrialExpiryEmail({
              name: user.name || 'عزيزي المستخدم',
              email: user.email,
              daysRemaining: 0,
            });
          } catch (emailError) {
            console.error(`[Cron] Failed to send expiry email to ${user.email}:`, emailError);
          }
        }

        console.log(`[Cron] Deactivated trial for user ${user.id} (${user.email})`);
      } catch (error) {
        console.error(`[Cron] Failed to deactivate trial for user ${user.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[Cron] Error checking expired trials:', error);
  }
}

/**
 * Main cron job function - runs daily
 */
export async function runTrialExpiryCheck() {
  console.log('[Cron] Starting trial expiry check...');

  await checkTrialsExpiring3Days();
  await checkTrialsExpiring1Day();
  await checkExpiredTrials();

  console.log('[Cron] Trial expiry check completed');
}

// Run immediately if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTrialExpiryCheck()
    .then(() => {
      console.log('[Cron] Trial expiry check completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Cron] Trial expiry check failed:', error);
      process.exit(1);
    });
}
