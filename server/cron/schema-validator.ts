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
import { WHATSAPP_PRIMARY_SCHEMA_REQUIREMENTS } from '../channels/whatsapp/schema-readiness';

// These names are the deployed Drizzle names, including legacy camelCase tables.
export const CRITICAL_SCHEMA_REQUIREMENTS: readonly SchemaRequirement[] = [
  { table: 'users', columns: ['account_status', 'email_verified_at', 'deletion_requested_at'] },
  { table: 'auth_sessions', columns: ['token_id_hash', 'expires_at', 'revoked_at'] },
  { table: 'auth_login_attempts', columns: ['email_hash', 'ip_hash', 'attempted_at'] },
  { table: 'api_rate_limit_windows', columns: ['bucket_hash', 'window_started_at', 'expires_at', 'request_count'] },
  { table: 'email_verification_tokens', columns: ['token', 'request_ip_hash', 'expires_at', 'is_used'] },
  { table: 'consent_receipts', columns: ['subject_reference_hash', 'document_version', 'ip_hash', 'user_agent_hash'] },
  { table: 'data_subject_requests', columns: ['request_type', 'status', 'due_at', 'processing_scheduled_at'] },
  { table: 'legal_retention_records', columns: ['subject_reference_hash', 'encrypted_payload', 'retain_until'] },
  { table: 'merchant_members', columns: ['merchant_id', 'user_id', 'role', 'is_active'] },
  { table: 'merchant_invitations', columns: ['token', 'recipient_hash', 'accepted_by_user_id', 'status', 'expires_at'] },
  { table: 'platform_integrations', columns: [
    'webhook_endpoint_id', 'webhook_auth_hash', 'webhook_signing_secret', 'webhook_subscription_uri',
  ] },
  { table: 'calendly_appointments', columns: ['merchant_id', 'invitee_uri', 'provider_updated_at'] },
  { table: 'calendly_webhook_receipts', columns: ['event_key', 'status', 'available_at', 'claimed_at'] },
  { table: 'woocommerce_settings', columns: ['consumer_key', 'consumer_secret', 'connection_status', 'webhook_endpoint_id', 'webhook_signing_secret'] },
  { table: 'woocommerce_products', columns: ['merchant_id', 'woo_product_id', 'provider_updated_at'] },
  { table: 'woocommerce_orders', columns: ['merchant_id', 'woo_order_id', 'provider_updated_at'] },
  { table: 'woocommerce_sync_logs', columns: ['merchant_id', 'sync_type', 'status'] },
  { table: 'woocommerce_webhook_registrations', columns: ['merchant_id', 'topic', 'webhook_id'] },
  { table: 'woocommerce_webhook_receipts', columns: ['merchant_id', 'delivery_id', 'status', 'available_at'] },
  { table: 'zid_webhooks', columns: ['payload_hash', 'attempt_count', 'claimed_at'] },
  { table: 'zid_order_notification_outbox', columns: ['event_key', 'status', 'available_at', 'claimed_at'] },
  { table: 'zid_oauth_states', columns: ['state_hash', 'session_hash', 'expires_at', 'consumed_at'] },
  { table: 'merchants', columns: [
    'timezone', 'integration_source', 'provision_idempotency_hash', 'provision_payload_hash',
    'escalation_phones', 'emergency_phone',
  ] },
  { table: 'products' }, { table: 'conversations', columns: ['deal_stage', 'loss_reason', 'stalled_since', 'payment_link_sent_at', 'supervisor_intervened_at', 'supervisor_reason'] },
  { table: 'messages' }, { table: 'orders', columns: ['payment_status'] }, { table: 'discount_codes' },
  { table: 'bot_settings', columns: ['auto_discount_enabled', 'auto_discount_max_percent', 'auto_discount_expire_hours', 'custom_instructions'] },
  { table: 'whatsappConnections', columns: ['apiToken'] },
  { table: 'whatsapp_connection_requests', columns: ['apiToken'] },
  ...WHATSAPP_PRIMARY_SCHEMA_REQUIREMENTS,
  { table: 'whatsapp_message_deliveries', columns: ['idempotency_key', 'provider_message_id', 'status'] },
  {
    table: 'order_notifications',
    columns: ['event_key', 'delivery_status', 'attempts', 'available_at', 'claimed_at', 'reviewed_at', 'reviewed_by_user_id'],
    uniqueIndexes: [{ name: 'uq_order_notification_event', columns: ['merchant_id', 'event_key'] }],
  },
  {
    table: 'notification_templates',
    columns: ['merchant_id', 'status', 'template', 'enabled'],
    uniqueIndexes: [{ name: 'uq_notification_template_merchant_status', columns: ['merchant_id', 'status'] }],
  },
  { table: 'subscription_plans', columns: ['conversation_limit', 'message_limit', 'voice_message_limit'] },
  { table: 'merchant_subscriptions', columns: ['conversations_used', 'messages_used', 'voice_messages_used', 'last_reset_at'] },
  { table: 'payment_transactions', columns: ['tap_charge_id', 'metadata'] },
  { table: 'order_payments', columns: ['last_webhook_status', 'last_webhook_at'] },
  { table: 'sales_followups', columns: ['processing_token'] },
  { table: 'sari_api_keys' }, { table: 'sari_platform_keys' },
  { table: 'campaign_optouts' },
  { table: 'campaign_consent_receipts', columns: ['merchant_id', 'customer_phone', 'decision', 'provider_event_digest', 'decided_at'] },
  { table: 'campaign_consent_state', columns: ['merchant_id', 'customer_phone', 'status', 'last_decided_at', 'last_receipt_id'] },
  { table: 'campaign_delivery_outbox', columns: ['campaign_id', 'merchant_id', 'customer_phone', 'status', 'processing_token', 'quota_subscription_id', 'quota_reserved', 'available_at', 'claimed_at'] },
  { table: 'campaign_dispatch_rate_limits', columns: ['merchant_id', 'window_started_at', 'reserved_count'] },
  { table: 'occasion_campaigns', columns: ['campaign_id', 'merchantId', 'occasionType', 'year', 'enabled', 'status'] },
  { table: 'merchant_onboarding_answers' },
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
