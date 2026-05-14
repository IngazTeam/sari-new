-- ============================================
-- Migration 001: Fix Orphan Foreign Keys (v2 — SEC-V7-01 + SEC-V7-07 FIX)
-- 
-- IMPORTANT: Column names in legacy tables use camelCase (merchantId)
-- while dynamic tables use snake_case (merchant_id).
-- This migration uses the CORRECT column name for each table.
--
-- Run BEFORE drizzle-kit push to prevent FK constraint errors.
-- ============================================

-- ─────────────────────────────────────────────
-- Step 1: Clean orphan data — LEGACY tables (column = merchantId)
-- SEC-V7-07 FIX: Use LEFT JOIN for performance instead of NOT IN subquery
-- ─────────────────────────────────────────────

-- Clean children of conversations first (messages depend on conversations)
DELETE m FROM messages m
  LEFT JOIN conversations c ON m.conversationId = c.id
  WHERE c.id IS NULL;

-- Clean children of orders first
DELETE otn FROM order_notifications otn
  LEFT JOIN orders o ON otn.order_id = o.id
  WHERE o.id IS NULL;

-- Now clean the 22 orphan tables (merchantId column = camelCase)
DELETE t FROM abandoned_carts t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM analytics t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM automation_rules t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM campaigns t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM conversations t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM customer_reviews t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM discount_codes t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM occasion_campaigns t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM orders t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM payments t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM products t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM referral_codes t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM rewards t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM salla_connections t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM subscriptions t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM supportTickets t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM sync_logs t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM testConversations t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM testDeals t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM testMetricsDaily t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM whatsappConnections t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;
DELETE t FROM whatsapp_connection_requests t LEFT JOIN merchants m ON t.merchantId = m.id WHERE m.id IS NULL;

-- ─────────────────────────────────────────────
-- Step 2: Clean orphan data — DYNAMIC tables (column = merchant_id)
-- ─────────────────────────────────────────────

DELETE t FROM sari_strategy_metrics t LEFT JOIN merchants m ON t.merchant_id = m.id WHERE m.id IS NULL;
DELETE t FROM sari_quality_metrics t LEFT JOIN merchants m ON t.merchant_id = m.id WHERE m.id IS NULL;
DELETE t FROM sari_weekly_reports t LEFT JOIN merchants m ON t.merchant_id = m.id WHERE m.id IS NULL;
DELETE t FROM customer_profiles t LEFT JOIN merchants m ON t.merchant_id = m.id WHERE m.id IS NULL;
DELETE t FROM knowledge_sections t LEFT JOIN merchants m ON t.merchant_id = m.id WHERE m.id IS NULL;
DELETE t FROM knowledge_changelog t LEFT JOIN merchants m ON t.merchant_id = m.id WHERE m.id IS NULL;
DELETE t FROM sari_response_cache t LEFT JOIN merchants m ON t.merchant_id = m.id WHERE m.id IS NULL;
DELETE t FROM sales_quotations t LEFT JOIN merchants m ON t.merchant_id = m.id WHERE m.id IS NULL;
DELETE t FROM sales_targets t LEFT JOIN merchants m ON t.merchant_id = m.id WHERE m.id IS NULL;
DELETE t FROM quotation_templates t LEFT JOIN merchants m ON t.merchant_id = m.id WHERE m.id IS NULL;

-- ─────────────────────────────────────────────
-- Step 3: After this script, run drizzle-kit push
-- FK constraints will be created automatically from schema.ts
-- ─────────────────────────────────────────────
