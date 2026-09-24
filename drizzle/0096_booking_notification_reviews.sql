CREATE TABLE `booking_notification_reviews` (
  `id` int AUTO_INCREMENT NOT NULL,
  `merchant_id` int NOT NULL,
  `notification_id` int NOT NULL,
  `booking_reference` int NOT NULL,
  `actor_user_id` int NOT NULL,
  `request_id` char(36) NOT NULL,
  `request_hash` char(64) NOT NULL,
  `evidence_hash` char(64) NOT NULL,
  `outcome` varchar(24) NOT NULL,
  `delivery_state` varchar(24) NOT NULL,
  `projected` int NOT NULL,
  `reason` varchar(500) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `booking_notification_reviews_id` PRIMARY KEY (`id`),
  CONSTRAINT `uq_booking_notice_review_request` UNIQUE (`merchant_id`,`request_id`),
  CONSTRAINT `fk_booking_notice_review_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_booking_notice_reviews` ON `booking_notification_reviews` (`merchant_id`,`notification_id`,`id`);
