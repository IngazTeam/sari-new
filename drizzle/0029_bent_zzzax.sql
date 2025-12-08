CREATE TABLE `ab_test_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`test_name` varchar(255) NOT NULL,
	`keyword` varchar(255) NOT NULL,
	`variant_a_id` int,
	`variant_a_text` text NOT NULL,
	`variant_a_usage_count` int NOT NULL DEFAULT 0,
	`variant_a_success_count` int NOT NULL DEFAULT 0,
	`variant_b_id` int,
	`variant_b_text` text NOT NULL,
	`variant_b_usage_count` int NOT NULL DEFAULT 0,
	`variant_b_success_count` int NOT NULL DEFAULT 0,
	`status` enum('running','completed','paused') NOT NULL DEFAULT 'running',
	`winner` enum('variant_a','variant_b','no_winner'),
	`confidence_level` int NOT NULL DEFAULT 0,
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ab_test_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `keyword_analysis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`keyword` varchar(255) NOT NULL,
	`category` enum('product','price','shipping','complaint','question','other') NOT NULL,
	`frequency` int NOT NULL DEFAULT 1,
	`sample_messages` text,
	`suggested_response` text,
	`status` enum('new','reviewed','response_created','ignored') NOT NULL DEFAULT 'new',
	`first_seen_at` timestamp NOT NULL DEFAULT (now()),
	`last_seen_at` timestamp NOT NULL DEFAULT (now()),
	`reviewed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `keyword_analysis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `weekly_sentiment_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`week_start_date` timestamp NOT NULL,
	`week_end_date` timestamp NOT NULL,
	`total_conversations` int NOT NULL DEFAULT 0,
	`positive_count` int NOT NULL DEFAULT 0,
	`negative_count` int NOT NULL DEFAULT 0,
	`neutral_count` int NOT NULL DEFAULT 0,
	`positive_percentage` int NOT NULL DEFAULT 0,
	`negative_percentage` int NOT NULL DEFAULT 0,
	`satisfaction_score` int NOT NULL DEFAULT 0,
	`top_keywords` text,
	`top_complaints` text,
	`recommendations` text,
	`email_sent` boolean NOT NULL DEFAULT false,
	`email_sent_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `weekly_sentiment_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ab_test_results` ADD CONSTRAINT `ab_test_results_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ab_test_results` ADD CONSTRAINT `ab_test_results_variant_a_id_quick_responses_id_fk` FOREIGN KEY (`variant_a_id`) REFERENCES `quick_responses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ab_test_results` ADD CONSTRAINT `ab_test_results_variant_b_id_quick_responses_id_fk` FOREIGN KEY (`variant_b_id`) REFERENCES `quick_responses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `keyword_analysis` ADD CONSTRAINT `keyword_analysis_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `weekly_sentiment_reports` ADD CONSTRAINT `weekly_sentiment_reports_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;