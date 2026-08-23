/**
 * Occasion Campaigns Cron Job
 * 
 * Runs daily at 9:00 AM to admit merchant-enabled occasion campaigns to the
 * durable delivery outbox. It never opts a merchant into marketing.
 */

import { checkAndSendOccasionCampaigns } from '../automation/occasion-campaigns';

/**
 * Main cron admission function, scheduled daily at 9:00 AM.
 */
export async function runOccasionCampaignsCron() {
  console.log('[Cron] Starting occasion campaigns check...');
  
  try {
    await checkAndSendOccasionCampaigns();
    console.log('[Cron] Occasion campaigns check completed successfully');
  } catch (error) {
    console.error('[Cron] Error in occasion campaigns check:', error);
  }
}
