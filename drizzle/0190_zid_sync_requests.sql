CREATE TABLE IF NOT EXISTS `zid_sync_requests` (
 `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `merchant_id` INT NOT NULL,
 `actor_id` INT NOT NULL,
 `request_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `connection_revision` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `execution_revision` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `resource` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `resource_mask` TINYINT NOT NULL,
 `state` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `lease_until` DATETIME(3) NOT NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY `uq_zid_sync_request` (`merchant_id`,`request_id`),
 KEY `idx_zid_sync_active` (`merchant_id`,`state`,`lease_until`),
 KEY `idx_zid_sync_rate` (`merchant_id`,`created_at`),
 CONSTRAINT `fk_zid_sync_request_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
 CONSTRAINT `fk_zid_sync_request_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 CONSTRAINT `chk_zid_sync_request_state` CHECK (`state` IN ('pending','success','failed','interrupted')),
 CONSTRAINT `chk_zid_sync_request_resource` CHECK (`resource` IN ('all','products','orders','customers') AND `resource_mask` BETWEEN 1 AND 7)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `zid_sync_request_resources` (
 `request_pk` INT NOT NULL,
 `resource` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `log_id` INT NULL,
 `started` TINYINT NOT NULL DEFAULT 0,
 PRIMARY KEY (`request_pk`,`resource`),
 UNIQUE KEY `uq_zid_sync_request_log` (`log_id`),
 CONSTRAINT `fk_zid_sync_resource_request` FOREIGN KEY (`request_pk`) REFERENCES `zid_sync_requests` (`id`) ON DELETE CASCADE,
 CONSTRAINT `fk_zid_sync_resource_log` FOREIGN KEY (`log_id`) REFERENCES `zid_sync_logs` (`id`) ON DELETE SET NULL,
 CONSTRAINT `chk_zid_sync_resource` CHECK (`resource` IN ('products','orders','customers') AND `started` IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
