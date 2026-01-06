ALTER TABLE `orders` ADD `currency` enum('SAR','USD') DEFAULT 'SAR' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `currency` enum('SAR','USD') DEFAULT 'SAR' NOT NULL;