CREATE TABLE `api_rate_limit_windows` (
	`bucket_hash` varchar(64) NOT NULL,
	`window_started_at` timestamp(3) NOT NULL,
	`expires_at` timestamp(3) NOT NULL,
	`request_count` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `api_rate_limit_windows_bucket_hash` PRIMARY KEY(`bucket_hash`)
);
--> statement-breakpoint
CREATE INDEX `api_rate_limit_windows_expiry_idx` ON `api_rate_limit_windows` (`expires_at`);