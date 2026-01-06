CREATE TABLE `notification_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`type` enum('new_order','new_message','appointment','order_status','missed_message','whatsapp_disconnect','weekly_report','custom') NOT NULL,
	`method` enum('push','email','both') NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`url` varchar(500),
	`status` enum('pending','sent','failed','cancelled') NOT NULL DEFAULT 'pending',
	`error` text,
	`metadata` text,
	`sent_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notification_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`new_orders_enabled` boolean NOT NULL DEFAULT true,
	`new_messages_enabled` boolean NOT NULL DEFAULT true,
	`appointments_enabled` boolean NOT NULL DEFAULT true,
	`order_status_enabled` boolean NOT NULL DEFAULT true,
	`missed_messages_enabled` boolean NOT NULL DEFAULT true,
	`whatsapp_disconnect_enabled` boolean NOT NULL DEFAULT true,
	`preferred_method` enum('push','email','both') NOT NULL DEFAULT 'both',
	`quiet_hours_enabled` boolean NOT NULL DEFAULT false,
	`quiet_hours_start` varchar(5) DEFAULT '22:00',
	`quiet_hours_end` varchar(5) DEFAULT '08:00',
	`instant_notifications` boolean NOT NULL DEFAULT true,
	`batch_notifications` boolean NOT NULL DEFAULT false,
	`batch_interval` int DEFAULT 30,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_preferences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`new_orders_global_enabled` boolean NOT NULL DEFAULT true,
	`new_messages_global_enabled` boolean NOT NULL DEFAULT true,
	`appointments_global_enabled` boolean NOT NULL DEFAULT true,
	`order_status_global_enabled` boolean NOT NULL DEFAULT true,
	`missed_messages_global_enabled` boolean NOT NULL DEFAULT true,
	`whatsapp_disconnect_global_enabled` boolean NOT NULL DEFAULT true,
	`weekly_reports_global_enabled` boolean NOT NULL DEFAULT true,
	`weekly_report_day` int NOT NULL DEFAULT 0,
	`weekly_report_time` varchar(5) NOT NULL DEFAULT '09:00',
	`admin_email` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `email_logs` ADD `email_type` varchar(100);--> statement-breakpoint
ALTER TABLE `email_logs` ADD `merchant_id` int;--> statement-breakpoint
ALTER TABLE `email_logs` ADD `metadata` text;--> statement-breakpoint
ALTER TABLE `notification_logs` ADD CONSTRAINT `notification_logs_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `notification_logs_merchant_id_idx` ON `notification_logs` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `notification_logs_type_idx` ON `notification_logs` (`type`);--> statement-breakpoint
CREATE INDEX `notification_logs_status_idx` ON `notification_logs` (`status`);--> statement-breakpoint
CREATE INDEX `notification_logs_created_at_idx` ON `notification_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `notification_preferences_merchant_id_idx` ON `notification_preferences` (`merchant_id`);