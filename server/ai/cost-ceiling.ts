/**
 * OpenAI Cost Ceiling — NQ-6 Fix
 * 
 * In-memory daily token usage tracker per merchant.
 * Prevents a single merchant from consuming unlimited OpenAI tokens.
 * 
 * Design:
 * - Tracks tokens per merchant per day (in-memory, no DB overhead)
 * - Each plan tier has a daily token limit
 * - When exceeded: forces lightweight mode (gpt-4o-mini, short responses)
 * - Does NOT block AI completely — degrades gracefully
 * - Resets at midnight (UTC) via cron + auto-reset on date change
 * 
 * Usage in sari-personality.ts:
 *   const ceiling = getMerchantCeiling(merchantId);
 *   if (ceiling.exceeded) { use lightweight model }
 *   // after response: trackMerchantTokens(merchantId, totalTokens)
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface MerchantUsage {
  tokens: number;
  date: string; // YYYY-MM-DD — auto-resets on date change
}

export interface CeilingResult {
  exceeded: boolean;
  used: number;
  limit: number;
  percentUsed: number;
}

// ═══════════════════════════════════════════════════════════════
// Constants — Daily token limits per plan tier
// ═══════════════════════════════════════════════════════════════

// These are DAILY limits (tokens, not cost)
// gpt-4o ≈ $2.50/1M input + $10/1M output → 200K tokens ≈ $1.50/day
const PLAN_DAILY_LIMITS: Record<string, number> = {
  free:       50_000,   // ~$0.35/day — very limited
  starter:   150_000,   // ~$1.00/day
  pro:       400_000,   // ~$2.50/day
  business:  800_000,   // ~$5.00/day
  unlimited: 2_000_000, // ~$12/day — still has a ceiling
};

const DEFAULT_DAILY_LIMIT = 200_000; // ~$1.25/day

// ═══════════════════════════════════════════════════════════════
// In-Memory Tracker
// ═══════════════════════════════════════════════════════════════

const merchantUsage = new Map<number, MerchantUsage>();

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function getOrCreateUsage(merchantId: number): MerchantUsage {
  const existing = merchantUsage.get(merchantId);
  const todayStr = today();
  
  // Auto-reset on date change (no cron dependency)
  if (!existing || existing.date !== todayStr) {
    const fresh: MerchantUsage = { tokens: 0, date: todayStr };
    merchantUsage.set(merchantId, fresh);
    return fresh;
  }
  
  return existing;
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a merchant has exceeded their daily token ceiling.
 * Call BEFORE making an OpenAI request.
 * 
 * @param merchantId - Merchant ID
 * @param planSlug - Plan name (starter, pro, business, etc.)
 * @returns CeilingResult with exceeded flag and usage stats
 */
export function getMerchantCeiling(merchantId: number, planSlug?: string): CeilingResult {
  const usage = getOrCreateUsage(merchantId);
  const limit = PLAN_DAILY_LIMITS[planSlug || 'starter'] || DEFAULT_DAILY_LIMIT;
  const percentUsed = Math.round((usage.tokens / limit) * 100);
  
  return {
    exceeded: usage.tokens >= limit,
    used: usage.tokens,
    limit,
    percentUsed: Math.min(percentUsed, 100),
  };
}

/**
 * Track token usage after a successful OpenAI call.
 * Call AFTER receiving a response with usage data.
 * 
 * @param merchantId - Merchant ID
 * @param totalTokens - Total tokens used (prompt + completion)
 */
export function trackMerchantTokens(merchantId: number, totalTokens: number): void {
  if (!merchantId || totalTokens <= 0) return;
  const usage = getOrCreateUsage(merchantId);
  usage.tokens += totalTokens;
}

/**
 * Get all merchant usage stats (for admin dashboard/reporting).
 */
export function getAllMerchantUsage(): Array<{ merchantId: number; tokens: number; date: string }> {
  const todayStr = today();
  const result: Array<{ merchantId: number; tokens: number; date: string }> = [];
  for (const [merchantId, usage] of Array.from(merchantUsage.entries())) {
    if (usage.date === todayStr && usage.tokens > 0) {
      result.push({ merchantId, tokens: usage.tokens, date: usage.date });
    }
  }
  return result.sort((a, b) => b.tokens - a.tokens);
}

/**
 * Reset all daily counters (called at midnight by cron).
 */
export function resetDailyCounters(): number {
  const size = merchantUsage.size;
  merchantUsage.clear();
  return size;
}

// NQ-2: Register memory cleanup
import('../cron/memory-cleanup').then(({ registerMemoryCleanup }) => {
  registerMemoryCleanup('openai-cost', () => {
    const todayStr = today();
    let evicted = 0;
    for (const [key, usage] of Array.from(merchantUsage.entries())) {
      if (usage.date !== todayStr) { merchantUsage.delete(key); evicted++; }
    }
    return evicted;
  });
}).catch(() => {});
