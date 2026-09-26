-- Independent immutable links. Never rewrite or backfill order/payment evidence.
-- Source rows may be removed without deleting the recorded identity attestation.
CREATE TABLE IF NOT EXISTS `ai_sales_order_links` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `order_fact_id` bigint unsigned NOT NULL,
  `order_fact_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `order_key` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `source_row_id` int NOT NULL,
  `local_order_id` int NOT NULL,
  `link_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `snapshot` json NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_link_fact` (`merchant_id`,`order_fact_id`),
  UNIQUE KEY `uq_sales_link_order` (`merchant_id`,`order_key`),
  UNIQUE KEY `uq_sales_link_local` (`merchant_id`,`local_order_id`),
  CONSTRAINT `fk_sales_link_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);
