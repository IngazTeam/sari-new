-- Prospective agreement/order evidence only. Creation is not capture, revenue, or an experiment win.
-- Preserve immutable references when the source quotation, conversation or order is later removed.
CREATE TABLE IF NOT EXISTS `ai_sales_order_facts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `quotation_id` int NOT NULL,
  `provider` enum('local','zid') NOT NULL,
  `local_order_id` int DEFAULT NULL,
  `order_key` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
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
  UNIQUE KEY `uq_sales_order_quote` (`merchant_id`,`quotation_id`),
  UNIQUE KEY `uq_sales_order_identity` (`merchant_id`,`order_key`),
  UNIQUE KEY `uq_sales_order_local` (`merchant_id`,`local_order_id`),
  KEY `idx_sales_order_pending` (`attribution_state`,`next_at`,`id`),
  CONSTRAINT `fk_sales_order_fact_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_sales_order_attribution` CHECK (
    `attempts` BETWEEN 0 AND 8 AND (
      (`attribution_state`='pending' AND `next_at` IS NOT NULL AND `attribution` IS NULL AND `attribution_digest` IS NULL)
      OR (`attribution_state`='attributed' AND `next_at` IS NULL AND `attribution` IS NOT NULL AND `attribution_digest` IS NOT NULL)
      OR (`attribution_state` IN ('unassigned','review') AND `next_at` IS NULL AND `attribution` IS NULL AND `attribution_digest` IS NULL)
    )
  )
);
