ALTER TABLE `ai_interaction_jobs`
  ADD COLUMN `reply_origin` varchar(16) NOT NULL DEFAULT 'legacy',
  ADD COLUMN `reply_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  ADD COLUMN `reply_plan` json DEFAULT NULL,
  ADD COLUMN `sales_delivery_id` bigint unsigned DEFAULT NULL,
  ADD COLUMN `outgoing_message_reference` int DEFAULT NULL,
  ADD CONSTRAINT `ck_interaction_reply_owner` CHECK (
    (`reply_origin`='legacy' AND `reply_digest` IS NULL AND `reply_plan` IS NULL AND `sales_delivery_id` IS NULL AND `outgoing_message_reference` IS NULL)
    OR (`reply_origin`='ordinary' AND `reply_digest` IS NOT NULL AND `reply_plan` IS NOT NULL AND `sales_delivery_id` IS NULL AND `outgoing_message_reference` IS NULL)
    OR (`reply_origin`='reviewed' AND `reply_digest` IS NOT NULL AND `reply_plan` IS NULL AND `sales_delivery_id` IS NOT NULL AND `sales_delivery_id`>0
      AND `state`='reviewed_reserved' AND (`outgoing_message_reference` IS NULL OR `outgoing_message_reference`>0))
  );
