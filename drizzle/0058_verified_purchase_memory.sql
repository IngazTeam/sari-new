ALTER TABLE `customer_profiles`
  ADD COLUMN `verified_purchase_count` INT NOT NULL DEFAULT 0,
  ADD COLUMN `verified_spend_by_currency` TEXT NULL;
--> statement-breakpoint
CREATE TABLE `ai_purchase_outcomes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` INT NOT NULL,
  `profile_id` INT NOT NULL,
  `payment_id` INT NOT NULL,
  `conversation_id` INT NULL,
  `outcome_type` VARCHAR(30) NOT NULL,
  `schema_version` INT NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_purchase_outcome` (`merchant_id`, `payment_id`, `outcome_type`),
  CONSTRAINT `fk_purchase_outcome_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_purchase_outcome_profile` FOREIGN KEY (`profile_id`) REFERENCES `customer_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_purchase_outcome_payment` FOREIGN KEY (`payment_id`) REFERENCES `order_payments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_purchase_outcome_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE SET NULL
);
