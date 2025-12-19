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
ALTER TABLE `order_payments` ADD CONSTRAINT `order_payments_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_payments` ADD CONSTRAINT `order_payments_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_payments` ADD CONSTRAINT `order_payments_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_links` ADD CONSTRAINT `payment_links_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_links` ADD CONSTRAINT `payment_links_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_links` ADD CONSTRAINT `payment_links_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_refunds` ADD CONSTRAINT `payment_refunds_payment_id_order_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `order_payments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_refunds` ADD CONSTRAINT `payment_refunds_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `order_payments_tap_charge_id_idx` ON `order_payments` (`tap_charge_id`);--> statement-breakpoint
CREATE INDEX `order_payments_merchant_id_idx` ON `order_payments` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `order_payments_order_id_idx` ON `order_payments` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_payments_booking_id_idx` ON `order_payments` (`booking_id`);--> statement-breakpoint
CREATE INDEX `payment_links_link_id_unique` ON `payment_links` (`link_id`);--> statement-breakpoint
CREATE INDEX `payment_links_merchant_id_idx` ON `payment_links` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `payment_refunds_payment_id_idx` ON `payment_refunds` (`payment_id`);--> statement-breakpoint
CREATE INDEX `payment_refunds_tap_refund_id_idx` ON `payment_refunds` (`tap_refund_id`);