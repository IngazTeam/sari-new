CREATE TABLE IF NOT EXISTS `ai_conversation_understanding` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` INT NOT NULL,
  `conversation_id` INT NOT NULL,
  `incoming_message_id` INT NOT NULL,
  `ownership_version` INT NOT NULL,
  `memory_cutoff` INT NOT NULL,
  `source_digest` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `context_digest` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `message_evidence` JSON NOT NULL,
  `state` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `attempt_token` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `result_json` JSON NULL,
  `result_digest` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_understanding_message` (`merchant_id`,`incoming_message_id`),
  KEY `idx_understanding_conversation` (`merchant_id`,`conversation_id`,`incoming_message_id`),
  CONSTRAINT `fk_understanding_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_understanding_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_understanding_message` FOREIGN KEY (`incoming_message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_understanding_state` CHECK (
    `state` IN ('analyzing','ready','failed') AND `ownership_version` >= 0 AND `memory_cutoff` >= 0
    AND ((`state`='ready' AND `result_json` IS NOT NULL AND `result_digest` IS NOT NULL)
      OR (`state` IN ('analyzing','failed') AND `result_json` IS NULL AND `result_digest` IS NULL))
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
