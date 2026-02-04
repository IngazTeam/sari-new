CREATE TABLE `ab_test_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`test_name` varchar(255) NOT NULL,
	`keyword` varchar(255) NOT NULL,
	`variant_a_id` int,
	`variant_a_text` text NOT NULL,
	`variant_a_usage_count` int NOT NULL DEFAULT 0,
	`variant_a_success_count` int NOT NULL DEFAULT 0,
	`variant_b_id` int,
	`variant_b_text` text NOT NULL,
	`variant_b_usage_count` int NOT NULL DEFAULT 0,
	`variant_b_success_count` int NOT NULL DEFAULT 0,
	`status` enum('running','completed','paused') NOT NULL DEFAULT 'running',
	`winner` enum('variant_a','variant_b','no_winner'),
	`confidence_level` int NOT NULL DEFAULT 0,
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ab_test_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `abandoned_carts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`customerPhone` varchar(20) NOT NULL,
	`customerName` varchar(255),
	`items` text NOT NULL,
	`totalAmount` int NOT NULL,
	`reminderSent` tinyint NOT NULL DEFAULT 0,
	`reminderSentAt` timestamp,
	`recovered` tinyint NOT NULL DEFAULT 0,
	`recoveredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `abandoned_carts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analytics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`date` timestamp NOT NULL,
	`conversationsCount` int NOT NULL DEFAULT 0,
	`messagesCount` int NOT NULL DEFAULT 0,
	`voiceMessagesCount` int NOT NULL DEFAULT 0,
	`campaignsSent` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analytics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`customer_phone` varchar(20) NOT NULL,
	`customer_name` varchar(255),
	`service_id` int NOT NULL,
	`staff_id` int,
	`appointment_date` timestamp NOT NULL,
	`start_time` varchar(5) NOT NULL,
	`end_time` varchar(5) NOT NULL,
	`status` enum('pending','confirmed','cancelled','completed','no_show') NOT NULL DEFAULT 'pending',
	`google_event_id` varchar(255),
	`reminder_24h_sent` tinyint NOT NULL DEFAULT 0,
	`reminder_1h_sent` tinyint NOT NULL DEFAULT 0,
	`notes` text,
	`cancellation_reason` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `automation_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`type` enum('abandoned_cart','review_request','order_tracking','gift_notification','holiday_greeting','winback') NOT NULL,
	`isEnabled` tinyint NOT NULL DEFAULT 1,
	`settings` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `automation_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `booking_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`booking_id` int NOT NULL,
	`service_id` int NOT NULL,
	`staff_id` int,
	`customer_phone` varchar(20) NOT NULL,
	`customer_name` varchar(255),
	`overall_rating` int NOT NULL,
	`service_quality` int,
	`professionalism` int,
	`value_for_money` int,
	`comment` text,
	`is_public` tinyint NOT NULL DEFAULT 1,
	`is_verified` tinyint NOT NULL DEFAULT 1,
	`merchant_reply` text,
	`replied_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `booking_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `booking_time_slots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`service_id` int NOT NULL,
	`staff_id` int,
	`slot_date` date NOT NULL,
	`start_time` varchar(5) NOT NULL,
	`end_time` varchar(5) NOT NULL,
	`is_available` tinyint NOT NULL DEFAULT 1,
	`is_blocked` tinyint NOT NULL DEFAULT 0,
	`block_reason` text,
	`max_bookings` int NOT NULL DEFAULT 1,
	`current_bookings` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `booking_time_slots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`service_id` int NOT NULL,
	`customer_phone` varchar(20) NOT NULL,
	`customer_name` varchar(255),
	`customer_email` varchar(255),
	`staff_id` int,
	`booking_date` date NOT NULL,
	`start_time` varchar(5) NOT NULL,
	`end_time` varchar(5) NOT NULL,
	`duration_minutes` int NOT NULL,
	`status` enum('pending','confirmed','in_progress','completed','cancelled','no_show') NOT NULL DEFAULT 'pending',
	`payment_status` enum('unpaid','paid','refunded') NOT NULL DEFAULT 'unpaid',
	`base_price` int NOT NULL,
	`discount_amount` int NOT NULL DEFAULT 0,
	`final_price` int NOT NULL,
	`google_event_id` varchar(255),
	`reminder_24h_sent` tinyint NOT NULL DEFAULT 0,
	`reminder_1h_sent` tinyint NOT NULL DEFAULT 0,
	`notes` text,
	`cancellation_reason` text,
	`cancelled_by` enum('customer','merchant','system'),
	`booking_source` enum('whatsapp','website','phone','walk_in') NOT NULL DEFAULT 'whatsapp',
	`confirmed_at` timestamp,
	`completed_at` timestamp,
	`cancelled_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bookings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bot_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`auto_reply_enabled` tinyint NOT NULL DEFAULT 1,
	`working_hours_enabled` tinyint NOT NULL DEFAULT 0,
	`working_hours_start` varchar(5) DEFAULT '09:00',
	`working_hours_end` varchar(5) DEFAULT '18:00',
	`working_days` varchar(50) DEFAULT '1,2,3,4,5',
	`welcome_message` text,
	`out_of_hours_message` text,
	`response_delay` int DEFAULT 2,
	`max_response_length` int DEFAULT 200,
	`tone` enum('friendly','professional','casual') NOT NULL DEFAULT 'friendly',
	`language` enum('ar','en','fr','tr','es','it','both') NOT NULL DEFAULT 'ar',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bot_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`business_type` enum('store','services','both') NOT NULL,
	`template_name` varchar(255) NOT NULL,
	`icon` varchar(50),
	`services` text,
	`products` text,
	`working_hours` text,
	`bot_personality` text,
	`settings` text,
	`description` text,
	`suitable_for` text,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`usage_count` int NOT NULL DEFAULT 0,
	`default_language` enum('ar','en') NOT NULL DEFAULT 'ar',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaignLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`customerId` int,
	`customerPhone` varchar(20) NOT NULL,
	`customerName` varchar(255),
	`status` enum('success','failed','pending') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaignLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`imageUrl` varchar(500),
	`targetAudience` text,
	`status` enum('draft','scheduled','sending','completed','failed') NOT NULL DEFAULT 'draft',
	`scheduledAt` timestamp,
	`sentCount` int NOT NULL DEFAULT 0,
	`totalRecipients` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `competitor_analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`url` varchar(500) NOT NULL,
	`industry` varchar(100),
	`overall_score` int NOT NULL DEFAULT 0,
	`seo_score` int NOT NULL DEFAULT 0,
	`performance_score` int NOT NULL DEFAULT 0,
	`ux_score` int NOT NULL DEFAULT 0,
	`content_score` int NOT NULL DEFAULT 0,
	`avg_price` decimal(10,2),
	`min_price` decimal(10,2),
	`max_price` decimal(10,2),
	`currency` varchar(10) DEFAULT 'SAR',
	`product_count` int NOT NULL DEFAULT 0,
	`strengths` text,
	`weaknesses` text,
	`opportunities` text,
	`status` enum('pending','analyzing','completed','failed') NOT NULL DEFAULT 'pending',
	`error_message` text,
	`analyzed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `competitor_analyses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `competitor_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`competitor_id` int NOT NULL,
	`merchant_id` int NOT NULL,
	`name` varchar(500) NOT NULL,
	`description` text,
	`price` decimal(10,2),
	`currency` varchar(10) DEFAULT 'SAR',
	`image_url` varchar(500),
	`product_url` varchar(500),
	`category` varchar(255),
	`similar_to_merchant_product` int,
	`price_difference` decimal(10,2),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `competitor_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`customerPhone` varchar(20) NOT NULL,
	`customerName` varchar(255),
	`status` enum('active','closed','archived') NOT NULL DEFAULT 'active',
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastActivityAt` timestamp NOT NULL DEFAULT (now()),
	`purchaseCount` int NOT NULL DEFAULT 0,
	`totalSpent` int NOT NULL DEFAULT 0,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`orderId` int NOT NULL,
	`customerPhone` varchar(20) NOT NULL,
	`customerName` varchar(255),
	`rating` int NOT NULL,
	`comment` text,
	`productId` int,
	`isPublic` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`merchantReply` text,
	`repliedAt` timestamp,
	CONSTRAINT `customer_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `discount_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`code` varchar(50) NOT NULL,
	`type` enum('percentage','fixed') NOT NULL,
	`value` int NOT NULL,
	`minOrderAmount` int DEFAULT 0,
	`maxUses` int,
	`usedCount` int NOT NULL DEFAULT 0,
	`expiresAt` timestamp,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `discount_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `discovered_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`page_type` enum('about','shipping','returns','faq','contact','privacy','terms','other') NOT NULL,
	`title` varchar(500),
	`url` varchar(1000) NOT NULL,
	`content` text,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`use_in_bot` tinyint NOT NULL DEFAULT 1,
	`discovered_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `discovered_pages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`display_name` varchar(255) NOT NULL,
	`subject` varchar(500) NOT NULL,
	`html_content` text NOT NULL,
	`text_content` text NOT NULL,
	`variables` text,
	`description` text,
	`is_custom` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_templates_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `email_verification_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`email` varchar(255) NOT NULL,
	`token` varchar(255) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`is_used` tinyint NOT NULL DEFAULT 0,
	`used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_verification_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_verification_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `extracted_faqs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`page_id` int,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`category` varchar(255),
	`is_active` tinyint NOT NULL DEFAULT 1,
	`use_in_bot` tinyint NOT NULL DEFAULT 1,
	`priority` int NOT NULL DEFAULT 0,
	`usage_count` int NOT NULL DEFAULT 0,
	`last_used_at` timestamp,
	`extracted_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `extracted_faqs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `extracted_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`analysis_id` int NOT NULL,
	`merchant_id` int NOT NULL,
	`name` varchar(500) NOT NULL,
	`description` text,
	`price` decimal(10,2),
	`currency` varchar(10) DEFAULT 'SAR',
	`image_url` varchar(500),
	`product_url` varchar(500),
	`category` varchar(255),
	`tags` text,
	`in_stock` tinyint NOT NULL DEFAULT 1,
	`stock_quantity` int,
	`ai_extracted` tinyint NOT NULL DEFAULT 1,
	`confidence` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `extracted_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `google_integrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`integration_type` enum('calendar','sheets') NOT NULL,
	`credentials` text,
	`calendar_id` varchar(255),
	`sheet_id` varchar(255),
	`is_active` tinyint NOT NULL DEFAULT 1,
	`last_sync` timestamp,
	`settings` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `google_integrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `google_oauth_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` varchar(500) NOT NULL,
	`clientSecret` varchar(500) NOT NULL,
	`is_enabled` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `google_oauth_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `google_oauth_settings_clientId_unique` UNIQUE(`clientId`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoice_number` varchar(50) NOT NULL,
	`payment_id` int NOT NULL,
	`merchant_id` int NOT NULL,
	`subscription_id` int,
	`amount` int NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'SAR',
	`status` enum('draft','sent','paid','cancelled') NOT NULL DEFAULT 'paid',
	`pdf_path` text,
	`pdf_url` text,
	`email_sent` tinyint NOT NULL DEFAULT 0,
	`email_sent_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `keyword_analysis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`keyword` varchar(255) NOT NULL,
	`category` enum('product','price','shipping','complaint','question','other') NOT NULL,
	`frequency` int NOT NULL DEFAULT 1,
	`sample_messages` text,
	`suggested_response` text,
	`status` enum('new','reviewed','response_created','ignored') NOT NULL DEFAULT 'new',
	`first_seen_at` timestamp NOT NULL DEFAULT (now()),
	`last_seen_at` timestamp NOT NULL DEFAULT (now()),
	`reviewed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `keyword_analysis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `limited_time_offers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`title_ar` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`description_ar` text NOT NULL,
	`discount_percentage` int,
	`discount_amount` int,
	`duration_minutes` int NOT NULL,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `limited_time_offers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loyalty_points` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`customer_phone` varchar(20) NOT NULL,
	`customer_name` varchar(255),
	`total_points` int NOT NULL DEFAULT 0,
	`lifetime_points` int NOT NULL DEFAULT 0,
	`current_tier_id` int,
	`last_points_earned_at` timestamp,
	`last_points_redeemed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loyalty_points_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loyalty_redemptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`customer_phone` varchar(20) NOT NULL,
	`customer_name` varchar(255),
	`reward_id` int NOT NULL,
	`points_spent` int NOT NULL,
	`status` enum('pending','approved','used','cancelled','expired') NOT NULL DEFAULT 'pending',
	`order_id` int,
	`used_at` timestamp,
	`expires_at` timestamp,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loyalty_redemptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loyalty_rewards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`title_ar` varchar(255) NOT NULL,
	`description` text,
	`description_ar` text,
	`type` enum('discount','free_product','free_shipping','gift') NOT NULL,
	`points_cost` int NOT NULL,
	`discount_amount` int,
	`discountType` enum('fixed','percentage'),
	`product_id` int,
	`max_redemptions` int,
	`current_redemptions` int NOT NULL DEFAULT 0,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`valid_from` timestamp,
	`valid_until` timestamp,
	`image_url` varchar(500),
	`terms_and_conditions` text,
	`terms_and_conditions_ar` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loyalty_rewards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loyalty_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`is_enabled` tinyint NOT NULL DEFAULT 1,
	`points_per_currency` int NOT NULL DEFAULT 1,
	`currency_per_point` int NOT NULL DEFAULT 10,
	`enable_referral_bonus` tinyint NOT NULL DEFAULT 1,
	`referral_bonus_points` int NOT NULL DEFAULT 50,
	`enable_review_bonus` tinyint NOT NULL DEFAULT 1,
	`review_bonus_points` int NOT NULL DEFAULT 10,
	`enable_birthday_bonus` tinyint NOT NULL DEFAULT 0,
	`birthday_bonus_points` int NOT NULL DEFAULT 20,
	`points_expiry_days` int NOT NULL DEFAULT 365,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loyalty_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loyalty_tiers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`name_ar` varchar(100) NOT NULL,
	`min_points` int NOT NULL,
	`discount_percentage` int NOT NULL DEFAULT 0,
	`free_shipping` tinyint NOT NULL DEFAULT 0,
	`priority` int NOT NULL DEFAULT 0,
	`color` varchar(20) NOT NULL DEFAULT '#CD7F32',
	`icon` varchar(50) NOT NULL DEFAULT '🥉',
	`benefits` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loyalty_tiers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loyalty_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`customer_phone` varchar(20) NOT NULL,
	`type` enum('earn','redeem','expire','adjustment') NOT NULL,
	`points` int NOT NULL,
	`reason` varchar(255) NOT NULL,
	`reason_ar` varchar(255) NOT NULL,
	`order_id` int,
	`reward_id` int,
	`redemption_id` int,
	`balance_before` int NOT NULL,
	`balance_after` int NOT NULL,
	`expires_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `loyalty_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `merchant_payment_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`tap_enabled` tinyint NOT NULL DEFAULT 0,
	`tap_public_key` text,
	`tap_secret_key` text,
	`tap_test_mode` tinyint NOT NULL DEFAULT 1,
	`auto_send_payment_link` tinyint NOT NULL DEFAULT 1,
	`payment_link_message` text,
	`default_currency` varchar(3) NOT NULL DEFAULT 'SAR',
	`tap_webhook_secret` text,
	`webhook_url` text,
	`is_verified` tinyint NOT NULL DEFAULT 0,
	`last_verified_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `merchant_payment_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `merchant_payment_settings_merchant_id_unique` UNIQUE(`merchant_id`)
);
--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`businessName` varchar(255) NOT NULL,
	`phone` varchar(20),
	`status` enum('active','suspended','pending') NOT NULL DEFAULT 'pending',
	`subscriptionId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`autoReplyEnabled` tinyint NOT NULL DEFAULT 1,
	`onboardingCompleted` tinyint NOT NULL DEFAULT 0,
	`onboardingStep` int NOT NULL DEFAULT 0,
	`onboardingCompletedAt` timestamp,
	`currency` enum('SAR','USD') NOT NULL DEFAULT 'SAR',
	`businessType` enum('store','services','both'),
	`setupCompleted` tinyint NOT NULL DEFAULT 0,
	`setupCompletedAt` timestamp,
	`address` varchar(500),
	`description` text,
	`workingHoursType` enum('24_7','weekdays','custom') DEFAULT 'weekdays',
	`workingHours` text,
	`website_url` varchar(500),
	`platform_type` enum('salla','zid','shopify','woocommerce','custom','unknown'),
	`last_analysis_date` timestamp,
	`analysis_status` enum('pending','analyzing','completed','failed') DEFAULT 'pending',
	`current_subscription_id` int,
	`subscription_status` enum('none','trial','active','expired') DEFAULT 'none',
	`trial_started_at` timestamp,
	`trial_ends_at` timestamp,
	`max_customers_allowed` int DEFAULT 0,
	`current_customers_count` int DEFAULT 0,
	CONSTRAINT `merchants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`direction` enum('incoming','outgoing') NOT NULL,
	`messageType` enum('text','voice','image','document') NOT NULL DEFAULT 'text',
	`content` text NOT NULL,
	`voiceUrl` varchar(500),
	`imageUrl` varchar(500),
	`mediaUrl` varchar(500),
	`isProcessed` tinyint NOT NULL DEFAULT 0,
	`aiResponse` text,
	`externalId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`status` varchar(50) NOT NULL,
	`template` text NOT NULL,
	`enabled` tinyint DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()),
	CONSTRAINT `notification_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('info','success','warning','error') NOT NULL DEFAULT 'info',
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`link` varchar(500),
	`isRead` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `occasion_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`occasionType` enum('ramadan','eid_fitr','eid_adha','national_day','new_year','hijri_new_year') NOT NULL,
	`year` int NOT NULL,
	`enabled` tinyint NOT NULL DEFAULT 1,
	`discountCode` varchar(50),
	`discountPercentage` int NOT NULL DEFAULT 15,
	`messageTemplate` text,
	`sentAt` timestamp,
	`recipientCount` int NOT NULL DEFAULT 0,
	`status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `occasion_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`merchant_id` int NOT NULL,
	`customer_phone` varchar(20) NOT NULL,
	`status` varchar(50) NOT NULL,
	`message` text NOT NULL,
	`sent` tinyint DEFAULT 0,
	`sent_at` timestamp,
	`error` text,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `order_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`order_id` int,
	`booking_id` int,
	`customer_phone` varchar(20) NOT NULL,
	`customer_name` varchar(255),
	`customer_email` varchar(255),
	`amount` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'SAR',
	`tap_charge_id` varchar(255),
	`tap_payment_url` text,
	`status` enum('pending','authorized','captured','failed','cancelled','refunded') NOT NULL DEFAULT 'pending',
	`payment_method` varchar(50),
	`description` text,
	`metadata` text,
	`authorized_at` timestamp,
	`captured_at` timestamp,
	`failed_at` timestamp,
	`refunded_at` timestamp,
	`expires_at` timestamp,
	`last_webhook_at` timestamp,
	`error_message` text,
	`error_code` varchar(50),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `order_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_tracking_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`oldStatus` varchar(50) NOT NULL,
	`newStatus` varchar(50) NOT NULL,
	`trackingNumber` varchar(255),
	`notificationSent` tinyint NOT NULL DEFAULT 0,
	`notificationMessage` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_tracking_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`sallaOrderId` varchar(100),
	`orderNumber` varchar(100),
	`customerPhone` varchar(20) NOT NULL,
	`customerName` varchar(255) NOT NULL,
	`customerEmail` varchar(255),
	`address` text,
	`city` varchar(100),
	`items` text NOT NULL,
	`totalAmount` int NOT NULL,
	`currency` enum('SAR','USD') NOT NULL DEFAULT 'SAR',
	`discountCode` varchar(50),
	`status` enum('pending','paid','processing','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
	`paymentUrl` text,
	`trackingNumber` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`isGift` tinyint NOT NULL DEFAULT 0,
	`giftRecipientName` varchar(255),
	`giftMessage` text,
	`reviewRequested` tinyint NOT NULL DEFAULT 0,
	`reviewRequestedAt` timestamp,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `password_reset_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`attempted_at` timestamp NOT NULL DEFAULT (now()),
	`ip_address` varchar(45),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `password_reset_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`token` varchar(255) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`used` tinyint NOT NULL DEFAULT 0,
	`used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_gateways` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gateway` enum('tap','paypal') NOT NULL,
	`isEnabled` tinyint NOT NULL DEFAULT 0,
	`publicKey` text,
	`secretKey` text,
	`webhookSecret` text,
	`testMode` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payment_gateways_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`link_id` varchar(100) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`amount` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'SAR',
	`is_fixed_amount` tinyint NOT NULL DEFAULT 1,
	`min_amount` int,
	`max_amount` int,
	`tap_payment_url` text NOT NULL,
	`tap_charge_id` varchar(255),
	`max_usage_count` int,
	`usage_count` int NOT NULL DEFAULT 0,
	`expires_at` timestamp,
	`status` enum('active','expired','disabled','completed') NOT NULL DEFAULT 'active',
	`is_active` tinyint NOT NULL DEFAULT 1,
	`order_id` int,
	`booking_id` int,
	`total_collected` int NOT NULL DEFAULT 0,
	`successful_payments` int NOT NULL DEFAULT 0,
	`failed_payments` int NOT NULL DEFAULT 0,
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payment_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_refunds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`payment_id` int NOT NULL,
	`merchant_id` int NOT NULL,
	`amount` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'SAR',
	`reason` text NOT NULL,
	`tap_refund_id` varchar(255),
	`status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending',
	`processed_by` int,
	`error_message` text,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payment_refunds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`subscriptionId` int NOT NULL,
	`amount` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'SAR',
	`paymentMethod` enum('tap','paypal','link') NOT NULL,
	`transactionId` varchar(255),
	`status` enum('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
	`paidAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `planChangeLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`planId` int NOT NULL,
	`changedBy` int NOT NULL,
	`fieldName` varchar(100) NOT NULL,
	`oldValue` text,
	`newValue` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `planChangeLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`nameAr` varchar(100) NOT NULL,
	`priceMonthly` int NOT NULL,
	`conversationLimit` int NOT NULL,
	`voiceMessageLimit` int NOT NULL,
	`features` text,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_integrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`platform_type` enum('zid','calendly','shopify','woocommerce') NOT NULL,
	`store_name` varchar(255),
	`store_url` varchar(500),
	`access_token` text,
	`refresh_token` text,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`settings` text,
	`last_sync_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platform_integrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`nameAr` varchar(255),
	`description` text,
	`descriptionAr` text,
	`price` int NOT NULL,
	`currency` enum('SAR','USD') NOT NULL DEFAULT 'SAR',
	`imageUrl` varchar(500),
	`productUrl` varchar(500),
	`category` varchar(100),
	`isActive` tinyint NOT NULL DEFAULT 1,
	`stock` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`sallaProductId` varchar(100),
	`lastSyncedAt` timestamp,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quick_responses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`trigger` varchar(255) NOT NULL,
	`keywords` text,
	`response` text NOT NULL,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`priority` int NOT NULL DEFAULT 0,
	`use_count` int NOT NULL DEFAULT 0,
	`last_used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quick_responses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `referral_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`code` varchar(50) NOT NULL,
	`referralCount` int NOT NULL DEFAULT 0,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`referrerPhone` varchar(20) NOT NULL,
	`referrerName` varchar(255) NOT NULL,
	`rewardGiven` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `referral_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `referrals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referralCodeId` int NOT NULL,
	`referredPhone` varchar(20) NOT NULL,
	`referredName` varchar(255) NOT NULL,
	`orderCompleted` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `referrals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`referralId` int NOT NULL,
	`rewardType` enum('discount_10','free_month','analytics_upgrade') NOT NULL,
	`status` enum('pending','claimed','expired') NOT NULL DEFAULT 'pending',
	`claimedAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rewards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `salla_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`storeUrl` varchar(255) NOT NULL,
	`accessToken` text NOT NULL,
	`syncStatus` enum('active','syncing','error','paused') NOT NULL DEFAULT 'active',
	`lastSyncAt` timestamp,
	`syncErrors` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `salla_connections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sari_personality_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`tone` enum('friendly','professional','casual','enthusiastic') NOT NULL DEFAULT 'friendly',
	`style` enum('saudi_dialect','formal_arabic','english','bilingual') NOT NULL DEFAULT 'saudi_dialect',
	`emoji_usage` enum('none','minimal','moderate','frequent') NOT NULL DEFAULT 'moderate',
	`custom_instructions` text,
	`brand_voice` text,
	`max_response_length` int NOT NULL DEFAULT 200,
	`response_delay` int NOT NULL DEFAULT 2,
	`custom_greeting` text,
	`custom_farewell` text,
	`recommendation_style` enum('direct','consultative','enthusiastic') NOT NULL DEFAULT 'consultative',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sari_personality_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scheduled_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`day_of_week` int NOT NULL,
	`time` varchar(5) NOT NULL,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`last_sent_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduled_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sentiment_analysis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`message_id` int NOT NULL,
	`conversation_id` int NOT NULL,
	`sentiment` enum('positive','negative','neutral','angry','happy','sad','frustrated') NOT NULL,
	`confidence` int NOT NULL,
	`keywords` text,
	`reasoning` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sentiment_analysis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seo_analytics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`date` timestamp NOT NULL,
	`visitors` int NOT NULL DEFAULT 0,
	`page_views` int NOT NULL DEFAULT 0,
	`bounceRate` varchar(10) DEFAULT '0',
	`avg_session_duration` varchar(20) DEFAULT '0',
	`conversions` int NOT NULL DEFAULT 0,
	`conversion_rate` varchar(10) DEFAULT '0',
	`traffic_source` enum('organic','direct','social','referral','paid','other') DEFAULT 'organic',
	`device` enum('desktop','mobile','tablet') DEFAULT 'desktop',
	`country` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `seo_analytics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seo_backlinks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`source_url` varchar(500) NOT NULL,
	`source_domain` varchar(255) NOT NULL,
	`anchor_text` varchar(255),
	`link_type` enum('dofollow','nofollow') DEFAULT 'dofollow',
	`domain_authority` int DEFAULT 0,
	`spam_score` int DEFAULT 0,
	`last_found` timestamp NOT NULL DEFAULT (now()),
	`status` enum('active','lost','pending') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_backlinks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seo_keywords_analysis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`keyword` varchar(255) NOT NULL,
	`search_volume` int NOT NULL DEFAULT 0,
	`difficulty` int NOT NULL DEFAULT 0,
	`current_rank` int DEFAULT 0,
	`target_rank` int DEFAULT 1,
	`competitor_count` int NOT NULL DEFAULT 0,
	`trend` varchar(50) DEFAULT 'stable',
	`last_updated` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `seo_keywords_analysis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seo_meta_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`meta_name` varchar(100) NOT NULL,
	`meta_content` text NOT NULL,
	`meta_property` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_meta_tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seo_open_graph` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`og_title` varchar(255) NOT NULL,
	`og_description` text NOT NULL,
	`og_image` varchar(500),
	`og_image_alt` varchar(255),
	`og_image_width` int DEFAULT 1200,
	`og_image_height` int DEFAULT 630,
	`og_type` varchar(50) DEFAULT 'website',
	`og_url` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_open_graph_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seo_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_slug` varchar(255) NOT NULL,
	`page_title` varchar(255) NOT NULL,
	`page_description` text NOT NULL,
	`keywords` text,
	`author` varchar(255),
	`canonical_url` varchar(500),
	`is_indexed` tinyint NOT NULL DEFAULT 1,
	`is_priority` tinyint NOT NULL DEFAULT 0,
	`change_frequency` enum('always','hourly','daily','weekly','monthly','yearly','never') DEFAULT 'weekly',
	`priority` varchar(3) DEFAULT '0.5',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_pages_id` PRIMARY KEY(`id`),
	CONSTRAINT `seo_pages_page_slug_unique` UNIQUE(`page_slug`)
);
--> statement-breakpoint
CREATE TABLE `seo_performance_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`alert_type` enum('ranking_drop','traffic_drop','broken_link','slow_page','low_ctr','high_bounce_rate') NOT NULL,
	`severity` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`message` text NOT NULL,
	`metric` varchar(100),
	`previous_value` varchar(100),
	`current_value` varchar(100),
	`threshold` varchar(100),
	`is_resolved` tinyint NOT NULL DEFAULT 0,
	`resolved_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_performance_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seo_recommendations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`recommendation_type` enum('keyword_optimization','content_improvement','technical_seo','link_building','user_experience','performance') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`estimated_impact` varchar(100),
	`implementation_difficulty` enum('easy','medium','hard') DEFAULT 'medium',
	`status` enum('pending','in_progress','completed','dismissed') NOT NULL DEFAULT 'pending',
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_recommendations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seo_sitemaps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sitemap_type` enum('xml','image','video','news') NOT NULL DEFAULT 'xml',
	`url` varchar(500) NOT NULL,
	`last_modified` timestamp NOT NULL DEFAULT (now()),
	`entry_count` int NOT NULL DEFAULT 0,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_sitemaps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seo_structured_data` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`schema_type` varchar(100) NOT NULL,
	`schema_data` text NOT NULL,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_structured_data_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seo_tracking_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int,
	`tracking_type` enum('google_analytics','google_tag_manager','facebook_pixel','snapchat_pixel','tiktok_pixel','custom') NOT NULL,
	`tracking_id` varchar(255) NOT NULL,
	`tracking_code` text,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_tracking_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seo_twitter_cards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`twitter_card_type` varchar(50) DEFAULT 'summary_large_image',
	`twitter_title` varchar(255) NOT NULL,
	`twitter_description` text NOT NULL,
	`twitter_image` varchar(500),
	`twitter_image_alt` varchar(255),
	`twitter_creator` varchar(100),
	`twitter_site` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_twitter_cards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `service_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`name_en` varchar(255),
	`description` text,
	`icon` varchar(100),
	`color` varchar(20),
	`display_order` int NOT NULL DEFAULT 0,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `service_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `service_packages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`service_ids` text,
	`original_price` int,
	`package_price` int,
	`discount_percentage` int,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `service_packages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `service_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`service_id` int NOT NULL,
	`customer_phone` varchar(20) NOT NULL,
	`customer_name` varchar(255),
	`rating` int NOT NULL,
	`comment` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `service_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`category` varchar(100),
	`category_id` int,
	`price_type` enum('fixed','variable','custom') NOT NULL DEFAULT 'fixed',
	`base_price` int,
	`min_price` int,
	`max_price` int,
	`duration_minutes` int NOT NULL,
	`buffer_time_minutes` int NOT NULL DEFAULT 0,
	`requires_appointment` tinyint NOT NULL DEFAULT 1,
	`max_bookings_per_day` int,
	`advance_booking_days` int NOT NULL DEFAULT 30,
	`staff_ids` text,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`display_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `services_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `setup_wizard_progress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`current_step` int NOT NULL DEFAULT 1,
	`completed_steps` text,
	`wizard_data` text,
	`is_completed` tinyint NOT NULL DEFAULT 0,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `setup_wizard_progress_id` PRIMARY KEY(`id`),
	CONSTRAINT `setup_wizard_progress_merchant_id_unique` UNIQUE(`merchant_id`)
);
--> statement-breakpoint
CREATE TABLE `signup_prompt_test_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` varchar(255) NOT NULL,
	`variant_id` varchar(50) NOT NULL,
	`shown` tinyint NOT NULL DEFAULT 0,
	`clicked` tinyint NOT NULL DEFAULT 0,
	`converted` tinyint NOT NULL DEFAULT 0,
	`dismissed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signup_prompt_test_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signup_prompt_variants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`variant_id` varchar(50) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`cta_text` varchar(100) NOT NULL,
	`offer_text` text,
	`show_offer` tinyint NOT NULL DEFAULT 0,
	`message_threshold` int NOT NULL,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `signup_prompt_variants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staff_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(20),
	`email` varchar(255),
	`role` varchar(100),
	`specialization` varchar(255),
	`working_hours` text,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`google_calendar_id` varchar(255),
	`service_ids` text,
	`avatar` varchar(500),
	`bio` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`planId` int NOT NULL,
	`status` enum('active','expired','cancelled','pending','trial') NOT NULL DEFAULT 'pending',
	`conversationsUsed` int NOT NULL DEFAULT 0,
	`voiceMessagesUsed` int NOT NULL DEFAULT 0,
	`startDate` timestamp NOT NULL,
	`endDate` timestamp NOT NULL,
	`autoRenew` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`messagesUsed` int NOT NULL DEFAULT 0,
	`lastResetAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supportTickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`subject` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`status` enum('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`adminResponse` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supportTickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`syncType` enum('full_sync','stock_sync','single_product') NOT NULL,
	`status` enum('success','failed','in_progress') NOT NULL,
	`itemsSynced` int NOT NULL DEFAULT 0,
	`errors` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `sync_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `template_translations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`template_id` int NOT NULL,
	`language` enum('ar','en') NOT NULL,
	`template_name` varchar(255) NOT NULL,
	`description` text,
	`suitable_for` text,
	`bot_personality` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `template_translations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `testConversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`endedAt` timestamp,
	`messageCount` int NOT NULL DEFAULT 0,
	`hasDeal` tinyint NOT NULL DEFAULT 0,
	`dealValue` int,
	`dealMarkedAt` timestamp,
	`satisfactionRating` int,
	`npsScore` int,
	`wasCompleted` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `testConversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `testDeals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int,
	`merchantId` int NOT NULL,
	`dealValue` int NOT NULL,
	`timeToConversion` int,
	`messageCount` int NOT NULL,
	`markedAt` timestamp NOT NULL DEFAULT (now()),
	`wasCompleted` tinyint NOT NULL DEFAULT 0,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `testDeals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `testMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`sender` enum('user','sari') NOT NULL,
	`content` text NOT NULL,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`responseTime` int,
	`rating` enum('positive','negative'),
	`ratedAt` timestamp,
	`productsRecommended` text,
	`wasClicked` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `testMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `testMetricsDaily` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`date` date NOT NULL,
	`totalConversations` int NOT NULL DEFAULT 0,
	`totalDeals` int NOT NULL DEFAULT 0,
	`conversionRate` int NOT NULL DEFAULT 0,
	`totalRevenue` int NOT NULL DEFAULT 0,
	`avgDealValue` int NOT NULL DEFAULT 0,
	`avgResponseTime` int NOT NULL DEFAULT 0,
	`avgConversationLength` int NOT NULL DEFAULT 0,
	`avgTimeToConversion` int NOT NULL DEFAULT 0,
	`totalMessages` int NOT NULL DEFAULT 0,
	`positiveRatings` int NOT NULL DEFAULT 0,
	`negativeRatings` int NOT NULL DEFAULT 0,
	`satisfactionRate` int NOT NULL DEFAULT 0,
	`completedConversations` int NOT NULL DEFAULT 0,
	`engagementRate` int NOT NULL DEFAULT 0,
	`returningUsers` int NOT NULL DEFAULT 0,
	`productClicks` int NOT NULL DEFAULT 0,
	`completedOrders` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `testMetricsDaily_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trySariAnalytics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(255) NOT NULL,
	`messageCount` int NOT NULL DEFAULT 0,
	`exampleUsed` varchar(255),
	`convertedToSignup` tinyint NOT NULL DEFAULT 0,
	`signupPromptShown` tinyint NOT NULL DEFAULT 0,
	`ipAddress` varchar(45),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trySariAnalytics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	`password` varchar(255),
	`trial_start_date` timestamp,
	`trial_end_date` timestamp,
	`is_trial_active` tinyint NOT NULL DEFAULT 0,
	`whatsapp_connected` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `website_analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`url` varchar(500) NOT NULL,
	`title` varchar(500),
	`description` text,
	`industry` varchar(100),
	`language` varchar(10),
	`seo_score` int NOT NULL DEFAULT 0,
	`seo_issues` text,
	`meta_tags` text,
	`performance_score` int NOT NULL DEFAULT 0,
	`load_time` int,
	`page_size` int,
	`ux_score` int NOT NULL DEFAULT 0,
	`mobile_optimized` tinyint NOT NULL DEFAULT 0,
	`has_contact_info` tinyint NOT NULL DEFAULT 0,
	`has_whatsapp` tinyint NOT NULL DEFAULT 0,
	`content_quality` int NOT NULL DEFAULT 0,
	`word_count` int NOT NULL DEFAULT 0,
	`image_count` int NOT NULL DEFAULT 0,
	`video_count` int NOT NULL DEFAULT 0,
	`overall_score` int NOT NULL DEFAULT 0,
	`status` enum('pending','analyzing','completed','failed') NOT NULL DEFAULT 'pending',
	`error_message` text,
	`analyzed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `website_analyses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `website_insights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`analysis_id` int NOT NULL,
	`merchant_id` int NOT NULL,
	`category` enum('seo','performance','ux','content','marketing','security') NOT NULL,
	`type` enum('strength','weakness','opportunity','threat','recommendation') NOT NULL,
	`priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`title` varchar(500) NOT NULL,
	`description` text NOT NULL,
	`recommendation` text,
	`impact` text,
	`ai_generated` tinyint NOT NULL DEFAULT 1,
	`confidence` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `website_insights_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `weekly_sentiment_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`week_start_date` timestamp NOT NULL,
	`week_end_date` timestamp NOT NULL,
	`total_conversations` int NOT NULL DEFAULT 0,
	`positive_count` int NOT NULL DEFAULT 0,
	`negative_count` int NOT NULL DEFAULT 0,
	`neutral_count` int NOT NULL DEFAULT 0,
	`positive_percentage` int NOT NULL DEFAULT 0,
	`negative_percentage` int NOT NULL DEFAULT 0,
	`satisfaction_score` int NOT NULL DEFAULT 0,
	`top_keywords` text,
	`top_complaints` text,
	`recommendations` text,
	`email_sent` tinyint NOT NULL DEFAULT 0,
	`email_sent_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `weekly_sentiment_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_connection_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`countryCode` varchar(10) NOT NULL,
	`phoneNumber` varchar(20) NOT NULL,
	`fullNumber` varchar(30) NOT NULL,
	`status` enum('pending','approved','rejected','connected') NOT NULL DEFAULT 'pending',
	`rejectionReason` text,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`instanceId` varchar(255),
	`apiToken` varchar(255),
	`apiUrl` varchar(255) DEFAULT 'https://api.green-api.com',
	`connectedAt` timestamp,
	CONSTRAINT `whatsapp_connection_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsappConnections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`phoneNumber` varchar(20),
	`instanceId` varchar(255),
	`apiToken` varchar(255),
	`status` enum('connected','disconnected','pending','error') NOT NULL DEFAULT 'pending',
	`qrCode` text,
	`lastConnected` timestamp,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsappConnections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_instances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`instance_id` varchar(255) NOT NULL,
	`token` text NOT NULL,
	`api_url` varchar(255) DEFAULT 'https://api.green-api.com',
	`phone_number` varchar(20),
	`webhook_url` text,
	`status` enum('active','inactive','pending','expired') NOT NULL DEFAULT 'pending',
	`is_primary` tinyint NOT NULL DEFAULT 0,
	`last_sync_at` timestamp,
	`connected_at` timestamp,
	`expires_at` timestamp,
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_instances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`phone_number` varchar(20),
	`business_name` varchar(255),
	`status` enum('pending','approved','rejected','completed') NOT NULL DEFAULT 'pending',
	`instance_id` varchar(100),
	`token` text,
	`api_url` varchar(255) DEFAULT 'https://api.green-api.com',
	`qr_code_url` text,
	`qr_code_expires_at` timestamp,
	`connected_at` timestamp,
	`reviewed_by` int,
	`reviewed_at` timestamp,
	`admin_notes` text,
	`rejection_reason` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `woocommerce_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`order_id` int,
	`woo_order_id` int NOT NULL,
	`order_number` varchar(100) NOT NULL,
	`status` varchar(50) NOT NULL,
	`currency` varchar(10) NOT NULL,
	`total` decimal(10,2) NOT NULL,
	`subtotal` decimal(10,2) NOT NULL,
	`total_tax` decimal(10,2),
	`shipping_total` decimal(10,2),
	`discount_total` decimal(10,2),
	`customer_email` varchar(255),
	`customer_phone` varchar(50),
	`customer_name` varchar(255),
	`billing_address` text,
	`shipping_address` text,
	`line_items` text NOT NULL,
	`payment_method` varchar(100),
	`payment_method_title` varchar(255),
	`transaction_id` varchar(255),
	`order_date` timestamp NOT NULL,
	`paid_date` timestamp,
	`completed_date` timestamp,
	`last_sync_at` timestamp NOT NULL DEFAULT (now()),
	`sync_status` enum('synced','pending','error') NOT NULL DEFAULT 'synced',
	`customer_note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `woocommerce_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `woocommerce_orders_merchant_woo_unique` UNIQUE(`merchant_id`,`woo_order_id`)
);
--> statement-breakpoint
CREATE TABLE `woocommerce_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`product_id` int,
	`woo_product_id` int NOT NULL,
	`woo_variation_id` int,
	`name` varchar(500) NOT NULL,
	`slug` varchar(500) NOT NULL,
	`sku` varchar(255),
	`price` decimal(10,2) NOT NULL,
	`regular_price` decimal(10,2),
	`sale_price` decimal(10,2),
	`stock_status` enum('instock','outofstock','onbackorder') NOT NULL DEFAULT 'instock',
	`stock_quantity` int,
	`manage_stock` tinyint NOT NULL DEFAULT 0,
	`description` text,
	`short_description` text,
	`image_url` varchar(1000),
	`categories` text,
	`last_sync_at` timestamp NOT NULL DEFAULT (now()),
	`sync_status` enum('synced','pending','error') NOT NULL DEFAULT 'synced',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `woocommerce_products_id` PRIMARY KEY(`id`),
	CONSTRAINT `woocommerce_products_merchant_woo_unique` UNIQUE(`merchant_id`,`woo_product_id`)
);
--> statement-breakpoint
CREATE TABLE `woocommerce_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`store_url` varchar(500) NOT NULL,
	`consumer_key` varchar(500) NOT NULL,
	`consumer_secret` varchar(500) NOT NULL,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`last_sync_at` timestamp,
	`last_test_at` timestamp,
	`connectionStatus` enum('connected','disconnected','error') NOT NULL DEFAULT 'disconnected',
	`auto_sync_products` tinyint NOT NULL DEFAULT 1,
	`auto_sync_orders` tinyint NOT NULL DEFAULT 1,
	`auto_sync_customers` tinyint NOT NULL DEFAULT 0,
	`sync_interval` int NOT NULL DEFAULT 60,
	`store_version` varchar(50),
	`store_name` varchar(255),
	`store_currency` varchar(10),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `woocommerce_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `woocommerce_settings_merchant_unique` UNIQUE(`merchant_id`)
);
--> statement-breakpoint
CREATE TABLE `woocommerce_sync_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`sync_type` enum('products','orders','customers','manual') NOT NULL,
	`direction` enum('import','export','bidirectional') NOT NULL,
	`status` enum('success','partial','failed') NOT NULL,
	`items_processed` int NOT NULL DEFAULT 0,
	`items_success` int NOT NULL DEFAULT 0,
	`items_failed` int NOT NULL DEFAULT 0,
	`error_message` text,
	`details` text,
	`started_at` timestamp NOT NULL,
	`completed_at` timestamp,
	`duration` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `woocommerce_sync_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `woocommerce_webhooks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`webhook_id` varchar(255),
	`event_type` varchar(100) NOT NULL,
	`topic` varchar(100) NOT NULL,
	`payload` text NOT NULL,
	`status` enum('pending','processed','failed') NOT NULL DEFAULT 'pending',
	`processed_at` timestamp,
	`error_message` text,
	`ip_address` varchar(50),
	`user_agent` varchar(500),
	`signature` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `woocommerce_webhooks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `zid_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`zid_order_id` varchar(255) NOT NULL,
	`zid_order_number` varchar(255),
	`customer_name` varchar(255),
	`customer_email` varchar(255),
	`customer_phone` varchar(50),
	`total_amount` decimal(10,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'SAR',
	`status` enum('pending','processing','completed','cancelled','refunded') NOT NULL DEFAULT 'pending',
	`payment_status` enum('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
	`items` text NOT NULL,
	`shipping_address` text,
	`shipping_method` varchar(255),
	`shipping_cost` decimal(10,2),
	`sari_order_id` int,
	`order_date` timestamp,
	`last_synced_at` timestamp,
	`zid_data` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `zid_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `zid_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`zid_product_id` varchar(255) NOT NULL,
	`zid_sku` varchar(255),
	`name_ar` varchar(500),
	`name_en` varchar(500),
	`description_ar` text,
	`description_en` text,
	`price` decimal(10,2) NOT NULL,
	`sale_price` decimal(10,2),
	`currency` varchar(3) NOT NULL DEFAULT 'SAR',
	`quantity` int NOT NULL DEFAULT 0,
	`is_in_stock` tinyint NOT NULL DEFAULT 1,
	`main_image` varchar(1000),
	`images` text,
	`category_id` varchar(255),
	`category_name` varchar(255),
	`is_active` tinyint NOT NULL DEFAULT 1,
	`is_published` tinyint NOT NULL DEFAULT 1,
	`sari_product_id` int,
	`last_synced_at` timestamp,
	`zid_data` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `zid_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `zid_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`client_id` varchar(255),
	`client_secret` text,
	`access_token` text,
	`manager_token` text,
	`refresh_token` text,
	`store_id` varchar(255),
	`store_name` varchar(255),
	`store_url` varchar(500),
	`is_active` tinyint NOT NULL DEFAULT 1,
	`auto_sync_products` tinyint NOT NULL DEFAULT 1,
	`auto_sync_orders` tinyint NOT NULL DEFAULT 1,
	`auto_sync_customers` tinyint NOT NULL DEFAULT 0,
	`last_product_sync` timestamp,
	`last_order_sync` timestamp,
	`last_customer_sync` timestamp,
	`token_expires_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `zid_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `zid_sync_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`sync_type` enum('products','orders','customers','inventory') NOT NULL,
	`status` enum('pending','in_progress','completed','failed') NOT NULL DEFAULT 'pending',
	`total_items` int NOT NULL DEFAULT 0,
	`processed_items` int NOT NULL DEFAULT 0,
	`success_count` int NOT NULL DEFAULT 0,
	`failed_count` int NOT NULL DEFAULT 0,
	`error_message` text,
	`sync_details` text,
	`started_at` timestamp,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `zid_sync_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `zid_webhooks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`webhook_id` varchar(255),
	`event_type` varchar(100) NOT NULL,
	`payload` text NOT NULL,
	`status` enum('pending','processed','failed') NOT NULL DEFAULT 'pending',
	`processed_at` timestamp,
	`error_message` text,
	`ip_address` varchar(50),
	`user_agent` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `zid_webhooks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`to_email` varchar(255) NOT NULL,
	`subject` varchar(500) NOT NULL,
	`body` text NOT NULL,
	`status` varchar(50) NOT NULL DEFAULT 'pending',
	`error` text,
	`email_type` varchar(100),
	`merchant_id` int,
	`metadata` text,
	`sent_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `smtp_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`host` varchar(255) NOT NULL,
	`port` int NOT NULL DEFAULT 587,
	`username` varchar(255) NOT NULL,
	`password` text NOT NULL,
	`from_email` varchar(255) NOT NULL,
	`from_name` varchar(255) NOT NULL DEFAULT 'ساري',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `smtp_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `push_notification_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`subscription_id` int,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`url` varchar(500),
	`status` varchar(50) NOT NULL DEFAULT 'pending',
	`error` text,
	`sent_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `push_notification_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` varchar(500),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`type` enum('new_order','new_message','appointment','order_status','missed_message','whatsapp_disconnect','weekly_report','custom') NOT NULL,
	`method` enum('push','email','both') NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`url` varchar(500),
	`status` enum('pending','sent','failed','cancelled') NOT NULL DEFAULT 'pending',
	`error` text,
	`metadata` text,
	`sent_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notification_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`new_orders_enabled` boolean NOT NULL DEFAULT true,
	`new_messages_enabled` boolean NOT NULL DEFAULT true,
	`appointments_enabled` boolean NOT NULL DEFAULT true,
	`order_status_enabled` boolean NOT NULL DEFAULT true,
	`missed_messages_enabled` boolean NOT NULL DEFAULT true,
	`whatsapp_disconnect_enabled` boolean NOT NULL DEFAULT true,
	`preferred_method` enum('push','email','both') NOT NULL DEFAULT 'both',
	`quiet_hours_enabled` boolean NOT NULL DEFAULT false,
	`quiet_hours_start` varchar(5) DEFAULT '22:00',
	`quiet_hours_end` varchar(5) DEFAULT '08:00',
	`instant_notifications` boolean NOT NULL DEFAULT true,
	`batch_notifications` boolean NOT NULL DEFAULT false,
	`batch_interval` int DEFAULT 30,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_preferences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`notification_key` varchar(255) NOT NULL,
	`type` varchar(100) NOT NULL,
	`message` text NOT NULL,
	`sent_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notification_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`new_orders_global_enabled` boolean NOT NULL DEFAULT true,
	`new_messages_global_enabled` boolean NOT NULL DEFAULT true,
	`appointments_global_enabled` boolean NOT NULL DEFAULT true,
	`order_status_global_enabled` boolean NOT NULL DEFAULT true,
	`missed_messages_global_enabled` boolean NOT NULL DEFAULT true,
	`whatsapp_disconnect_global_enabled` boolean NOT NULL DEFAULT true,
	`weekly_reports_global_enabled` boolean NOT NULL DEFAULT true,
	`weekly_report_day` int NOT NULL DEFAULT 0,
	`weekly_report_time` varchar(5) NOT NULL DEFAULT '09:00',
	`admin_email` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `merchant_addons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`addon_id` int NOT NULL,
	`subscription_id` int,
	`quantity` int NOT NULL DEFAULT 1,
	`start_date` timestamp NOT NULL,
	`end_date` timestamp NOT NULL,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `merchant_addons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `merchant_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`plan_id` int,
	`status` enum('trial','active','expired','cancelled') NOT NULL,
	`billing_cycle` enum('monthly','yearly') NOT NULL,
	`start_date` timestamp NOT NULL,
	`end_date` timestamp NOT NULL,
	`trial_ends_at` timestamp,
	`auto_renew` tinyint NOT NULL DEFAULT 0,
	`cancelled_at` timestamp,
	`cancellation_reason` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `merchant_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`subscription_id` int,
	`type` enum('subscription','addon','renewal','upgrade','downgrade') NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'SAR',
	`status` enum('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
	`payment_method` varchar(50) NOT NULL DEFAULT 'tap',
	`tap_charge_id` varchar(255),
	`tap_response` text,
	`paid_at` timestamp,
	`refunded_at` timestamp,
	`refund_reason` text,
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payment_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscription_addons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`name_en` varchar(255) NOT NULL,
	`description` text,
	`description_en` text,
	`type` enum('extra_whatsapp','extra_customers','custom') NOT NULL,
	`monthly_price` decimal(10,2) NOT NULL,
	`yearly_price` decimal(10,2) NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'SAR',
	`value` int NOT NULL,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscription_addons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscription_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`name_en` varchar(255) NOT NULL,
	`description` text,
	`description_en` text,
	`monthly_price` decimal(10,2) NOT NULL,
	`yearly_price` decimal(10,2) NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'SAR',
	`max_customers` int NOT NULL,
	`max_whatsapp_numbers` int NOT NULL DEFAULT 1,
	`features` text,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscription_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tap_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`secret_key` text NOT NULL,
	`public_key` varchar(500) NOT NULL,
	`is_live` tinyint NOT NULL DEFAULT 0,
	`webhook_url` varchar(500),
	`webhook_secret` varchar(500),
	`is_active` tinyint NOT NULL DEFAULT 1,
	`last_test_at` timestamp,
	`last_test_status` enum('success','failed'),
	`last_test_message` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tap_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coupon_usage_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`coupon_id` int NOT NULL,
	`merchant_id` int NOT NULL,
	`subscription_id` int,
	`plan_id` int,
	`original_price` decimal(10,2) NOT NULL,
	`discount_amount` decimal(10,2) NOT NULL,
	`final_price` decimal(10,2) NOT NULL,
	`used_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coupon_usage_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `discount_coupons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`description` text,
	`discount_type` enum('percentage','fixed') NOT NULL,
	`discount_value` decimal(10,2) NOT NULL,
	`min_purchase_amount` decimal(10,2),
	`max_discount_amount` decimal(10,2),
	`valid_from` timestamp NOT NULL,
	`valid_until` timestamp NOT NULL,
	`max_usage_count` int,
	`current_usage_count` int NOT NULL DEFAULT 0,
	`max_usage_per_merchant` int DEFAULT 1,
	`applicable_plan_ids` text,
	`is_active` int NOT NULL DEFAULT 1,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `discount_coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `discount_coupons_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `ab_test_results` ADD CONSTRAINT `ab_test_results_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ab_test_results` ADD CONSTRAINT `ab_test_results_variant_a_id_quick_responses_id_fk` FOREIGN KEY (`variant_a_id`) REFERENCES `quick_responses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ab_test_results` ADD CONSTRAINT `ab_test_results_variant_b_id_quick_responses_id_fk` FOREIGN KEY (`variant_b_id`) REFERENCES `quick_responses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_service_id_services_id_fk` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_staff_id_staff_members_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `booking_reviews` ADD CONSTRAINT `booking_reviews_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `booking_reviews` ADD CONSTRAINT `booking_reviews_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `booking_reviews` ADD CONSTRAINT `booking_reviews_service_id_services_id_fk` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `booking_reviews` ADD CONSTRAINT `booking_reviews_staff_id_staff_members_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `booking_time_slots` ADD CONSTRAINT `booking_time_slots_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `booking_time_slots` ADD CONSTRAINT `booking_time_slots_service_id_services_id_fk` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `booking_time_slots` ADD CONSTRAINT `booking_time_slots_staff_id_staff_members_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_service_id_services_id_fk` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_staff_id_staff_members_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bot_settings` ADD CONSTRAINT `bot_settings_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `competitor_analyses` ADD CONSTRAINT `competitor_analyses_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `competitor_products` ADD CONSTRAINT `competitor_products_competitor_id_competitor_analyses_id_fk` FOREIGN KEY (`competitor_id`) REFERENCES `competitor_analyses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `competitor_products` ADD CONSTRAINT `competitor_products_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `competitor_products` ADD CONSTRAINT `competitor_products_similar_to_merchant_product_products_id_fk` FOREIGN KEY (`similar_to_merchant_product`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `discovered_pages` ADD CONSTRAINT `discovered_pages_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_verification_tokens` ADD CONSTRAINT `email_verification_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `extracted_faqs` ADD CONSTRAINT `extracted_faqs_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `extracted_faqs` ADD CONSTRAINT `extracted_faqs_page_id_discovered_pages_id_fk` FOREIGN KEY (`page_id`) REFERENCES `discovered_pages`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `extracted_products` ADD CONSTRAINT `extracted_products_analysis_id_website_analyses_id_fk` FOREIGN KEY (`analysis_id`) REFERENCES `website_analyses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `extracted_products` ADD CONSTRAINT `extracted_products_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `google_integrations` ADD CONSTRAINT `google_integrations_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `keyword_analysis` ADD CONSTRAINT `keyword_analysis_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loyalty_points` ADD CONSTRAINT `loyalty_points_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loyalty_points` ADD CONSTRAINT `loyalty_points_current_tier_id_loyalty_tiers_id_fk` FOREIGN KEY (`current_tier_id`) REFERENCES `loyalty_tiers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loyalty_redemptions` ADD CONSTRAINT `loyalty_redemptions_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loyalty_redemptions` ADD CONSTRAINT `loyalty_redemptions_reward_id_loyalty_rewards_id_fk` FOREIGN KEY (`reward_id`) REFERENCES `loyalty_rewards`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loyalty_redemptions` ADD CONSTRAINT `loyalty_redemptions_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loyalty_rewards` ADD CONSTRAINT `loyalty_rewards_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loyalty_rewards` ADD CONSTRAINT `loyalty_rewards_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loyalty_settings` ADD CONSTRAINT `loyalty_settings_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loyalty_tiers` ADD CONSTRAINT `loyalty_tiers_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loyalty_transactions` ADD CONSTRAINT `loyalty_transactions_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loyalty_transactions` ADD CONSTRAINT `loyalty_transactions_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loyalty_transactions` ADD CONSTRAINT `loyalty_transactions_reward_id_loyalty_rewards_id_fk` FOREIGN KEY (`reward_id`) REFERENCES `loyalty_rewards`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loyalty_transactions` ADD CONSTRAINT `loyalty_transactions_redemption_id_loyalty_redemptions_id_fk` FOREIGN KEY (`redemption_id`) REFERENCES `loyalty_redemptions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `merchant_payment_settings` ADD CONSTRAINT `merchant_payment_settings_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_templates` ADD CONSTRAINT `notification_templates_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_notifications` ADD CONSTRAINT `order_notifications_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_notifications` ADD CONSTRAINT `order_notifications_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_payments` ADD CONSTRAINT `order_payments_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_payments` ADD CONSTRAINT `order_payments_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_payments` ADD CONSTRAINT `order_payments_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_links` ADD CONSTRAINT `payment_links_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_links` ADD CONSTRAINT `payment_links_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_links` ADD CONSTRAINT `payment_links_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_refunds` ADD CONSTRAINT `payment_refunds_payment_id_order_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `order_payments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_refunds` ADD CONSTRAINT `payment_refunds_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_integrations` ADD CONSTRAINT `platform_integrations_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quick_responses` ADD CONSTRAINT `quick_responses_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sari_personality_settings` ADD CONSTRAINT `sari_personality_settings_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scheduled_messages` ADD CONSTRAINT `scheduled_messages_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sentiment_analysis` ADD CONSTRAINT `sentiment_analysis_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sentiment_analysis` ADD CONSTRAINT `sentiment_analysis_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seo_analytics` ADD CONSTRAINT `seo_analytics_page_id_seo_pages_id_fk` FOREIGN KEY (`page_id`) REFERENCES `seo_pages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seo_backlinks` ADD CONSTRAINT `seo_backlinks_page_id_seo_pages_id_fk` FOREIGN KEY (`page_id`) REFERENCES `seo_pages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seo_keywords_analysis` ADD CONSTRAINT `seo_keywords_analysis_page_id_seo_pages_id_fk` FOREIGN KEY (`page_id`) REFERENCES `seo_pages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seo_meta_tags` ADD CONSTRAINT `seo_meta_tags_page_id_seo_pages_id_fk` FOREIGN KEY (`page_id`) REFERENCES `seo_pages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seo_open_graph` ADD CONSTRAINT `seo_open_graph_page_id_seo_pages_id_fk` FOREIGN KEY (`page_id`) REFERENCES `seo_pages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seo_performance_alerts` ADD CONSTRAINT `seo_performance_alerts_page_id_seo_pages_id_fk` FOREIGN KEY (`page_id`) REFERENCES `seo_pages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seo_recommendations` ADD CONSTRAINT `seo_recommendations_page_id_seo_pages_id_fk` FOREIGN KEY (`page_id`) REFERENCES `seo_pages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seo_structured_data` ADD CONSTRAINT `seo_structured_data_page_id_seo_pages_id_fk` FOREIGN KEY (`page_id`) REFERENCES `seo_pages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seo_twitter_cards` ADD CONSTRAINT `seo_twitter_cards_page_id_seo_pages_id_fk` FOREIGN KEY (`page_id`) REFERENCES `seo_pages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_categories` ADD CONSTRAINT `service_categories_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_packages` ADD CONSTRAINT `service_packages_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_reviews` ADD CONSTRAINT `service_reviews_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_reviews` ADD CONSTRAINT `service_reviews_service_id_services_id_fk` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `services` ADD CONSTRAINT `services_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `services` ADD CONSTRAINT `services_category_id_service_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `service_categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `setup_wizard_progress` ADD CONSTRAINT `setup_wizard_progress_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_members` ADD CONSTRAINT `staff_members_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `template_translations` ADD CONSTRAINT `template_translations_template_id_business_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `business_templates`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `website_analyses` ADD CONSTRAINT `website_analyses_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `website_insights` ADD CONSTRAINT `website_insights_analysis_id_website_analyses_id_fk` FOREIGN KEY (`analysis_id`) REFERENCES `website_analyses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `website_insights` ADD CONSTRAINT `website_insights_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `weekly_sentiment_reports` ADD CONSTRAINT `weekly_sentiment_reports_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_instances` ADD CONSTRAINT `whatsapp_instances_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_requests` ADD CONSTRAINT `whatsapp_requests_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `woocommerce_orders` ADD CONSTRAINT `woocommerce_orders_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `woocommerce_orders` ADD CONSTRAINT `woocommerce_orders_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `woocommerce_products` ADD CONSTRAINT `woocommerce_products_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `woocommerce_products` ADD CONSTRAINT `woocommerce_products_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `woocommerce_settings` ADD CONSTRAINT `woocommerce_settings_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `woocommerce_sync_logs` ADD CONSTRAINT `woocommerce_sync_logs_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `woocommerce_webhooks` ADD CONSTRAINT `woocommerce_webhooks_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `zid_orders` ADD CONSTRAINT `zid_orders_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `zid_orders` ADD CONSTRAINT `zid_orders_sari_order_id_orders_id_fk` FOREIGN KEY (`sari_order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `zid_products` ADD CONSTRAINT `zid_products_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `zid_products` ADD CONSTRAINT `zid_products_sari_product_id_products_id_fk` FOREIGN KEY (`sari_product_id`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `zid_settings` ADD CONSTRAINT `zid_settings_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `zid_sync_logs` ADD CONSTRAINT `zid_sync_logs_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `zid_webhooks` ADD CONSTRAINT `zid_webhooks_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `push_notification_logs` ADD CONSTRAINT `push_notification_logs_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `push_notification_logs` ADD CONSTRAINT `push_notification_logs_subscription_id_push_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `push_subscriptions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_logs` ADD CONSTRAINT `notification_logs_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_records` ADD CONSTRAINT `notification_records_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `merchant_addons` ADD CONSTRAINT `merchant_addons_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `merchant_addons` ADD CONSTRAINT `merchant_addons_addon_id_subscription_addons_id_fk` FOREIGN KEY (`addon_id`) REFERENCES `subscription_addons`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `merchant_addons` ADD CONSTRAINT `merchant_addons_subscription_id_merchant_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `merchant_subscriptions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `merchant_subscriptions` ADD CONSTRAINT `merchant_subscriptions_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `merchant_subscriptions` ADD CONSTRAINT `merchant_subscriptions_plan_id_subscription_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD CONSTRAINT `payment_transactions_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD CONSTRAINT `payment_transactions_subscription_id_merchant_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `merchant_subscriptions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupon_usage_log` ADD CONSTRAINT `coupon_usage_log_coupon_id_discount_coupons_id_fk` FOREIGN KEY (`coupon_id`) REFERENCES `discount_coupons`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupon_usage_log` ADD CONSTRAINT `coupon_usage_log_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupon_usage_log` ADD CONSTRAINT `coupon_usage_log_plan_id_subscription_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `bot_settings_merchant_id_unique` ON `bot_settings` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `competitor_analyses_merchant_id_idx` ON `competitor_analyses` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `competitor_analyses_url_idx` ON `competitor_analyses` (`url`);--> statement-breakpoint
CREATE INDEX `competitor_products_competitor_id_idx` ON `competitor_products` (`competitor_id`);--> statement-breakpoint
CREATE INDEX `competitor_products_merchant_id_idx` ON `competitor_products` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `discount_codes_code_unique` ON `discount_codes` (`code`);--> statement-breakpoint
CREATE INDEX `discovered_pages_merchant_id_idx` ON `discovered_pages` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `discovered_pages_page_type_idx` ON `discovered_pages` (`page_type`);--> statement-breakpoint
CREATE INDEX `email_templates_name_idx` ON `email_templates` (`name`);--> statement-breakpoint
CREATE INDEX `extracted_faqs_merchant_id_idx` ON `extracted_faqs` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `extracted_faqs_category_idx` ON `extracted_faqs` (`category`);--> statement-breakpoint
CREATE INDEX `extracted_faqs_page_id_idx` ON `extracted_faqs` (`page_id`);--> statement-breakpoint
CREATE INDEX `extracted_products_analysis_id_idx` ON `extracted_products` (`analysis_id`);--> statement-breakpoint
CREATE INDEX `extracted_products_merchant_id_idx` ON `extracted_products` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `invoices_invoice_number_unique` ON `invoices` (`invoice_number`);--> statement-breakpoint
CREATE INDEX `loyalty_points_merchant_customer_unique` ON `loyalty_points` (`merchant_id`,`customer_phone`);--> statement-breakpoint
CREATE INDEX `loyalty_redemptions_customer_idx` ON `loyalty_redemptions` (`merchant_id`,`customer_phone`);--> statement-breakpoint
CREATE INDEX `loyalty_redemptions_reward_idx` ON `loyalty_redemptions` (`reward_id`);--> statement-breakpoint
CREATE INDEX `loyalty_settings_merchant_id_unique` ON `loyalty_settings` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `loyalty_transactions_customer_idx` ON `loyalty_transactions` (`merchant_id`,`customer_phone`);--> statement-breakpoint
CREATE INDEX `loyalty_transactions_order_idx` ON `loyalty_transactions` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_payments_tap_charge_id_idx` ON `order_payments` (`tap_charge_id`);--> statement-breakpoint
CREATE INDEX `order_payments_merchant_id_idx` ON `order_payments` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `order_payments_order_id_idx` ON `order_payments` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_payments_booking_id_idx` ON `order_payments` (`booking_id`);--> statement-breakpoint
CREATE INDEX `password_reset_tokens_token_unique` ON `password_reset_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `payment_gateways_gateway_unique` ON `payment_gateways` (`gateway`);--> statement-breakpoint
CREATE INDEX `payment_links_link_id_unique` ON `payment_links` (`link_id`);--> statement-breakpoint
CREATE INDEX `payment_links_merchant_id_idx` ON `payment_links` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `payment_refunds_payment_id_idx` ON `payment_refunds` (`payment_id`);--> statement-breakpoint
CREATE INDEX `payment_refunds_tap_refund_id_idx` ON `payment_refunds` (`tap_refund_id`);--> statement-breakpoint
CREATE INDEX `referral_codes_code_unique` ON `referral_codes` (`code`);--> statement-breakpoint
CREATE INDEX `salla_connections_merchantId_unique` ON `salla_connections` (`merchantId`);--> statement-breakpoint
CREATE INDEX `sari_personality_settings_merchant_id_unique` ON `sari_personality_settings` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `signup_prompt_variants_variant_id_unique` ON `signup_prompt_variants` (`variant_id`);--> statement-breakpoint
CREATE INDEX `template_translations_template_id_idx` ON `template_translations` (`template_id`);--> statement-breakpoint
CREATE INDEX `template_translations_language_idx` ON `template_translations` (`language`);--> statement-breakpoint
CREATE INDEX `users_openId_unique` ON `users` (`openId`);--> statement-breakpoint
CREATE INDEX `website_analyses_merchant_id_idx` ON `website_analyses` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `website_analyses_url_idx` ON `website_analyses` (`url`);--> statement-breakpoint
CREATE INDEX `website_insights_analysis_id_idx` ON `website_insights` (`analysis_id`);--> statement-breakpoint
CREATE INDEX `website_insights_merchant_id_idx` ON `website_insights` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `website_insights_category_idx` ON `website_insights` (`category`);--> statement-breakpoint
CREATE INDEX `whatsappConnections_merchantId_unique` ON `whatsappConnections` (`merchantId`);--> statement-breakpoint
CREATE INDEX `woocommerce_orders_merchant_id_idx` ON `woocommerce_orders` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `woocommerce_orders_order_id_idx` ON `woocommerce_orders` (`order_id`);--> statement-breakpoint
CREATE INDEX `woocommerce_orders_woo_order_id_idx` ON `woocommerce_orders` (`woo_order_id`);--> statement-breakpoint
CREATE INDEX `woocommerce_orders_status_idx` ON `woocommerce_orders` (`status`);--> statement-breakpoint
CREATE INDEX `woocommerce_products_merchant_id_idx` ON `woocommerce_products` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `woocommerce_products_product_id_idx` ON `woocommerce_products` (`product_id`);--> statement-breakpoint
CREATE INDEX `woocommerce_products_woo_product_id_idx` ON `woocommerce_products` (`woo_product_id`);--> statement-breakpoint
CREATE INDEX `woocommerce_settings_merchant_id_idx` ON `woocommerce_settings` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `woocommerce_sync_logs_merchant_id_idx` ON `woocommerce_sync_logs` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `woocommerce_sync_logs_sync_type_idx` ON `woocommerce_sync_logs` (`sync_type`);--> statement-breakpoint
CREATE INDEX `woocommerce_sync_logs_status_idx` ON `woocommerce_sync_logs` (`status`);--> statement-breakpoint
CREATE INDEX `woocommerce_webhooks_merchant_id_idx` ON `woocommerce_webhooks` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `woocommerce_webhooks_event_type_idx` ON `woocommerce_webhooks` (`event_type`);--> statement-breakpoint
CREATE INDEX `woocommerce_webhooks_status_idx` ON `woocommerce_webhooks` (`status`);--> statement-breakpoint
CREATE INDEX `zid_orders_merchant_id_idx` ON `zid_orders` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `zid_orders_zid_order_id_idx` ON `zid_orders` (`zid_order_id`);--> statement-breakpoint
CREATE INDEX `zid_orders_sari_order_id_idx` ON `zid_orders` (`sari_order_id`);--> statement-breakpoint
CREATE INDEX `zid_orders_customer_phone_idx` ON `zid_orders` (`customer_phone`);--> statement-breakpoint
CREATE INDEX `zid_products_merchant_id_idx` ON `zid_products` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `zid_products_zid_product_id_idx` ON `zid_products` (`zid_product_id`);--> statement-breakpoint
CREATE INDEX `zid_products_sari_product_id_idx` ON `zid_products` (`sari_product_id`);--> statement-breakpoint
CREATE INDEX `zid_webhooks_merchant_id_idx` ON `zid_webhooks` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `zid_webhooks_event_type_idx` ON `zid_webhooks` (`event_type`);--> statement-breakpoint
CREATE INDEX `zid_webhooks_status_idx` ON `zid_webhooks` (`status`);--> statement-breakpoint
CREATE INDEX `notification_logs_merchant_id_idx` ON `notification_logs` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `notification_logs_type_idx` ON `notification_logs` (`type`);--> statement-breakpoint
CREATE INDEX `notification_logs_status_idx` ON `notification_logs` (`status`);--> statement-breakpoint
CREATE INDEX `notification_logs_created_at_idx` ON `notification_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `notification_preferences_merchant_id_idx` ON `notification_preferences` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `notification_records_merchant_id_idx` ON `notification_records` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `notification_records_key_idx` ON `notification_records` (`notification_key`);--> statement-breakpoint
CREATE INDEX `notification_records_type_idx` ON `notification_records` (`type`);--> statement-breakpoint
CREATE INDEX `merchant_addons_merchant_id_idx` ON `merchant_addons` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `merchant_addons_addon_id_idx` ON `merchant_addons` (`addon_id`);--> statement-breakpoint
CREATE INDEX `merchant_addons_subscription_id_idx` ON `merchant_addons` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `merchant_addons_is_active_idx` ON `merchant_addons` (`is_active`);--> statement-breakpoint
CREATE INDEX `merchant_subscriptions_merchant_id_idx` ON `merchant_subscriptions` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `merchant_subscriptions_plan_id_idx` ON `merchant_subscriptions` (`plan_id`);--> statement-breakpoint
CREATE INDEX `merchant_subscriptions_status_idx` ON `merchant_subscriptions` (`status`);--> statement-breakpoint
CREATE INDEX `merchant_subscriptions_end_date_idx` ON `merchant_subscriptions` (`end_date`);--> statement-breakpoint
CREATE INDEX `payment_transactions_merchant_id_idx` ON `payment_transactions` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `payment_transactions_subscription_id_idx` ON `payment_transactions` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `payment_transactions_status_idx` ON `payment_transactions` (`status`);--> statement-breakpoint
CREATE INDEX `payment_transactions_tap_charge_id_idx` ON `payment_transactions` (`tap_charge_id`);--> statement-breakpoint
CREATE INDEX `payment_transactions_type_idx` ON `payment_transactions` (`type`);--> statement-breakpoint
CREATE INDEX `subscription_addons_is_active_idx` ON `subscription_addons` (`is_active`);--> statement-breakpoint
CREATE INDEX `subscription_addons_type_idx` ON `subscription_addons` (`type`);--> statement-breakpoint
CREATE INDEX `subscription_plans_is_active_idx` ON `subscription_plans` (`is_active`);--> statement-breakpoint
CREATE INDEX `subscription_plans_sort_order_idx` ON `subscription_plans` (`sort_order`);--> statement-breakpoint
CREATE INDEX `coupon_usage_log_coupon_id_idx` ON `coupon_usage_log` (`coupon_id`);--> statement-breakpoint
CREATE INDEX `coupon_usage_log_merchant_id_idx` ON `coupon_usage_log` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `coupon_usage_log_used_at_idx` ON `coupon_usage_log` (`used_at`);--> statement-breakpoint
CREATE INDEX `discount_coupons_code_idx` ON `discount_coupons` (`code`);--> statement-breakpoint
CREATE INDEX `discount_coupons_is_active_idx` ON `discount_coupons` (`is_active`);--> statement-breakpoint
CREATE INDEX `discount_coupons_valid_from_idx` ON `discount_coupons` (`valid_from`);--> statement-breakpoint
CREATE INDEX `discount_coupons_valid_until_idx` ON `discount_coupons` (`valid_until`);