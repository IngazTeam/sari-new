/**
 * Sales Intelligence Conductor — The Strategic Brain (Periodic)
 * 
 * Background job that periodically analyzes sales outcomes and
 * builds a per-merchant Playbook consumed by the real-time Strategist.
 * 
 * Daily: Analyze strategy effectiveness, update winning phrases
 * Weekly: Review objection patterns, adjust playbook weights
 * 
 * Reads from existing tables:
 * - sari_strategy_metrics (recordStrategyUse/markStrategySuccess)
 * - sari_learning_signals (Learning Engine)
 * - customer_profiles (Customer Intelligence)
 * 
 * The Conductor does NOT talk to GPT — it's pure analytics.
 */

import { getAllMerchants, getPool } from '../db';

// ═══════════════════════════════════════════════════════════════
// Types — MerchantPlaybook
// ═══════════════════════════════════════════════════════════════

export interface StrategyWeight {
  strategy: string;
  intent: string;
  successRate: number;      // 0-1
  sampleSize: number;
  lastUpdated: Date;
}

export interface WinningPhrase {
  phrase: string;
  conversionLift: number;   // percentage
  sampleSize: number;
}

export interface RecoveryTiming {
  type: string;
  bestDelayHours: number;
  successRate: number;
}

export interface GoldenHour {
  day: number;              // 0=Sun, 5=Fri
  hour: number;
  conversionRate: number;
}

export interface TopObjection {
  objection: string;
  bestStrategy: string;
  winRate: number;
}

export interface MerchantPlaybook {
  merchantId: number;
  strategyWeights: StrategyWeight[];
  winningPhrases: WinningPhrase[];
  recoveryTimings: RecoveryTiming[];
  goldenHours: GoldenHour[];
  topObjections: TopObjection[];
  lastDailyUpdate: Date | null;
  lastWeeklyUpdate: Date | null;
}

// ═══════════════════════════════════════════════════════════════
// In-Memory Playbook Cache
// ═══════════════════════════════════════════════════════════════

const playbookCache = new Map<number, MerchantPlaybook>();

/**
 * Get the playbook for a merchant. Returns cached version or empty default.
 */
export function getPlaybook(merchantId: number): MerchantPlaybook {
  return playbookCache.get(merchantId) || createEmptyPlaybook(merchantId);
}

function createEmptyPlaybook(merchantId: number): MerchantPlaybook {
  return {
    merchantId,
    strategyWeights: [],
    winningPhrases: [],
    recoveryTimings: [
      { type: 'silent_hesitator', bestDelayHours: 2.5, successRate: 0 },
      { type: 'cart_abandoner', bestDelayHours: 1, successRate: 0 },
      { type: 'ghost', bestDelayHours: 24, successRate: 0 },
      { type: 'post_inquiry', bestDelayHours: 48, successRate: 0 },
    ],
    goldenHours: [],
    topObjections: [],
    lastDailyUpdate: null,
    lastWeeklyUpdate: null,
  };
}

// ═══════════════════════════════════════════════════════════════
// Daily Analysis — Strategy Effectiveness
// ═══════════════════════════════════════════════════════════════

/**
 * Run daily analysis for a merchant. Updates strategy weights.
 * Called by a background cron job.
 */
export async function runDailyAnalysis(merchantId: number): Promise<void> {
  const pool = await getPool();
  if (!pool) return;

  const playbook = getPlaybook(merchantId);

  try {
    // 1. Analyze strategy success rates from sari_strategy_metrics
    const [rows] = await pool.execute(
      `SELECT strategy, 
              COUNT(*) as total_uses,
              SUM(CASE WHEN led_to_purchase = 1 THEN 1 ELSE 0 END) as successes
       FROM sari_strategy_metrics 
       WHERE merchant_id = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY strategy`,
      [merchantId]
    );

    const strategyRows = (rows as any[]) || [];
    playbook.strategyWeights = strategyRows.map((row: any) => ({
      strategy: row.strategy,
      intent: 'all', // Will be refined in weekly analysis
      successRate: row.total_uses > 0 ? row.successes / row.total_uses : 0,
      sampleSize: row.total_uses,
      lastUpdated: new Date(),
    }));

    // 2. Analyze conversion by hour (golden hours)
    const [hourRows] = await pool.execute(
      `SELECT HOUR(created_at) as hour,
              DAYOFWEEK(created_at) as day_of_week,
              COUNT(*) as total,
              SUM(CASE WHEN led_to_purchase = 1 THEN 1 ELSE 0 END) as successes
       FROM sari_strategy_metrics
       WHERE merchant_id = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY HOUR(created_at), DAYOFWEEK(created_at)
       HAVING total >= 3
       ORDER BY (successes/total) DESC
       LIMIT 10`,
      [merchantId]
    );

    playbook.goldenHours = ((hourRows as any[]) || []).map((row: any) => ({
      day: row.day_of_week - 1, // MySQL DAYOFWEEK is 1=Sun
      hour: row.hour,
      conversionRate: row.total > 0 ? row.successes / row.total : 0,
    }));

    playbook.lastDailyUpdate = new Date();
    playbookCache.set(merchantId, playbook);

    console.log(`[Conductor] Daily analysis complete for merchant ${merchantId}: ${playbook.strategyWeights.length} strategies analyzed`);
  } catch (err) {
    console.warn(`[Conductor] Daily analysis failed for merchant ${merchantId}:`, err);
  }
}

