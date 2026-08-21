CREATE TABLE IF NOT EXISTS `message_delivery_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`instance_id` varchar(255),
	`customer_phone` varchar(30) NOT NULL,
	`customer_name` varchar(255),
	`message_type` enum('text','voice','image','video','document','other') NOT NULL DEFAULT 'text',
	`status` enum('delivered','failed','dropped') NOT NULL,
	`failure_reason` varchar(255),
	`failure_details` text,
	`response_time_ms` int,
	`source` enum('webhook','polling') NOT NULL DEFAULT 'webhook',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `message_delivery_log_id` PRIMARY KEY(`id`),
	INDEX `idx_mdl_merchant` (`merchant_id`),
	INDEX `idx_mdl_status` (`status`),
	INDEX `idx_mdl_created` (`created_at`),
	INDEX `idx_mdl_merchant_status` (`merchant_id`,`status`,`created_at`)
);
