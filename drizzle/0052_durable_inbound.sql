CREATE TABLE `whatsapp_inbound_jobs` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` int NOT NULL,
  `instance_id` int NOT NULL,
  `event_key` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `partition_key` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `source` varchar(20) NOT NULL,
  `payload_json` json NOT NULL,
  `status` enum('pending','running','completed','review','dismissed') NOT NULL DEFAULT 'pending',
  `lease_token` char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `lease_until` datetime(3) DEFAULT NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `started_at` datetime(3) DEFAULT NULL,
  `reply_plan_json` json DEFAULT NULL,
  `error_code` varchar(100) DEFAULT NULL,
  `resolution_note` varchar(1000) DEFAULT NULL,
  `resolved_by` int DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_inbound_event` (`event_key`),
  KEY `idx_inbound_dispatch` (`status`, `id`),
  KEY `idx_inbound_partition` (`partition_key`, `status`, `id`),
  KEY `idx_inbound_merchant` (`merchant_id`, `id`),
  CONSTRAINT `fk_inbound_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inbound_instance` FOREIGN KEY (`instance_id`) REFERENCES `whatsapp_instances` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `session_contexts` ADD COLUMN `version` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `whatsapp_message_deliveries` ADD COLUMN `request_json` json DEFAULT NULL;
