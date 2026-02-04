-- Fix schema - creating essential tables with PRIMARY KEY

-- Users table
CREATE TABLE IF NOT EXISTS `users` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`password` varchar(255),
	`trial_start_date` timestamp,
	`trial_end_date` timestamp,
	`is_trial_active` tinyint NOT NULL DEFAULT 0,
	`whatsapp_connected` tinyint NOT NULL DEFAULT 0,
	INDEX `users_openId_unique` (`openId`)
);

-- Merchants table
CREATE TABLE IF NOT EXISTS `merchants` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`userId` int NOT NULL,
	`businessName` varchar(255) NOT NULL,
	`phone` varchar(20),
	`status` enum('active','suspended','pending') NOT NULL DEFAULT 'pending',
	`subscriptionId` int,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
	`platform_type` enum('salla', 'zid', 'shopify', 'woocommerce', 'custom', 'unknown'),
	`last_analysis_date` timestamp,
	`analysis_status` enum('pending', 'analyzing', 'completed', 'failed') DEFAULT 'pending',
	`current_subscription_id` int,
	`subscription_status` enum('none', 'trial', 'active', 'expired') DEFAULT 'none',
	`trial_started_at` timestamp,
	`trial_ends_at` timestamp,
	`max_customers_allowed` int DEFAULT 0,
	`current_customers_count` int DEFAULT 0
);

-- Sessions table
CREATE TABLE IF NOT EXISTS `sessions` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`userId` int NOT NULL,
	`token` varchar(255) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE KEY `sessions_token_unique` (`token`)
);

-- Settings table
CREATE TABLE IF NOT EXISTS `settings` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`key` varchar(255) NOT NULL,
	`value` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	UNIQUE KEY `settings_key_unique` (`key`)
);

-- Campaigns table
CREATE TABLE IF NOT EXISTS `campaigns` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`merchantId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`imageUrl` varchar(500),
	`targetAudience` text,
	`status` enum('draft','scheduled','sending','completed','failed') NOT NULL DEFAULT 'draft',
	`scheduledAt` timestamp,
	`sentCount` int NOT NULL DEFAULT 0,
	`totalRecipients` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Scheduled Messages table
CREATE TABLE IF NOT EXISTS `scheduled_messages` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`merchant_id` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`day_of_week` int NOT NULL,
	`time` varchar(5) NOT NULL,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`last_sent_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Conversations table
CREATE TABLE IF NOT EXISTS `conversations` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`merchantId` int NOT NULL,
	`customerPhone` varchar(20) NOT NULL,
	`customerName` varchar(255),
	`status` enum('active','closed','archived') NOT NULL DEFAULT 'active',
	`lastMessageAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`lastActivityAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`purchaseCount` int NOT NULL DEFAULT 0,
	`totalSpent` int NOT NULL DEFAULT 0
);

-- Messages table
CREATE TABLE IF NOT EXISTS `messages` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
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
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE IF NOT EXISTS `products` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
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
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`sallaProductId` varchar(100),
	`lastSyncedAt` timestamp
);

-- Orders table
CREATE TABLE IF NOT EXISTS `orders` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
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
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`isGift` tinyint NOT NULL DEFAULT 0,
	`giftRecipientName` varchar(255),
	`giftMessage` text,
	`reviewRequested` tinyint NOT NULL DEFAULT 0,
	`reviewRequestedAt` timestamp
);

-- Plans table
CREATE TABLE IF NOT EXISTS `plans` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`name` varchar(100) NOT NULL,
	`nameAr` varchar(100) NOT NULL,
	`priceMonthly` int NOT NULL,
	`conversationLimit` int NOT NULL,
	`voiceMessageLimit` int NOT NULL,
	`features` text,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS `subscriptions` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`merchantId` int NOT NULL,
	`planId` int NOT NULL,
	`status` enum('active','expired','cancelled','pending','trial') NOT NULL DEFAULT 'pending',
	`conversationsUsed` int NOT NULL DEFAULT 0,
	`voiceMessagesUsed` int NOT NULL DEFAULT 0,
	`startDate` timestamp NOT NULL,
	`endDate` timestamp NOT NULL,
	`autoRenew` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`messagesUsed` int NOT NULL DEFAULT 0,
	`lastResetAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp Instances table
CREATE TABLE IF NOT EXISTS `whatsapp_instances` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
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
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Bot Settings table
CREATE TABLE IF NOT EXISTS `bot_settings` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
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
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	INDEX `bot_settings_merchant_id_unique` (`merchant_id`)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS `notifications` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`userId` int NOT NULL,
	`type` enum('info','success','warning','error') NOT NULL DEFAULT 'info',
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`link` varchar(500),
	`isRead` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Analytics table
CREATE TABLE IF NOT EXISTS `analytics` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`merchantId` int NOT NULL,
	`date` timestamp NOT NULL,
	`conversationsCount` int NOT NULL DEFAULT 0,
	`messagesCount` int NOT NULL DEFAULT 0,
	`voiceMessagesCount` int NOT NULL DEFAULT 0,
	`campaignsSent` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Leads table (if not exists from migrations)
CREATE TABLE IF NOT EXISTS `leads` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`name` varchar(255),
	`email` varchar(255),
	`phone` varchar(50),
	`source` varchar(100),
	`status` varchar(50) DEFAULT 'new',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- SEO Settings table
CREATE TABLE IF NOT EXISTS `seoSettings` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`key` varchar(255) NOT NULL,
	`value` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	UNIQUE KEY `seoSettings_key_unique` (`key`)
);

-- Global SEO Settings table
CREATE TABLE IF NOT EXISTS `globalSeoSettings` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`key` varchar(255) NOT NULL,
	`value` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	UNIQUE KEY `globalSeoSettings_key_unique` (`key`)
);

-- Insert default admin user if not exists
INSERT IGNORE INTO `users` (`id`, `openId`, `name`, `email`, `password`, `role`) 
VALUES (1, 'admin-default', 'Admin', 'admin@sari.chat', '$2a$10$dummyhash', 'admin');
