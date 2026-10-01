/**
 * Occasion Campaigns Cron Job
 * 
 * Retries during the occasion day to admit merchant-enabled campaigns to the
 * durable delivery outbox. It never opts a merchant into marketing.
 */

import { checkAndSendOccasionCampaigns } from '../automation/occasion-campaigns';
import cron from 'node-cron';

let running = false;
let job: ReturnType<typeof cron.schedule> | null = null;

export async function runOccasionCampaignsCron(at = new Date()) {
  if (running) return { skipped: true as const };
  running = true;
  try {
    const result = await checkAndSendOccasionCampaigns(at);
    if (result.failed || result.limited) console.warn('[Occasion Campaigns] Admission requires retry', result);
    else if (result.checked) console.info('[Occasion Campaigns] Admission outcome', result);
    return { skipped: false as const, ...result };
  } finally { running = false; }
}

export function startOccasionCampaignsJob(): void {
  if (job) return;
  // Riyadh defines the occasion calendar. Quiet hours are checked separately per merchant.
  job = cron.schedule('*/15 9-23 * * *', () => {
    void runOccasionCampaignsCron().catch(() => console.error('[Occasion Campaigns] Admission batch unavailable'));
  }, { timezone: 'Asia/Riyadh' });
}
