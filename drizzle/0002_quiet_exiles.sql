CREATE TABLE `promotions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`banner_image_url` varchar(500),
	`type` enum('percentage','fixed','bundle','free_shipping','custom') NOT NULL,
	`value` int,
	`scope` enum('all','products','categories') NOT NULL DEFAULT 'all',
	`product_ids` text,
	`category_ids` text,
	`min_order_amount` int,
	`min_quantity` int,
	`auto_discount_code_id` int,
	`starts_at` timestamp,
	`expires_at` timestamp,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`view_count` int NOT NULL DEFAULT 0,
	`click_count` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `promotions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `promotions` ADD CONSTRAINT `promotions_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_promotions_merchant` ON `promotions` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `idx_promotions_active` ON `promotions` (`is_active`);