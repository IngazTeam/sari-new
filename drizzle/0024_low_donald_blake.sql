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
ALTER TABLE `coupon_usage_log` ADD CONSTRAINT `coupon_usage_log_coupon_id_discount_coupons_id_fk` FOREIGN KEY (`coupon_id`) REFERENCES `discount_coupons`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupon_usage_log` ADD CONSTRAINT `coupon_usage_log_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupon_usage_log` ADD CONSTRAINT `coupon_usage_log_plan_id_subscription_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `coupon_usage_log_coupon_id_idx` ON `coupon_usage_log` (`coupon_id`);--> statement-breakpoint
CREATE INDEX `coupon_usage_log_merchant_id_idx` ON `coupon_usage_log` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `coupon_usage_log_used_at_idx` ON `coupon_usage_log` (`used_at`);--> statement-breakpoint
CREATE INDEX `discount_coupons_code_idx` ON `discount_coupons` (`code`);--> statement-breakpoint
CREATE INDEX `discount_coupons_is_active_idx` ON `discount_coupons` (`is_active`);--> statement-breakpoint
CREATE INDEX `discount_coupons_valid_from_idx` ON `discount_coupons` (`valid_from`);--> statement-breakpoint
CREATE INDEX `discount_coupons_valid_until_idx` ON `discount_coupons` (`valid_until`);