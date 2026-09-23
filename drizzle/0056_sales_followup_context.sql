ALTER TABLE `sales_followups`
  ADD COLUMN `anchor_message_id` INT NULL,
  ADD COLUMN `claimed_at` DATETIME(3) NULL;
