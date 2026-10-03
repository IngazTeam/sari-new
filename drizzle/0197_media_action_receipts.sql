CREATE TABLE IF NOT EXISTS `media_action_receipts` (
 `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `merchant_id` INT NOT NULL,
 `actor_id` INT NOT NULL,
 `request_key` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `request_digest` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 `kind` ENUM('upload','remove') NULL,
 `state` ENUM('uploading','uploaded','removed','cancelled') NOT NULL,
 `reserved_bytes` INT NOT NULL DEFAULT 0,
 `metadata_json` JSON NULL,
 `result_json` JSON NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY `uq_media_request` (`merchant_id`,`request_key`),
 KEY `idx_media_pending` (`merchant_id`,`state`),
 CONSTRAINT `fk_media_receipt_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
