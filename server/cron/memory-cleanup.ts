/**
 * Memory Cleanup Cron — NQ-2 Fix
 * 
 * Prevents unbounded memory growth from in-memory Maps/Records
 * used for rate limiting, session caching, and status tracking.
 * 
 * Design: Central registry — each module registers its own cleanup function.
 * This avoids importing internal Maps across modules (preserves encapsulation).
 * 
 * Runs every 30 minutes via cron.
 */

type CleanupFn = () => number; // returns count of evicted entries

const registry: { name: string; fn: CleanupFn }[] = [];

/**
 * Register a cleanup function. Called once per module at import time.
 * @param name - Human-readable module name (for logging)
 * @param fn - Function that evicts stale entries and returns evicted count
 */
export function registerMemoryCleanup(name: string, fn: CleanupFn): void {
  registry.push({ name, fn });
}

/**
 * Run all registered cleanup functions.
 * Called by cron every 30 minutes.
 */
export async function runMemoryCleanup(): Promise<{ totalEvicted: number; modules: number }> {
  let totalEvicted = 0;
  const results: string[] = [];

  for (const { name, fn } of registry) {
    try {
      const evicted = fn();
      totalEvicted += evicted;
      if (evicted > 0) {
        results.push(`${name}: ${evicted}`);
      }
    } catch (e) {
      console.warn(`[MemCleanup] Error in ${name}:`, (e as Error).message);
    }
  }

  if (totalEvicted > 0) {
    console.log(`[MemCleanup] Evicted ${totalEvicted} stale entries [${results.join(', ')}]`);
  }

  return { totalEvicted, modules: registry.length };
}
