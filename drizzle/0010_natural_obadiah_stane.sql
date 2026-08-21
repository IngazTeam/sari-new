CREATE TABLE `auth_login_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email_hash` varchar(64) NOT NULL,
	`ip_hash` varchar(64) NOT NULL,
	`attempted_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auth_login_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `auth_login_attempts_email_time_idx` ON `auth_login_attempts` (`email_hash`,`attempted_at`);--> statement-breakpoint
CREATE INDEX `auth_login_attempts_ip_time_idx` ON `auth_login_attempts` (`ip_hash`,`attempted_at`);--> statement-breakpoint
CREATE INDEX `auth_login_attempts_time_idx` ON `auth_login_attempts` (`attempted_at`);