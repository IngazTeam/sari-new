CREATE TABLE IF NOT EXISTS `customer_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`customer_phone` varchar(20) NOT NULL,
	`display_name` varchar(100),
	`nickname` varchar(100),
	`child_name` varchar(100),
	`preferences` text,
	`pain_points` text,
	`purchase_history` text,
	`total_spent` decimal(12,2) NOT NULL DEFAULT '0',
	`total_conversations` int NOT NULL DEFAULT 0,
	`sentiment_avg` varchar(20) DEFAULT 'neutral',
	`customer_tier` varchar(20) DEFAULT 'new',
	`last_objection` varchar(50),
	`last_seen_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_merchant_phone` UNIQUE(`merchant_id`,`customer_phone`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `knowledge_changelog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`section_id` int,
	`action` enum('add','merge','evolve','conflict','delete','manual_edit') NOT NULL,
	`reason` text,
	`old_content` text,
	`new_content` text,
	`source` varchar(50),
	`resolved` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `knowledge_changelog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `knowledge_sections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`parent_id` int,
	`section_type` enum('identity','services','policies','faq','contact','team','achievements','sales_intel','opportunities','custom') NOT NULL,
	`title` varchar(500) NOT NULL,
	`content` text NOT NULL,
	`summary` varchar(1000),
	`source` enum('website','document','manual','ai_evolved','byaan_sync') NOT NULL,
	`source_url` varchar(2000),
	`confidence` decimal(3,2) DEFAULT '0.90',
	`status` enum('auto_approved','approved','pending_review') DEFAULT 'auto_approved',
	`use_in_bot` tinyint NOT NULL DEFAULT 1,
	`inject_as` enum('fact','behavior','none') DEFAULT 'fact',
	`sort_order` int NOT NULL DEFAULT 0,
	`merchant_edited` tinyint NOT NULL DEFAULT 0,
	`embedding` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledge_sections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `merchant_knowledge_docs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_type` enum('pdf','docx','xlsx') NOT NULL,
	`file_url` text,
	`file_size` int NOT NULL,
	`extracted_text` text,
	`extraction_status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`uploaded_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `merchant_knowledge_docs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `product_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`name_en` varchar(100),
	`parent_id` int,
	`sort_order` int NOT NULL DEFAULT 0,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `product_options` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`merchant_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`name_en` varchar(100),
	`values` text NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_options_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `product_variants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`merchant_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`sku` varchar(100),
	`price` int,
	`compare_at_price` int,
	`cost_price` int,
	`stock` int DEFAULT 0,
	`barcode` varchar(100),
	`weight` varchar(20),
	`image_url` varchar(500),
	`options` text,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_variants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `quotation_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`header_image_url` varchar(500),
	`footer_text` text,
	`terms_text` text,
	`is_default` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quotation_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sales_quotations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`customer_phone` varchar(20),
	`customer_name` varchar(255),
	`quotation_number` varchar(50) NOT NULL,
	`items` text NOT NULL,
	`subtotal` decimal(10,2) NOT NULL,
	`tax_amount` decimal(10,2) NOT NULL DEFAULT '0',
	`total` decimal(10,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'SAR',
	`status` enum('sent','viewed','accepted','rejected','expired') NOT NULL DEFAULT 'sent',
	`valid_until` date,
	`pdf_url` varchar(500),
	`conversation_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_quotations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sales_targets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`period_type` enum('monthly','quarterly','yearly') NOT NULL DEFAULT 'monthly',
	`period_start` date NOT NULL,
	`period_end` date NOT NULL,
	`target_amount` decimal(12,2) NOT NULL,
	`achieved_amount` decimal(12,2) NOT NULL DEFAULT '0',
	`quotations_sent` int NOT NULL DEFAULT 0,
	`quotations_won` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_targets_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_merchant_period` UNIQUE(`merchant_id`,`period_type`,`period_start`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sari_ai_directives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` enum('sales','culture','persuasion','examples','limits') NOT NULL,
	`title` varchar(200) NOT NULL,
	`content` text NOT NULL,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`priority` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sari_ai_directives_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sari_quality_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`conversation_id` int,
	`question_text` text NOT NULL,
	`response_text` text NOT NULL,
	`response_time_ms` int NOT NULL DEFAULT 0,
	`was_cache_hit` tinyint NOT NULL DEFAULT 0,
	`rag_sections_used` int NOT NULL DEFAULT 0,
	`customer_sentiment` varchar(20),
	`feedback_rating` tinyint,
	`was_empty` tinyint NOT NULL DEFAULT 0,
	`was_escalated` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sari_quality_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sari_response_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`question_text` text NOT NULL,
	`question_embedding` text,
	`response_text` text NOT NULL,
	`hit_count` int NOT NULL DEFAULT 0,
	`is_valid` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`last_used_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sari_response_cache_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sari_strategy_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`strategy` varchar(50) NOT NULL,
	`was_used` tinyint NOT NULL DEFAULT 1,
	`led_to_purchase` tinyint NOT NULL DEFAULT 0,
	`conversation_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sari_strategy_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sari_weekly_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`week_start` date NOT NULL,
	`week_end` date NOT NULL,
	`total_messages` int NOT NULL DEFAULT 0,
	`total_responses` int NOT NULL DEFAULT 0,
	`avg_response_time_ms` int NOT NULL DEFAULT 0,
	`cache_hit_rate` decimal(5,2) NOT NULL DEFAULT '0',
	`empty_response_rate` decimal(5,2) NOT NULL DEFAULT '0',
	`avg_sentiment_score` decimal(3,2) NOT NULL DEFAULT '0',
	`top_questions` text,
	`escalation_rate` decimal(5,2) NOT NULL DEFAULT '0',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sari_weekly_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_merchant_week` UNIQUE(`merchant_id`,`week_start`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `virtual_agents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`role` varchar(100) NOT NULL,
	`department` varchar(100),
	`personality_prompt` text NOT NULL,
	`tone` enum('friendly','professional','casual','empathetic','persuasive') NOT NULL DEFAULT 'friendly',
	`avatar_emoji` varchar(10) DEFAULT '👩‍💼',
	`is_default` tinyint NOT NULL DEFAULT 0,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`trigger_keywords` text,
	`trigger_intents` text,
	`shift_start` varchar(5),
	`shift_end` varchar(5),
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `virtual_agents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `merchants` MODIFY COLUMN `platform_type` enum('salla','zid','shopify','woocommerce','byaan','custom','unknown');--> statement-breakpoint
ALTER TABLE `bot_settings` ADD `takeover_timeout_minutes` int DEFAULT 15;--> statement-breakpoint
ALTER TABLE `bot_settings` ADD `takeover_resume_message` text;--> statement-breakpoint
ALTER TABLE `bot_settings` ADD `takeover_commands_enabled` tinyint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `bot_settings` ADD `group_mode` enum('disabled','mention_only','keyword_only','private_redirect') DEFAULT 'disabled' NOT NULL;--> statement-breakpoint
ALTER TABLE `bot_settings` ADD `group_keywords` text;--> statement-breakpoint
ALTER TABLE `bot_settings` ADD `group_redirect_message` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `human_takeover` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `human_takeover_at` timestamp;--> statement-breakpoint
ALTER TABLE `conversations` ADD `human_expires_at` timestamp;--> statement-breakpoint
ALTER TABLE `conversations` ADD `current_agent_id` int;--> statement-breakpoint
ALTER TABLE `conversations` ADD `agent_history` text;--> statement-breakpoint
ALTER TABLE `merchants` ADD `emergency_phone` varchar(20);--> statement-breakpoint
ALTER TABLE `merchants` ADD `escalation_phones` text;--> statement-breakpoint
ALTER TABLE `products` ADD `category_id` int;--> statement-breakpoint
ALTER TABLE `products` ADD `sku` varchar(100);--> statement-breakpoint
ALTER TABLE `products` ADD `barcode` varchar(100);--> statement-breakpoint
ALTER TABLE `products` ADD `compare_at_price` int;--> statement-breakpoint
ALTER TABLE `products` ADD `cost_price` int;--> statement-breakpoint
ALTER TABLE `products` ADD `weight` varchar(20);--> statement-breakpoint
ALTER TABLE `products` ADD `track_inventory` tinyint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `low_stock_alert` int DEFAULT 5;--> statement-breakpoint
ALTER TABLE `products` ADD `images` text;--> statement-breakpoint
ALTER TABLE `products` ADD `tags` text;--> statement-breakpoint
ALTER TABLE `products` ADD `product_type` enum('physical','digital','service') DEFAULT 'physical';--> statement-breakpoint
ALTER TABLE `products` ADD `status` enum('active','draft','archived') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `has_variants` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `website_analyses` ADD `scraped_content` text;--> statement-breakpoint
ALTER TABLE `customer_profiles` ADD CONSTRAINT `customer_profiles_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledge_changelog` ADD CONSTRAINT `knowledge_changelog_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledge_sections` ADD CONSTRAINT `knowledge_sections_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `merchant_knowledge_docs` ADD CONSTRAINT `merchant_knowledge_docs_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_categories` ADD CONSTRAINT `product_categories_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_options` ADD CONSTRAINT `product_options_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotation_templates` ADD CONSTRAINT `quotation_templates_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_quotations` ADD CONSTRAINT `sales_quotations_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_targets` ADD CONSTRAINT `sales_targets_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sari_quality_metrics` ADD CONSTRAINT `sari_quality_metrics_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sari_response_cache` ADD CONSTRAINT `sari_response_cache_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sari_strategy_metrics` ADD CONSTRAINT `sari_strategy_metrics_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sari_weekly_reports` ADD CONSTRAINT `sari_weekly_reports_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `virtual_agents` ADD CONSTRAINT `virtual_agents_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_tier` ON `customer_profiles` (`merchant_id`,`customer_tier`);--> statement-breakpoint
CREATE INDEX `idx_last_seen` ON `customer_profiles` (`merchant_id`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `idx_merchant` ON `knowledge_changelog` (`merchant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_unresolved` ON `knowledge_changelog` (`merchant_id`,`resolved`,`action`);--> statement-breakpoint
CREATE INDEX `idx_merchant_type` ON `knowledge_sections` (`merchant_id`,`section_type`);--> statement-breakpoint
CREATE INDEX `idx_parent` ON `knowledge_sections` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_merchant_status` ON `knowledge_sections` (`merchant_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_merchant_bot` ON `knowledge_sections` (`merchant_id`,`use_in_bot`,`inject_as`);--> statement-breakpoint
CREATE INDEX `idx_merchant_knowledge` ON `merchant_knowledge_docs` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `idx_variant_product` ON `product_variants` (`product_id`);--> statement-breakpoint
CREATE INDEX `idx_variant_merchant` ON `product_variants` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `idx_merchant` ON `quotation_templates` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `idx_merchant` ON `sales_quotations` (`merchant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_status` ON `sales_quotations` (`merchant_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_active` ON `sari_ai_directives` (`is_active`,`category`,`priority`);--> statement-breakpoint
CREATE INDEX `idx_merchant_date` ON `sari_quality_metrics` (`merchant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_merchant_empty` ON `sari_quality_metrics` (`merchant_id`,`was_empty`);--> statement-breakpoint
CREATE INDEX `idx_merchant_sentiment` ON `sari_quality_metrics` (`merchant_id`,`customer_sentiment`);--> statement-breakpoint
CREATE INDEX `idx_merchant_valid` ON `sari_response_cache` (`merchant_id`,`is_valid`);--> statement-breakpoint
CREATE INDEX `idx_merchant_strategy` ON `sari_strategy_metrics` (`merchant_id`,`strategy`);--> statement-breakpoint
CREATE INDEX `idx_created` ON `sari_strategy_metrics` (`created_at`);--> statement-breakpoint
CREATE INDEX `virtual_agents_merchant_id_idx` ON `virtual_agents` (`merchant_id`);--> statement-breakpoint
ALTER TABLE `abandoned_carts` ADD CONSTRAINT `abandoned_carts_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `analytics` ADD CONSTRAINT `analytics_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `automation_rules` ADD CONSTRAINT `automation_rules_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_reviews` ADD CONSTRAINT `customer_reviews_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_reviews` ADD CONSTRAINT `customer_reviews_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `discount_codes` ADD CONSTRAINT `discount_codes_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `merchants` ADD CONSTRAINT `merchants_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversationId_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `occasion_campaigns` ADD CONSTRAINT `occasion_campaigns_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_tracking_logs` ADD CONSTRAINT `order_tracking_logs_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `referral_codes` ADD CONSTRAINT `referral_codes_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rewards` ADD CONSTRAINT `rewards_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salla_connections` ADD CONSTRAINT `salla_connections_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supportTickets` ADD CONSTRAINT `supportTickets_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sync_logs` ADD CONSTRAINT `sync_logs_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `testConversations` ADD CONSTRAINT `testConversations_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `testDeals` ADD CONSTRAINT `testDeals_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `testMessages` ADD CONSTRAINT `testMessages_conversationId_testConversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `testConversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `testMetricsDaily` ADD CONSTRAINT `testMetricsDaily_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_connection_requests` ADD CONSTRAINT `whatsapp_connection_requests_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsappConnections` ADD CONSTRAINT `whatsappConnections_merchantId_merchants_id_fk` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;