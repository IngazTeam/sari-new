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
ALTER TABLE `woocommerce_orders` ADD CONSTRAINT `woocommerce_orders_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `woocommerce_orders` ADD CONSTRAINT `woocommerce_orders_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `woocommerce_products` ADD CONSTRAINT `woocommerce_products_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `woocommerce_products` ADD CONSTRAINT `woocommerce_products_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `woocommerce_settings` ADD CONSTRAINT `woocommerce_settings_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `woocommerce_sync_logs` ADD CONSTRAINT `woocommerce_sync_logs_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `woocommerce_webhooks` ADD CONSTRAINT `woocommerce_webhooks_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX `woocommerce_webhooks_status_idx` ON `woocommerce_webhooks` (`status`);