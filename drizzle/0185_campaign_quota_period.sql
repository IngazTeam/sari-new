ALTER TABLE `campaign_delivery_outbox`
  ADD COLUMN `quota_period_start` datetime(3) NULL AFTER `quota_reserved`,
  ADD CONSTRAINT `campaign_delivery_outbox_quota_period_check` CHECK (
    `quota_reserved` = 1 OR `quota_period_start` IS NULL
  );
