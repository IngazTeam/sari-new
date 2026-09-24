CREATE TABLE `ai_learning_policy_reviews` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `proposal_id` bigint unsigned NOT NULL,
  `revision` bigint unsigned NOT NULL,
  `request_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `payload_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `source_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `suite_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `actor_user_id` int DEFAULT NULL,
  `proposal_snapshot` json NOT NULL,
  `assessment` json NOT NULL,
  `outcome` varchar(16) NOT NULL,
  `passed_cases` int unsigned NOT NULL,
  `regressions` int unsigned NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_learning_review_request` (`merchant_id`, `request_id`),
  UNIQUE KEY `uq_learning_review_revision` (`merchant_id`, `proposal_id`, `revision`),
  CONSTRAINT `fk_learning_review_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_learning_review_proposal` FOREIGN KEY (`proposal_id`) REFERENCES `ai_learning_proposals` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_learning_review_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `ck_learning_review_result` CHECK (`revision` BETWEEN 1 AND 9007199254740991 AND `passed_cases` BETWEEN 0 AND 8
    AND `regressions` BETWEEN 0 AND 8 - `passed_cases`
    AND ((`outcome` = 'passed' AND `passed_cases` = 8) OR (`outcome` = 'failed' AND `passed_cases` < 8)))
);
