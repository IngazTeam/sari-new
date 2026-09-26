-- Prospective facts only. Historical payments are not assigned a new verification time.
-- IDs other than merchant are immutable references: source retention must not erase measurement evidence.
CREATE TABLE IF NOT EXISTS `ai_sales_payment_facts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `payment_id` int NOT NULL,
  `event_type` enum('captured','refunded') NOT NULL,
  `target_kind` enum('order','booking') NOT NULL,
  `target_id` int NOT NULL,
  `customer_key` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `fact_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `snapshot` json NOT NULL,
  `attribution_state` enum('pending','attributed','unassigned','review') NOT NULL DEFAULT 'pending',
  `attribution_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `attribution` json DEFAULT NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `next_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  `last_error` varchar(40) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_payment_event` (`merchant_id`,`payment_id`,`event_type`),
  UNIQUE KEY `uq_sales_target_event` (`merchant_id`,`target_kind`,`target_id`,`event_type`),
  KEY `idx_sales_payment_pending` (`attribution_state`,`next_at`,`id`),
  CONSTRAINT `fk_sales_payment_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_sales_payment_attribution` CHECK (
    `attempts` BETWEEN 0 AND 8 AND (
      (`attribution_state`='pending' AND `next_at` IS NOT NULL AND `attribution` IS NULL AND `attribution_digest` IS NULL)
      OR (`attribution_state`='attributed' AND `next_at` IS NULL AND `attribution` IS NOT NULL AND `attribution_digest` IS NOT NULL)
      OR (`attribution_state` IN ('unassigned','review') AND `next_at` IS NULL AND `attribution` IS NULL AND `attribution_digest` IS NULL)
    )
  )
);
