CREATE TABLE `email_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`to_email` varchar(255) NOT NULL,
	`subject` varchar(500) NOT NULL,
	`body` text NOT NULL,
	`status` varchar(50) NOT NULL DEFAULT 'pending',
	`error` text,
	`sent_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `smtp_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`host` varchar(255) NOT NULL,
	`port` int NOT NULL DEFAULT 587,
	`username` varchar(255) NOT NULL,
	`password` text NOT NULL,
	`from_email` varchar(255) NOT NULL,
	`from_name` varchar(255) NOT NULL DEFAULT 'ساري',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `smtp_settings_id` PRIMARY KEY(`id`)
);
