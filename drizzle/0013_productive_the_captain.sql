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
ALTER TABLE `zid_orders` ADD CONSTRAINT `zid_orders_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `zid_orders` ADD CONSTRAINT `zid_orders_sari_order_id_orders_id_fk` FOREIGN KEY (`sari_order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `zid_products` ADD CONSTRAINT `zid_products_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `zid_products` ADD CONSTRAINT `zid_products_sari_product_id_products_id_fk` FOREIGN KEY (`sari_product_id`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `zid_webhooks` ADD CONSTRAINT `zid_webhooks_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `zid_orders_merchant_id_idx` ON `zid_orders` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `zid_orders_zid_order_id_idx` ON `zid_orders` (`zid_order_id`);--> statement-breakpoint
CREATE INDEX `zid_orders_sari_order_id_idx` ON `zid_orders` (`sari_order_id`);--> statement-breakpoint
CREATE INDEX `zid_orders_customer_phone_idx` ON `zid_orders` (`customer_phone`);--> statement-breakpoint
CREATE INDEX `zid_products_merchant_id_idx` ON `zid_products` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `zid_products_zid_product_id_idx` ON `zid_products` (`zid_product_id`);--> statement-breakpoint
CREATE INDEX `zid_products_sari_product_id_idx` ON `zid_products` (`sari_product_id`);--> statement-breakpoint
CREATE INDEX `zid_webhooks_merchant_id_idx` ON `zid_webhooks` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `zid_webhooks_event_type_idx` ON `zid_webhooks` (`event_type`);--> statement-breakpoint
CREATE INDEX `zid_webhooks_status_idx` ON `zid_webhooks` (`status`);