CREATE TABLE `zid_order_notification_outbox` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`zid_order_id` varchar(255) NOT NULL,
	`event_key` varchar(64) NOT NULL,
	`status` enum('pending','processing','delivered','failed','suppressed','manual_review') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`available_at` timestamp(3) NOT NULL DEFAULT (now()),
	`claimed_at` timestamp(3),
	`delivered_at` timestamp(3),
	`last_error` varchar(100),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `zid_order_notification_outbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `zid_order_notification_event_unique` UNIQUE(`event_key`)
);
--> statement-breakpoint
ALTER TABLE `zid_order_notification_outbox` ADD CONSTRAINT `zid_order_notification_outbox_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_zid_order_notification_dispatch` ON `zid_order_notification_outbox` (`status`,`available_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_zid_order_notification_order` ON `zid_order_notification_outbox` (`merchant_id`,`zid_order_id`);