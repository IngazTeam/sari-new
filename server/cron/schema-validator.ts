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
  { table: 'users', columns: ['account_status', 'email_verified_at', 'deletion_requested_at'] },
  { table: 'auth_sessions', columns: ['token_id_hash', 'expires_at', 'revoked_at'] },
  { table: 'auth_login_attempts', columns: ['email_hash', 'ip_hash', 'attempted_at'] },
  { table: 'email_verification_tokens', columns: ['token', 'request_ip_hash', 'expires_at', 'is_used'] },
  { table: 'consent_receipts', columns: ['subject_reference_hash', 'document_version', 'ip_hash', 'user_agent_hash'] },
  { table: 'data_subject_requests', columns: ['request_type', 'status', 'due_at', 'processing_scheduled_at'] },
  { table: 'legal_retention_records', columns: ['subject_reference_hash', 'encrypted_payload', 'retain_until'] },
  { table: 'merchant_members', columns: ['merchant_id', 'user_id', 'role', 'is_active'] },
  { table: 'merchant_invitations', columns: ['token', 'recipient_hash', 'accepted_by_user_id', 'status', 'expires_at'] },
  { table: 'platform_integrations', columns: ['webhook_endpoint_id', 'webhook_auth_hash'] },
  { table: 'zid_webhooks', columns: ['payload_hash', 'attempt_count', 'claimed_at'] },
  { table: 'merchants', columns: [
    'timezone', 'integration_source', 'provision_idempotency_hash', 'provision_payload_hash',
    'escalation_phones', 'emergency_phone',
  ] },
  { table: 'products' }, { table: 'conversations', columns: ['deal_stage', 'loss_reason', 'stalled_since', 'payment_link_sent_at', 'supervisor_intervened_at', 'supervisor_reason'] },
  { table: 'messages' }, { table: 'orders' }, { table: 'discount_codes' },
  { table: 'bot_settings', columns: ['auto_discount_enabled', 'auto_discount_max_percent', 'auto_discount_expire_hours', 'custom_instructions'] },
  { table: 'whatsappConnections', columns: ['apiToken'] },
  { table: 'whatsapp_connection_requests', columns: ['apiToken'] },
  { table: 'whatsapp_instances', columns: ['provider', 'webhook_token_hash', 'phone_number_id'] },
  { table: 'whatsapp_message_deliveries', columns: ['idempotency_key', 'provider_message_id', 'status'] },
  { table: 'payment_gateways' },
  { table: 'subscription_plans', columns: ['conversation_limit', 'message_limit', 'voice_message_limit'] },
  { table: 'merchant_subscriptions', columns: ['conversations_used', 'messages_used', 'voice_messages_used', 'last_reset_at'] },
  { table: 'payment_transactions', columns: ['tap_charge_id', 'metadata'] },
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
  { table: 'byaan_connections', columns: ['verified_at', 'verification_token_hash', 'webhook_secret'] },
  { table: 'byaan_webhook_receipts' }, { table: 'byaan_outbox' },
  { table: 'byaan_trainees' }, { table: 'byaan_faqs' },
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
