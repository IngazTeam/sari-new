/**
 * Follow-Up Reminder Job — Unified
 * 
 * Runs every 5 minutes.
 * Processes all due follow-ups from the unified `sales_followups` table.
 * 
 * BUG-FIX: Previously this job read from `conversations.agent_history` (TEXT column)
 * which was overwritten by action-selector and resume-context. Now uses dedicated
 * `sales_followups` table shared with proactive-followup.ts.
 */

import { runFollowUps } from '../ai/proactive-followup';

/** Start the follow-up reminder job (runs every 5 minutes) */
export function startFollowUpJob(): void {
  console.log('[FollowUpJob] ✅ Started — checking every 5min for due follow-ups (unified DB)');

  // Run immediately on startup
  runFollowUps().catch(err => {
    console.warn('[FollowUpJob] Initial run failed:', err);
  });

  // Then every 5 minutes
  setInterval(() => {
    runFollowUps().catch(err => {
      console.warn('[FollowUpJob] Run failed:', err);
    });
  }, 5 * 60_000);
}
