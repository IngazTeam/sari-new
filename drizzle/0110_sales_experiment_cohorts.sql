CREATE TABLE `ai_sales_experiment_cohorts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `protocol_id` bigint unsigned NOT NULL,
  `request_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `payload_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `protocol_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `cohort_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `snapshot` json NOT NULL,
  `actor_user_id` int DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_cohort_request` (`merchant_id`,`request_id`),
  UNIQUE KEY `uq_sales_cohort_protocol` (`protocol_id`),
  CONSTRAINT `fk_sales_cohort_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sales_cohort_protocol` FOREIGN KEY (`protocol_id`) REFERENCES `ai_sales_experiment_protocols` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sales_cohort_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
