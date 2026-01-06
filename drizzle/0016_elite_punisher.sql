CREATE TABLE `push_notification_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`subscription_id` int,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`url` varchar(500),
	`status` varchar(50) NOT NULL DEFAULT 'pending',
	`error` text,
	`sent_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `push_notification_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` varchar(500),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `push_notification_logs` ADD CONSTRAINT `push_notification_logs_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `push_notification_logs` ADD CONSTRAINT `push_notification_logs_subscription_id_push_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `push_subscriptions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;