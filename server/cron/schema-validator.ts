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

import { inspectSchemaRequirements, type SchemaRequirement } from '../db/schema-readiness';

// These names are the deployed Drizzle names, including legacy camelCase tables.
export const CRITICAL_SCHEMA_REQUIREMENTS: readonly SchemaRequirement[] = [
  { table: 'users' }, { table: 'merchants', columns: ['timezone', 'integration_source', 'escalation_phones', 'emergency_phone'] },
  { table: 'products' }, { table: 'conversations', columns: ['deal_stage', 'loss_reason', 'stalled_since', 'payment_link_sent_at', 'supervisor_intervened_at', 'supervisor_reason'] },
  { table: 'messages' }, { table: 'orders' }, { table: 'discount_codes' },
  { table: 'bot_settings', columns: ['auto_discount_enabled', 'auto_discount_max_percent', 'auto_discount_expire_hours', 'custom_instructions'] },
  { table: 'whatsappConnections', columns: ['apiToken'] },
  { table: 'whatsapp_connection_requests', columns: ['apiToken'] },
  { table: 'whatsapp_instances' }, { table: 'payment_gateways' },
  { table: 'sales_followups', columns: ['processing_token'] },
  { table: 'sari_api_keys' }, { table: 'sari_platform_keys' },
  { table: 'campaign_optouts' }, { table: 'merchant_onboarding_answers' },
  { table: 'session_contexts' }, { table: 'sari_coaching_sessions' }, { table: 'sari_coaching_questions' },
  { table: 'sari_learning_signals' }, { table: 'sari_behavioral_dna' }, { table: 'sari_escalation_queue' },
  { table: 'knowledge_sections' }, { table: 'knowledge_changelog' }, { table: 'sari_response_cache' },
  { table: 'sales_quotations' }, { table: 'sales_targets' }, { table: 'quotation_templates' },
  { table: 'sari_ai_directives' }, { table: 'sari_strategy_metrics' },
  { table: 'sari_quality_metrics' }, { table: 'sari_weekly_reports' },
  { table: 'media_library' }, { table: 'sari_activity_log' }, { table: 'supervisor_interventions' },
  { table: 'byaan_connections' }, { table: 'byaan_trainees' }, { table: 'byaan_faqs' },
  { table: 'byaan_site_content' }, { table: 'sari_conversions' },
  { table: 'message_delivery_log' }, { table: 'sari_personality_settings' },
] as const;

const IMPORTANT_SCHEMA_REQUIREMENTS: readonly SchemaRequirement[] = [
  { table: 'merchant_knowledge_docs' }, { table: 'virtual_agents' },
  { table: 'customer_profiles' }, { table: 'salla_connections' },
] as const;

/**
 * Validate that critical database tables exist.
 * Call after DB connection is established.
 * 
 * @returns Object with validation results
 */
export async function validateDatabaseSchema(options: { log?: boolean } = {}): Promise<{
  allCritical: boolean;
  missing: string[];
  warnings: string[];
}> {
  const missing: string[] = [];
  const warnings: string[] = [];

  try {
    missing.push(...await inspectSchemaRequirements(CRITICAL_SCHEMA_REQUIREMENTS));
    warnings.push(...await inspectSchemaRequirements(IMPORTANT_SCHEMA_REQUIREMENTS));

    // Log results
    if (options.log !== false && missing.length > 0) {
      console.error(`[SchemaValidator] ❌ CRITICAL tables missing: ${missing.join(', ')}`);
      console.error('[SchemaValidator] Run: npm run db:push to sync schema');
    }

    if (options.log !== false && warnings.length > 0) {
      console.warn(`[SchemaValidator] ⚠️ Optional tables missing: ${warnings.join(', ')}`);
    }

    if (options.log !== false && missing.length === 0 && warnings.length === 0) {
      console.log('[SchemaValidator] ✅ All tables verified');
    } else if (options.log !== false && missing.length === 0) {
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
