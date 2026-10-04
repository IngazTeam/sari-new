-- Preserve every existing record. Duplicate merchants require an explicit, backed-up
-- reconciliation before this migration; never pick or delete a preference silently.
ALTER TABLE `notification_preferences`
  ADD UNIQUE INDEX `notification_preferences_merchant_unique` (`merchant_id`);
