CREATE TABLE `ai_sales_experiment_protocols` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `candidate_id` bigint unsigned NOT NULL,
  `request_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `payload_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `artifact_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `protocol_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `protocol` json NOT NULL,
  `state` varchar(16) NOT NULL DEFAULT 'registered',
  `active_slot` int DEFAULT 1,
  `actor_user_id` int DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_protocol_request` (`merchant_id`,`request_id`),
  UNIQUE KEY `uq_sales_protocol_active` (`merchant_id`,`active_slot`),
  CONSTRAINT `fk_sales_protocol_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sales_protocol_candidate` FOREIGN KEY (`candidate_id`) REFERENCES `ai_learning_policy_candidates` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sales_protocol_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `ck_sales_protocol_state` CHECK ((`state`='registered' AND `active_slot` IS NOT NULL AND `active_slot`=1) OR (`state`='withdrawn' AND `active_slot` IS NULL))
);
--> statement-breakpoint
CREATE TABLE `ai_sales_experiment_withdrawals` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `protocol_id` bigint unsigned NOT NULL,
  `request_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `payload_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `withdrawal_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `withdrawal` json NOT NULL,
  `actor_user_id` int DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_withdrawal_request` (`merchant_id`,`request_id`),
  UNIQUE KEY `uq_sales_withdrawal_protocol` (`protocol_id`),
  CONSTRAINT `fk_sales_withdrawal_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sales_withdrawal_protocol` FOREIGN KEY (`protocol_id`) REFERENCES `ai_sales_experiment_protocols` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sales_withdrawal_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