// ═══════════════════════════════════════════════════════════════
// Weekly Analysis — Deeper Patterns
// ═══════════════════════════════════════════════════════════════

/**
 * Run weekly deep analysis for a merchant.
 * Analyzes objection patterns and strategy-intent combinations.
 */
export async function runWeeklyAnalysis(merchantId: number): Promise<void> {
  const pool = await getPool();
  if (!pool) return;

  const playbook = getPlaybook(merchantId);

  try {
    // 1. Top objection patterns from learning signals
    const [objRows] = await pool.execute(
      `SELECT signal_type, signal_value,
              COUNT(*) as frequency
       FROM sari_learning_signals
       WHERE merchant_id = ?
         AND signal_type IN ('objection', 'hesitation')
         AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY signal_type, signal_value
       ORDER BY frequency DESC
       LIMIT 10`,
      [merchantId]
    );

    playbook.topObjections = ((objRows as any[]) || []).map((row: any) => ({
      objection: row.signal_value || row.signal_type,
      bestStrategy: 'value_comparison', // Will be refined as data grows
      winRate: 0,
    }));

    playbook.lastWeeklyUpdate = new Date();
    playbookCache.set(merchantId, playbook);

    console.log(`[Conductor] Weekly analysis complete for merchant ${merchantId}: ${playbook.topObjections.length} objection patterns found`);
  } catch (err) {
    console.warn(`[Conductor] Weekly analysis failed for merchant ${merchantId}:`, err);
  }
}

// ═══════════════════════════════════════════════════════════════
// Public API — Called by Strategist
// ═══════════════════════════════════════════════════════════════

/**
 * Get the best strategy for an intent based on historical data.
 * Returns null if no data available (fall back to default logic).
 */
export function getBestStrategy(merchantId: number, intent: string): string | null {
  const playbook = playbookCache.get(merchantId);
  if (!playbook || playbook.strategyWeights.length === 0) return null;

  // Find strategy with highest success rate for this intent (or 'all')
  const candidates = playbook.strategyWeights
    .filter(sw => sw.intent === intent || sw.intent === 'all')
    .filter(sw => sw.sampleSize >= 5) // Need minimum data
    .sort((a, b) => b.successRate - a.successRate);

  return candidates.length > 0 ? candidates[0].strategy : null;
}

/**
 * Check if current time is a golden hour for this merchant.
 */
export function isGoldenHour(merchantId: number): boolean {
  const playbook = playbookCache.get(merchantId);
  if (!playbook || playbook.goldenHours.length === 0) return false;

  const now = new Date();
  return playbook.goldenHours.some(gh => 
    gh.day === now.getDay() && gh.hour === now.getHours() && gh.conversionRate > 0.15
  );
}

/**
 * Get winning phrases for prompt injection.
 */
export function getWinningPhrases(merchantId: number): WinningPhrase[] {
  const playbook = playbookCache.get(merchantId);
  return playbook?.winningPhrases || [];
}

// ═══════════════════════════════════════════════════════════════
// Cron Entry Points
// ═══════════════════════════════════════════════════════════════

/**
 * Run daily analysis for all active merchants.
 * Should be called by a daily cron job.
 */
export async function runDailyForAllMerchants(): Promise<void> {
  try {
    const merchants = await getAllMerchants();
    for (const merchant of merchants) {
      try {
        await runDailyAnalysis(merchant.id);
      } catch { /* continue with other merchants */ }
    }
    console.log(`[Conductor] Daily batch complete: ${merchants.length} merchants`);
  } catch (err) {
    console.warn('[Conductor] Daily batch failed:', err);
  }
}

/**
 * Run weekly analysis for all active merchants.
 * Should be called by a weekly cron job.
 */
export async function runWeeklyForAllMerchants(): Promise<void> {
  try {
    const merchants = await getAllMerchants();
    for (const merchant of merchants) {
      try {
        await runWeeklyAnalysis(merchant.id);
      } catch { /* continue with other merchants */ }
    }
    console.log(`[Conductor] Weekly batch complete: ${merchants.length} merchants`);
  } catch (err) {
    console.warn('[Conductor] Weekly batch failed:', err);
  }
}
