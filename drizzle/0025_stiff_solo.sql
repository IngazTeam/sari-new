ALTER TABLE `subscriptions` MODIFY COLUMN `status` enum('active','expired','cancelled','pending','trial') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `users` ADD `trial_start_date` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `trial_end_date` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `is_trial_active` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `whatsapp_connected` tinyint DEFAULT 0 NOT NULL;