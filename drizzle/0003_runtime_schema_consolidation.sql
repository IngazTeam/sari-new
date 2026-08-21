CREATE TABLE IF NOT EXISTS `byaan_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`tenant_domain` varchar(255) NOT NULL,
	`api_base_url` varchar(500),
	`webhook_secret` varchar(128),
	`api_key_hash` varchar(64),
	`sync_status` enum('active','syncing','error','paused') DEFAULT 'active',
	`last_sync_at` timestamp,
	`sync_errors` text,
	`permissions` text,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `byaan_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_byaan_merchant` UNIQUE(`merchant_id`),
	INDEX `idx_byaan_domain` (`tenant_domain`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `byaan_faqs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`external_id` varchar(100),
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`category` varchar(100) DEFAULT 'عام',
	`is_active` tinyint NOT NULL DEFAULT 1,
	`use_in_bot` tinyint NOT NULL DEFAULT 1,
	`synced_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `byaan_faqs_id` PRIMARY KEY(`id`),
	INDEX `idx_byaan_faq_merchant` (`merchant_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `byaan_site_content` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`page_type` enum('about','vision','mission','policies','custom') NOT NULL,
	`title` varchar(500),
	`content` text NOT NULL,
	`synced_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `byaan_site_content_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_byaan_content` UNIQUE(`merchant_id`,`page_type`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `byaan_trainees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`external_id` varchar(100) NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(20),
	`email` varchar(320),
	`enrolled_courses` text,
	`status` enum('active','archived') DEFAULT 'active',
	`synced_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `byaan_trainees_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_byaan_trainee` UNIQUE(`merchant_id`,`external_id`),
	INDEX `idx_byaan_trainee_phone` (`merchant_id`,`phone`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `campaign_optouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`customer_phone` varchar(20) NOT NULL,
	`opted_out_at` timestamp NOT NULL DEFAULT (now()),
	`reason` varchar(100) DEFAULT 'customer_request',
	CONSTRAINT `campaign_optouts_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_campaign_optout_merchant_phone` UNIQUE(`merchant_id`,`customer_phone`),
	INDEX `idx_campaign_optout_merchant` (`merchant_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `media_library` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`file_name` varchar(500) NOT NULL,
	`original_name` varchar(500) NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`file_size` int NOT NULL DEFAULT 0,
	`url` text NOT NULL,
	`category` enum('product','promotion','template','general') NOT NULL DEFAULT 'general',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `media_library_id` PRIMARY KEY(`id`),
	INDEX `idx_media_merchant` (`merchant_id`),
	INDEX `idx_media_category` (`merchant_id`,`category`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `merchant_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('manager','sales_supervisor','viewer') NOT NULL DEFAULT 'viewer',
	`token` varchar(64) NOT NULL,
	`invited_by` int NOT NULL,
	`expires_at` timestamp NOT NULL,
	`accepted_at` timestamp,
	`status` enum('pending','accepted','expired','revoked') NOT NULL DEFAULT 'pending',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `merchant_invitations_id` PRIMARY KEY(`id`),
	INDEX `idx_invitation_merchant` (`merchant_id`),
	INDEX `idx_invitation_token` (`token`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `merchant_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`user_id` int NOT NULL,
	`role` enum('owner','manager','sales_supervisor','viewer') NOT NULL DEFAULT 'viewer',
	`invited_by` int,
	`invited_at` timestamp NOT NULL DEFAULT (now()),
	`accepted_at` timestamp,
	`is_active` tinyint NOT NULL DEFAULT 1,
	CONSTRAINT `merchant_members_id` PRIMARY KEY(`id`),
	INDEX `idx_member_merchant` (`merchant_id`),
	INDEX `idx_member_user` (`user_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `merchant_onboarding_answers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`field_key` varchar(50) NOT NULL,
	`question_text` text NOT NULL,
	`answer_text` text NOT NULL,
	`phase` int NOT NULL DEFAULT 1,
	`answered_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `merchant_onboarding_answers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_onboarding_answer_merchant_field` UNIQUE(`merchant_id`,`field_key`),
	INDEX `idx_onboarding_answer_merchant` (`merchant_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sales_followups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`conversation_id` int NOT NULL,
	`customer_phone` varchar(50) NOT NULL,
	`follow_up_type` varchar(30) NOT NULL,
	`scheduled_at` timestamp NOT NULL,
	`sent_at` timestamp,
	`cancelled_at` timestamp,
	`cancel_reason` varchar(50),
	`message_text` text NOT NULL,
	`customer_name` varchar(255),
	`source` varchar(30) NOT NULL DEFAULT 'proactive',
	`processing_token` varchar(60),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_followups_id` PRIMARY KEY(`id`),
	INDEX `idx_followup_merchant_phone` (`merchant_id`,`customer_phone`),
	INDEX `idx_followup_scheduled` (`scheduled_at`),
	INDEX `idx_followup_pending` (`merchant_id`,`sent_at`,`cancelled_at`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sari_activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`action_type` varchar(100) NOT NULL,
	`description` text NOT NULL,
	`details` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sari_activity_log_id` PRIMARY KEY(`id`),
	INDEX `idx_sari_activity_merchant_date` (`merchant_id`,`created_at`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sari_api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`key_hash` varchar(64) NOT NULL,
	`key_prefix` varchar(12) NOT NULL,
	`label` varchar(100) DEFAULT 'Default Key',
	`permissions` text,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`last_used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp,
	CONSTRAINT `sari_api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `sari_api_keys_key_hash_unique` UNIQUE(`key_hash`),
	INDEX `idx_sari_api_key_hash` (`key_hash`),
	INDEX `idx_sari_api_key_merchant` (`merchant_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sari_behavioral_dna` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`generation` int DEFAULT 1,
	`dimension` varchar(30) NOT NULL,
	`insight` text NOT NULL,
	`evidence_count` int DEFAULT 1,
	`confidence` decimal(3,2) DEFAULT '0.50',
	`is_active` tinyint NOT NULL DEFAULT 1,
	`auto_applied` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sari_behavioral_dna_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_behavioral_dna_merchant_dimension` UNIQUE(`merchant_id`,`dimension`),
	INDEX `idx_behavioral_dna_active` (`merchant_id`,`is_active`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sari_coaching_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int NOT NULL,
	`merchant_id` int NOT NULL,
	`conversation_id` int,
	`customer_question` text NOT NULL,
	`bot_response` text NOT NULL,
	`merchant_verdict` varchar(20),
	`merchant_correction` text,
	`question_order` int DEFAULT 0,
	`reviewed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sari_coaching_questions_id` PRIMARY KEY(`id`),
	INDEX `idx_coaching_question_session_order` (`session_id`,`question_order`),
	INDEX `idx_coaching_question_merchant` (`merchant_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sari_coaching_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`status` varchar(20) DEFAULT 'pending',
	`total_questions` int DEFAULT 0,
	`correct_count` int DEFAULT 0,
	`corrected_count` int DEFAULT 0,
	`skipped_count` int DEFAULT 0,
	`current_question_index` int DEFAULT 0,
	`started_at` timestamp,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sari_coaching_sessions_id` PRIMARY KEY(`id`),
	INDEX `idx_coaching_session_merchant_status` (`merchant_id`,`status`),
	INDEX `idx_coaching_session_merchant_date` (`merchant_id`,`created_at`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sari_conversions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`customer_phone` varchar(20),
	`customer_name` varchar(255),
	`action_type` enum('enrollment','payment','inquiry') NOT NULL,
	`product_name` varchar(255),
	`amount` decimal(10,2),
	`external_ref` varchar(100),
	`source` varchar(50) DEFAULT 'whatsapp',
	`status` enum('pending','completed','cancelled') DEFAULT 'completed',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sari_conversions_id` PRIMARY KEY(`id`),
	INDEX `idx_sari_conversion_merchant_date` (`merchant_id`,`created_at`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sari_escalation_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`conversation_id` int NOT NULL,
	`customer_phone` varchar(30) NOT NULL,
	`customer_name` varchar(100),
	`question` text NOT NULL,
	`bot_response` text,
	`status` varchar(20) DEFAULT 'pending',
	`merchant_answer` text,
	`priority` varchar(10) DEFAULT 'standard',
	`merchant_notified_at` timestamp,
	`merchant_answered_at` timestamp,
	`followed_up` tinyint NOT NULL DEFAULT 0,
	`expires_at` timestamp,
	`current_escalation_level` int DEFAULT 0,
	`last_escalated_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sari_escalation_queue_id` PRIMARY KEY(`id`),
	INDEX `idx_escalation_merchant_status` (`merchant_id`,`status`),
	INDEX `idx_escalation_merchant_date` (`merchant_id`,`created_at`),
	INDEX `idx_escalation_customer` (`merchant_id`,`customer_phone`,`status`),
	INDEX `idx_escalation_cascade` (`status`,`last_escalated_at`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sari_learning_signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`conversation_id` int NOT NULL,
	`signal_type` varchar(30) NOT NULL,
	`signal_weight` decimal(3,2) DEFAULT '1.00',
	`bot_message` text,
	`customer_message` text,
	`merchant_correction` text,
	`context_summary` text,
	`analyzed` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sari_learning_signals_id` PRIMARY KEY(`id`),
	INDEX `idx_learning_signal_merchant_type` (`merchant_id`,`signal_type`),
	INDEX `idx_learning_signal_merchant_date` (`merchant_id`,`created_at`),
	INDEX `idx_learning_signal_unanalyzed` (`merchant_id`,`analyzed`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sari_platform_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`platform` varchar(50) NOT NULL,
	`key_value` varchar(255) NOT NULL,
	`label` varchar(100) DEFAULT '',
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sari_platform_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `sari_platform_keys_platform_unique` UNIQUE(`platform`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `session_contexts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`conversation_id` int NOT NULL,
	`session_key` varchar(50) NOT NULL,
	`context_json` text NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `session_contexts_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_contexts_session_key_unique` UNIQUE(`session_key`),
	INDEX `idx_session_context_merchant` (`merchant_id`),
	INDEX `idx_session_context_expires` (`expires_at`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `supervisor_interventions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`conversation_id` int NOT NULL,
	`reason` varchar(50) NOT NULL,
	`recovery_message` text,
	`customer_responded` tinyint NOT NULL DEFAULT 0,
	`led_to_conversion` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supervisor_interventions_id` PRIMARY KEY(`id`),
	INDEX `idx_supervisor_merchant` (`merchant_id`),
	INDEX `idx_supervisor_created` (`created_at`)
);
--> statement-breakpoint
ALTER TABLE `abandoned_carts` MODIFY COLUMN `customerPhone` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `appointments` MODIFY COLUMN `customer_phone` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `booking_reviews` MODIFY COLUMN `customer_phone` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` MODIFY COLUMN `customer_phone` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `campaignLogs` MODIFY COLUMN `customerPhone` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` MODIFY COLUMN `customerPhone` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_profiles` MODIFY COLUMN `customer_phone` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_reviews` MODIFY COLUMN `customerPhone` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `loyalty_points` MODIFY COLUMN `customer_phone` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `loyalty_redemptions` MODIFY COLUMN `customer_phone` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `loyalty_transactions` MODIFY COLUMN `customer_phone` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `merchant_knowledge_docs` MODIFY COLUMN `file_type` enum('pdf','docx','xlsx','text') NOT NULL;--> statement-breakpoint
ALTER TABLE `order_notifications` MODIFY COLUMN `customer_phone` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `order_payments` MODIFY COLUMN `customer_phone` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `customerPhone` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_quotations` MODIFY COLUMN `customer_phone` varchar(50);--> statement-breakpoint
ALTER TABLE `service_reviews` MODIFY COLUMN `customer_phone` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsapp_connection_requests` MODIFY COLUMN `apiToken` text;--> statement-breakpoint
ALTER TABLE `whatsappConnections` MODIFY COLUMN `apiToken` text;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bot_settings' AND COLUMN_NAME = 'auto_discount_enabled') = 0, 'ALTER TABLE `bot_settings` ADD COLUMN `auto_discount_enabled` TINYINT NOT NULL DEFAULT 0', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bot_settings' AND COLUMN_NAME = 'auto_discount_max_percent') = 0, 'ALTER TABLE `bot_settings` ADD COLUMN `auto_discount_max_percent` INT DEFAULT 15', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bot_settings' AND COLUMN_NAME = 'auto_discount_expire_hours') = 0, 'ALTER TABLE `bot_settings` ADD COLUMN `auto_discount_expire_hours` INT DEFAULT 48', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bot_settings' AND COLUMN_NAME = 'custom_instructions') = 0, 'ALTER TABLE `bot_settings` ADD COLUMN `custom_instructions` TEXT NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversations' AND COLUMN_NAME = 'lastMessage') = 0, 'ALTER TABLE `conversations` ADD COLUMN `lastMessage` TEXT NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversations' AND COLUMN_NAME = 'deal_stage') = 0, 'ALTER TABLE `conversations` ADD COLUMN `deal_stage` VARCHAR(30) DEFAULT ''new''', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversations' AND COLUMN_NAME = 'loss_reason') = 0, 'ALTER TABLE `conversations` ADD COLUMN `loss_reason` VARCHAR(30) NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversations' AND COLUMN_NAME = 'stalled_since') = 0, 'ALTER TABLE `conversations` ADD COLUMN `stalled_since` TIMESTAMP NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversations' AND COLUMN_NAME = 'payment_link_sent_at') = 0, 'ALTER TABLE `conversations` ADD COLUMN `payment_link_sent_at` TIMESTAMP NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversations' AND COLUMN_NAME = 'supervisor_intervened_at') = 0, 'ALTER TABLE `conversations` ADD COLUMN `supervisor_intervened_at` TIMESTAMP NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversations' AND COLUMN_NAME = 'supervisor_reason') = 0, 'ALTER TABLE `conversations` ADD COLUMN `supervisor_reason` VARCHAR(50) NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'discount_codes' AND COLUMN_NAME = 'is_auto_generated') = 0, 'ALTER TABLE `discount_codes` ADD COLUMN `is_auto_generated` TINYINT NOT NULL DEFAULT 0', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'discount_codes' AND COLUMN_NAME = 'customer_phone') = 0, 'ALTER TABLE `discount_codes` ADD COLUMN `customer_phone` VARCHAR(50) NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchants' AND COLUMN_NAME = 'timezone') = 0, 'ALTER TABLE `merchants` ADD COLUMN `timezone` VARCHAR(50) NOT NULL DEFAULT ''Asia/Riyadh''', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchants' AND COLUMN_NAME = 'integration_source') = 0, 'ALTER TABLE `merchants` ADD COLUMN `integration_source` VARCHAR(20) DEFAULT ''none''', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchants' AND COLUMN_NAME = 'logo_url') = 0, 'ALTER TABLE `merchants` ADD COLUMN `logo_url` VARCHAR(500) NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'course_start_date') = 0, 'ALTER TABLE `products` ADD COLUMN `course_start_date` TIMESTAMP NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'course_end_date') = 0, 'ALTER TABLE `products` ADD COLUMN `course_end_date` TIMESTAMP NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'max_students') = 0, 'ALTER TABLE `products` ADD COLUMN `max_students` INT NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'enrolled_count') = 0, 'ALTER TABLE `products` ADD COLUMN `enrolled_count` INT DEFAULT 0', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'registration_open') = 0, 'ALTER TABLE `products` ADD COLUMN `registration_open` TINYINT DEFAULT 1', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'discount_codes' AND INDEX_NAME = 'uq_discount_codes_merchant_code') = 0, 'ALTER TABLE `discount_codes` ADD CONSTRAINT `uq_discount_codes_merchant_code` UNIQUE(`merchantId`,`code`)', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'discount_codes' AND INDEX_NAME = 'discount_codes_code_unique') > 0, 'DROP INDEX `discount_codes_code_unique` ON `discount_codes`', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND INDEX_NAME = 'idx_messages_external_id') = 0, 'ALTER TABLE `messages` ADD CONSTRAINT `idx_messages_external_id` UNIQUE(`externalId`)', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
ALTER TABLE `byaan_connections` ADD CONSTRAINT `byaan_connections_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `byaan_faqs` ADD CONSTRAINT `byaan_faqs_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `byaan_site_content` ADD CONSTRAINT `byaan_site_content_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `byaan_trainees` ADD CONSTRAINT `byaan_trainees_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_optouts` ADD CONSTRAINT `campaign_optouts_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `media_library` ADD CONSTRAINT `media_library_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `merchant_invitations` ADD CONSTRAINT `merchant_invitations_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `merchant_members` ADD CONSTRAINT `merchant_members_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `merchant_members` ADD CONSTRAINT `merchant_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `merchant_onboarding_answers` ADD CONSTRAINT `merchant_onboarding_answers_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_followups` ADD CONSTRAINT `sales_followups_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_followups` ADD CONSTRAINT `sales_followups_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sari_activity_log` ADD CONSTRAINT `sari_activity_log_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sari_api_keys` ADD CONSTRAINT `sari_api_keys_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sari_behavioral_dna` ADD CONSTRAINT `sari_behavioral_dna_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sari_coaching_questions` ADD CONSTRAINT `sari_coaching_questions_session_id_sari_coaching_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sari_coaching_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sari_coaching_questions` ADD CONSTRAINT `sari_coaching_questions_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sari_coaching_questions` ADD CONSTRAINT `sari_coaching_questions_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sari_coaching_sessions` ADD CONSTRAINT `sari_coaching_sessions_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sari_conversions` ADD CONSTRAINT `sari_conversions_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sari_escalation_queue` ADD CONSTRAINT `sari_escalation_queue_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sari_escalation_queue` ADD CONSTRAINT `sari_escalation_queue_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sari_learning_signals` ADD CONSTRAINT `sari_learning_signals_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sari_learning_signals` ADD CONSTRAINT `sari_learning_signals_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session_contexts` ADD CONSTRAINT `session_contexts_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session_contexts` ADD CONSTRAINT `session_contexts_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supervisor_interventions` ADD CONSTRAINT `supervisor_interventions_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supervisor_interventions` ADD CONSTRAINT `supervisor_interventions_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
