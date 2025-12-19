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
ALTER TABLE `services` ADD `category_id` int;--> statement-breakpoint
ALTER TABLE `staff_members` ADD `specialization` varchar(255);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `service_ids` text;--> statement-breakpoint
ALTER TABLE `staff_members` ADD `avatar` varchar(500);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `staff_members` ADD `updated_at` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `service_categories` ADD CONSTRAINT `service_categories_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `services` ADD CONSTRAINT `services_category_id_service_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `service_categories`(`id`) ON DELETE set null ON UPDATE no action;