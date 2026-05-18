/**
 * Coaching Trigger Job — Priority Engine
 * 
 * Runs every 6 hours. Does NOT spam merchants.
 * Only triggers when there's real value (uncertainty, patterns, gaps).
 */

import cron from 'node-cron';
import { getPool } from '../db';
import {
  shouldTriggerCoaching,
  startCoachingSession,
  processCoachingMaintenance,
} from '../ai/coaching-engine';

let _started = false;

export function startCoachingTriggerJob(): void {
  if (_started) return;
  _started = true;

  // Check every 6 hours (not every minute — this is NOT urgent)
  cron.schedule('0 */6 * * *', async () => {
    console.log('[Coaching] 🔍 Priority Engine scanning...');

    try {
      // Maintenance: expire stale sessions
      await processCoachingMaintenance();

      // Get active merchants with subscriptions
      const pool = await getPool();
      if (!pool) return;

      const [rows] = await pool.execute(
        `SELECT DISTINCT m.id FROM merchants m
         INNER JOIN merchant_subscriptions ms ON ms.merchant_id = m.id
         WHERE m.status = 'active' AND ms.status = 'active'
         LIMIT 50`
      );

      const merchants = rows as any[];
      let triggered = 0;

      for (const merchant of merchants) {
        try {
          if (await shouldTriggerCoaching(merchant.id)) {
            await startCoachingSession(merchant.id);
            triggered++;
            // Small delay between merchants to avoid rate limits
            await new Promise(r => setTimeout(r, 2000));
          }
        } catch (err: any) {
          console.error(`[Coaching] Trigger failed for merchant ${merchant.id}:`, err.message);
        }
      }

      if (triggered > 0) {
        console.log(`[Coaching] 🎓 Triggered ${triggered} coaching session(s)`);
      }
    } catch (err: any) {
      console.error('[Coaching] Trigger job failed:', err.message);
    }
  });

  console.log('[Coaching] ✅ Priority Engine registered (every 6 hours)');
}
