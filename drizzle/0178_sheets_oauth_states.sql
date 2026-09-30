CREATE TABLE IF NOT EXISTS `sheets_oauth_states` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `state_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `session_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `source_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `consumed_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_sheets_oauth_state` (`state_hash`),
  UNIQUE KEY `uq_sheets_oauth_merchant_user` (`merchant_id`,`user_id`),
  CONSTRAINT `fk_sheets_oauth_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sheets_oauth_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
