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
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
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
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
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
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
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
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
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
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
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
	`created_at` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
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
CREATE INDEX `loyalty_points_merchant_customer_unique` ON `loyalty_points` (`merchant_id`,`customer_phone`);--> statement-breakpoint
CREATE INDEX `loyalty_redemptions_customer_idx` ON `loyalty_redemptions` (`merchant_id`,`customer_phone`);--> statement-breakpoint
CREATE INDEX `loyalty_redemptions_reward_idx` ON `loyalty_redemptions` (`reward_id`);--> statement-breakpoint
CREATE INDEX `loyalty_settings_merchant_id_unique` ON `loyalty_settings` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `loyalty_transactions_customer_idx` ON `loyalty_transactions` (`merchant_id`,`customer_phone`);--> statement-breakpoint
CREATE INDEX `loyalty_transactions_order_idx` ON `loyalty_transactions` (`order_id`);