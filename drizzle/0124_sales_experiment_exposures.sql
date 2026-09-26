CREATE TABLE `ai_sales_experiment_exposures` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `delivery_id` bigint unsigned NOT NULL,
  `protocol_id` bigint unsigned NOT NULL,
  `assignment_id` bigint unsigned NOT NULL,
  `outbox_id` bigint unsigned NOT NULL,
  `exposure_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `snapshot` json NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_exposure_delivery` (`merchant_id`,`delivery_id`),
  UNIQUE KEY `uq_sales_exposure_outbox` (`merchant_id`,`outbox_id`),
  KEY `idx_sales_exposure_assignment` (`merchant_id`,`protocol_id`,`assignment_id`,`id`),
  CONSTRAINT `fk_sales_exposure_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sales_exposure_delivery` FOREIGN KEY (`delivery_id`) REFERENCES `ai_sales_reply_deliveries` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
-- SQL-only recovery replays existing deterministic projections and adds transport evidence.
-- No new authorization, quota reservation, provider call or customer enrollment is created.
UPDATE `ai_sales_reply_deliveries`
SET `projection_state`='pending',`projection_next_at`=UTC_TIMESTAMP(3),`projection_attempts`=0,
  `projection_completed_at`=NULL,`projection_last_error`=NULL
WHERE `state`='dispatching' AND `projection_state`='projected';
