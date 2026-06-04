/**
 * Database Schema Validator — NQ-4 Fix
 * 
 * Runs at startup to verify critical tables exist in the database.
 * Does NOT block startup — just logs warnings for ops visibility.
 * 
 * Design:
 * - Checks for tables that are critical to the AI pipeline
 * - Logs WARN for missing tables (not ERROR — system can degrade gracefully)
 * - Called once from server startup after DB connection is established
 */

// Critical tables that MUST exist for core functionality
const CRITICAL_TABLES = [
  // Core business
  'users', 'merchants', 'products', 'conversations', 'messages',
  // AI pipeline
  'ai_settings', 'ai_usage_logs',
  // WhatsApp
  'whatsapp_connections',
  // Webhooks
  'webhook_events',
  // Commerce
  'orders', 'discount_codes',
] as const;

// Important but non-critical tables
const IMPORTANT_TABLES = [
  'bot_sections', 'personality_settings', 'merchant_knowledge_docs',
  'virtual_agents', 'customer_profiles',
  'salla_connections', 'zid_connections',
  'byaan_connections',
  'loyalty_programs', 'loyalty_customer_points',
] as const;

/**
 * Validate that critical database tables exist.
 * Call after DB connection is established.
 * 
 * @returns Object with validation results
 */
export async function validateDatabaseSchema(): Promise<{
  allCritical: boolean;
  missing: string[];
  warnings: string[];
}> {
  const missing: string[] = [];
  const warnings: string[] = [];

  try {
    const { getPool } = await import('../db');
    const pool = await getPool();
    if (!pool) {
      console.error('[SchemaValidator] ❌ Cannot validate — no DB connection');
      return { allCritical: false, missing: ['(no connection)'], warnings: [] };
    }

    // Check critical tables
    for (const table of CRITICAL_TABLES) {
      try {
        await pool.execute(`SELECT 1 FROM \`${table}\` LIMIT 0`);
      } catch {
        missing.push(table);
      }
    }

    // Check important (non-critical) tables
    for (const table of IMPORTANT_TABLES) {
      try {
        await pool.execute(`SELECT 1 FROM \`${table}\` LIMIT 0`);
      } catch {
        warnings.push(table);
      }
    }

    // Log results
    if (missing.length > 0) {
      console.error(`[SchemaValidator] ❌ CRITICAL tables missing: ${missing.join(', ')}`);
      console.error('[SchemaValidator] Run: npm run db:push to sync schema');
    }

    if (warnings.length > 0) {
      console.warn(`[SchemaValidator] ⚠️ Optional tables missing: ${warnings.join(', ')}`);
    }

    if (missing.length === 0 && warnings.length === 0) {
      console.log('[SchemaValidator] ✅ All tables verified');
    } else if (missing.length === 0) {
      console.log(`[SchemaValidator] ✅ All critical tables OK (${warnings.length} optional missing)`);
    }

    return {
      allCritical: missing.length === 0,
      missing,
      warnings,
    };
  } catch (error) {
    console.error('[SchemaValidator] Error during validation:', error);
    return { allCritical: false, missing: ['(validation error)'], warnings: [] };
  }
}
