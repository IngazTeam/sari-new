CREATE TABLE `zid_oauth_states` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`user_id` int NOT NULL,
	`state_hash` varchar(64) NOT NULL,
	`session_hash` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`consumed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `zid_oauth_states_id` PRIMARY KEY(`id`),
	CONSTRAINT `zid_oauth_states_state_hash_unique` UNIQUE(`state_hash`)
);
--> statement-breakpoint
ALTER TABLE `zid_oauth_states` ADD CONSTRAINT `zid_oauth_states_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `zid_oauth_states` ADD CONSTRAINT `zid_oauth_states_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `zid_oauth_states_merchant_active_idx` ON `zid_oauth_states` (`merchant_id`,`consumed_at`,`expires_at`);--> statement-breakpoint
CREATE INDEX `zid_oauth_states_expiry_idx` ON `zid_oauth_states` (`expires_at`);