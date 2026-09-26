ALTER TABLE `ai_sales_reply_deliveries`
  ADD COLUMN `projection_state` varchar(16) NOT NULL DEFAULT 'pending',
  ADD COLUMN `projection_token` char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  ADD COLUMN `projection_lease_until` datetime(3) DEFAULT NULL,
  ADD COLUMN `projection_next_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `projection_attempts` int unsigned NOT NULL DEFAULT 0,
  ADD COLUMN `projection_last_error` varchar(40) DEFAULT NULL,
  ADD COLUMN `projection_completed_at` datetime(3) DEFAULT NULL,
  ADD KEY `idx_sales_reply_projection_due` (`state`,`projection_state`,`projection_next_at`,`projection_lease_until`),
  ADD CONSTRAINT `ck_sales_reply_projection` CHECK (
    (`projection_state`='pending' AND `projection_next_at` IS NOT NULL AND `projection_completed_at` IS NULL
      AND ((`projection_token` IS NULL AND `projection_lease_until` IS NULL) OR (`projection_token` IS NOT NULL AND `projection_lease_until` IS NOT NULL)))
    OR (`projection_state`='projected' AND `projection_next_at` IS NULL AND `projection_completed_at` IS NOT NULL AND `projection_token` IS NULL AND `projection_lease_until` IS NULL)
    OR (`projection_state`='review' AND `projection_next_at` IS NULL AND `projection_completed_at` IS NULL AND `projection_token` IS NULL AND `projection_lease_until` IS NULL)
  );
