-- ============================================
-- Migration 001: Fix Orphan Foreign Keys
-- Run BEFORE drizzle-kit push to prevent FK constraint errors
-- ============================================

-- Step 1: Clean orphan data (merchantId referencing deleted merchants)
-- Order matters: delete children before adding constraints

DELETE FROM abandoned_carts WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM analytics WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM automation_rules WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM campaigns WHERE merchantId NOT IN (SELECT id FROM merchants);
-- Note: conversations has child tables (messages, sentiment_analysis) — clean children first
DELETE FROM messages WHERE conversationId IN (SELECT id FROM conversations WHERE merchantId NOT IN (SELECT id FROM merchants));
DELETE FROM conversations WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM customer_reviews WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM discount_codes WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM occasion_campaigns WHERE merchantId NOT IN (SELECT id FROM merchants);
-- Note: orders has child tables (order_notifications) — clean children first
DELETE FROM order_notifications WHERE merchant_id IN (SELECT merchant_id FROM order_notifications WHERE merchant_id NOT IN (SELECT id FROM merchants));
DELETE FROM orders WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM payments WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM products WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM referral_codes WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM rewards WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM salla_connections WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM subscriptions WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM supportTickets WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM sync_logs WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM testConversations WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM testDeals WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM testMetricsDaily WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM whatsappConnections WHERE merchantId NOT IN (SELECT id FROM merchants);
DELETE FROM whatsapp_connection_requests WHERE merchantId NOT IN (SELECT id FROM merchants);

-- Step 2: Clean dynamic tables
DELETE FROM sari_strategy_metrics WHERE merchant_id NOT IN (SELECT id FROM merchants);
DELETE FROM sari_quality_metrics WHERE merchant_id NOT IN (SELECT id FROM merchants);
DELETE FROM sari_weekly_reports WHERE merchant_id NOT IN (SELECT id FROM merchants);
DELETE FROM customer_profiles WHERE merchant_id NOT IN (SELECT id FROM merchants);
DELETE FROM knowledge_sections WHERE merchant_id NOT IN (SELECT id FROM merchants);
DELETE FROM knowledge_changelog WHERE merchant_id NOT IN (SELECT id FROM merchants);
DELETE FROM sari_response_cache WHERE merchant_id NOT IN (SELECT id FROM merchants);
DELETE FROM sales_quotations WHERE merchant_id NOT IN (SELECT id FROM merchants);
DELETE FROM sales_targets WHERE merchant_id NOT IN (SELECT id FROM merchants);
DELETE FROM quotation_templates WHERE merchant_id NOT IN (SELECT id FROM merchants);

-- Step 3: Add FK constraints (run via drizzle-kit push after this script)
-- drizzle-kit will generate ALTER TABLE statements from schema.ts changes
