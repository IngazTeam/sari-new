ALTER TABLE `ai_interaction_jobs`
  ADD COLUMN `usage_state` varchar(16) NOT NULL DEFAULT 'legacy',
  ADD COLUMN `usage_subscription_id` int DEFAULT NULL,
  ADD COLUMN `usage_period_start` datetime(3) DEFAULT NULL,
  ADD COLUMN `usage_units` int unsigned NOT NULL DEFAULT 0,
  ADD COLUMN `usage_reserved_at` datetime(3) DEFAULT NULL,
  ADD COLUMN `usage_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  ADD COLUMN `usage_settled_at` datetime(3) DEFAULT NULL,
  ADD COLUMN `usage_outbox_id` bigint unsigned DEFAULT NULL,
  ADD COLUMN `usage_provider` varchar(16) DEFAULT NULL,
  ADD COLUMN `usage_request_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  ADD COLUMN `usage_recovery_at` datetime(3) DEFAULT NULL,
  ADD COLUMN `usage_attempts` int unsigned NOT NULL DEFAULT 0,
  ADD COLUMN `usage_last_error` varchar(32) DEFAULT NULL,
  ADD KEY `idx_ordinary_reply_usage_holds` (`merchant_id`,`usage_subscription_id`,`usage_period_start`,`usage_state`),
  ADD KEY `idx_ordinary_reply_usage_recovery` (`usage_state`,`usage_recovery_at`,`id`),
  ADD KEY `idx_ordinary_reply_usage_outbox` (`usage_outbox_id`,`usage_state`),
  ADD CONSTRAINT `ck_ordinary_reply_usage` CHECK (
    (`usage_state` IN ('legacy','pending') AND (`usage_state`='legacy' OR `reply_origin`='ordinary')
      AND `usage_units`=0 AND `usage_subscription_id` IS NULL AND `usage_period_start` IS NULL AND `usage_reserved_at` IS NULL
      AND `usage_digest` IS NULL AND `usage_settled_at` IS NULL AND `usage_outbox_id` IS NULL AND `usage_provider` IS NULL
      AND `usage_request_digest` IS NULL AND `usage_recovery_at` IS NULL AND `usage_attempts`=0 AND `usage_last_error` IS NULL)
    OR (`usage_state` IN ('held','charged','historical','released') AND `reply_origin`='ordinary' AND `usage_units`=2
      AND `usage_subscription_id` IS NOT NULL AND `usage_subscription_id`>0 AND `usage_period_start` IS NOT NULL AND `usage_reserved_at` IS NOT NULL
      AND `usage_digest` IS NOT NULL AND CHAR_LENGTH(`usage_digest`)=64 AND `usage_outbox_id` IS NOT NULL AND `usage_outbox_id`>0
      AND `usage_provider` IS NOT NULL AND `usage_provider` IN ('green_api','meta_cloud','mock') AND `usage_request_digest` IS NOT NULL
      AND CHAR_LENGTH(`usage_request_digest`)=64 AND `usage_attempts`<=8
      AND (`usage_last_error` IS NULL OR `usage_last_error` IN ('transport_unknown','evidence_unavailable'))
      AND ((`usage_state`='held' AND `usage_settled_at` IS NULL)
        OR (`usage_state`<>'held' AND `usage_settled_at` IS NOT NULL AND `usage_recovery_at` IS NULL)))
  );
