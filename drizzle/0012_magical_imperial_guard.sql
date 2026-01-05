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
ALTER TABLE `zid_settings` ADD CONSTRAINT `zid_settings_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `zid_sync_logs` ADD CONSTRAINT `zid_sync_logs_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;