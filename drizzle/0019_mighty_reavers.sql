CREATE TABLE `zid_customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`zid_customer_id` varchar(255) NOT NULL,
	`name` varchar(255),
	`email` varchar(320),
	`phone` varchar(50),
	`total_orders` int NOT NULL DEFAULT 0,
	`total_spent` decimal(12,2) NOT NULL DEFAULT '0',
	`is_active` tinyint NOT NULL DEFAULT 1,
	`last_order_at` timestamp,
	`last_synced_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `zid_customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `zid_customers_merchant_customer_unique` UNIQUE(`merchant_id`,`zid_customer_id`)
);
--> statement-breakpoint
UPDATE `zid_orders` AS older
INNER JOIN `zid_orders` AS newer
  ON newer.`merchant_id` = older.`merchant_id`
 AND newer.`zid_order_id` = older.`zid_order_id`
 AND newer.`id` > older.`id`
SET newer.`sari_order_id` = COALESCE(newer.`sari_order_id`, older.`sari_order_id`);--> statement-breakpoint
DELETE older
FROM `zid_orders` AS older
INNER JOIN `zid_orders` AS newer
  ON newer.`merchant_id` = older.`merchant_id`
 AND newer.`zid_order_id` = older.`zid_order_id`
 AND newer.`id` > older.`id`;--> statement-breakpoint
UPDATE `zid_products` AS older
INNER JOIN `zid_products` AS newer
  ON newer.`merchant_id` = older.`merchant_id`
 AND newer.`zid_product_id` = older.`zid_product_id`
 AND newer.`id` > older.`id`
SET newer.`sari_product_id` = COALESCE(newer.`sari_product_id`, older.`sari_product_id`);--> statement-breakpoint
DELETE older
FROM `zid_products` AS older
INNER JOIN `zid_products` AS newer
  ON newer.`merchant_id` = older.`merchant_id`
 AND newer.`zid_product_id` = older.`zid_product_id`
 AND newer.`id` > older.`id`;--> statement-breakpoint
ALTER TABLE `zid_orders` ADD CONSTRAINT `zid_orders_merchant_order_unique` UNIQUE(`merchant_id`,`zid_order_id`);--> statement-breakpoint
ALTER TABLE `zid_products` ADD CONSTRAINT `zid_products_merchant_product_unique` UNIQUE(`merchant_id`,`zid_product_id`);--> statement-breakpoint
ALTER TABLE `zid_customers` ADD CONSTRAINT `zid_customers_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `zid_customers_merchant_id_idx` ON `zid_customers` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `zid_customers_merchant_phone_idx` ON `zid_customers` (`merchant_id`,`phone`);
