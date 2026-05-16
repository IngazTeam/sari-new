/**
 * Escalation Cascade Job
 * 
 * Runs every 60 seconds.
 * Checks for escalations that were notified > 5 minutes ago but haven't been answered.
 * Cascades to the next phone in the merchant's escalation chain.
 * If all phones exhausted, sends a professional apology to the customer.
 */

import { processCascadingEscalations } from '../ai/smart-escalation';
import { expireStaleEscalations } from '../db/learning';

/** Process pending cascading escalations */
async function runCascadeCheck(): Promise<void> {
  try {
    const processed = await processCascadingEscalations();
    if (processed > 0) {
      console.log(`[CascadeJob] Processed ${processed} escalation(s)`);
    }

    // Also expire stale escalations (> 24 hours)
    const expired = await expireStaleEscalations();
    if (expired > 0) {
      console.log(`[CascadeJob] Expired ${expired} stale escalation(s)`);
    }
  } catch (err: any) {
    console.error('[CascadeJob] Error:', err.message);
  }
}

/** Start the escalation cascade job (runs every 60 seconds) */
export function startEscalationCascadeJob(): void {
  console.log('[CascadeJob] ✅ Started — checking every 60s for pending cascades');

  // Run immediately on startup
  runCascadeCheck();

  // Then every 60 seconds
  setInterval(runCascadeCheck, 60_000);
}
