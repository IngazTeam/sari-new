CREATE TABLE IF NOT EXISTS `merchant_referral_programs` (
 `merchant_id` INT NOT NULL PRIMARY KEY,
 `code_id` INT NULL,
 `applied_code_id` INT NULL,
 `applied_referral_id` INT NULL,
 `applied_reward_id` INT NULL,
 `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY `uq_merchant_referral_code` (`code_id`),
 UNIQUE KEY `uq_merchant_referral_application` (`applied_referral_id`),
 UNIQUE KEY `uq_merchant_referral_reward` (`applied_reward_id`),
 CONSTRAINT `fk_merchant_referral_program` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
 CONSTRAINT `chk_merchant_referral_application` CHECK (
  (`applied_code_id` IS NULL AND `applied_referral_id` IS NULL AND `applied_reward_id` IS NULL)
  OR (`applied_code_id` IS NOT NULL AND `applied_referral_id` IS NOT NULL AND `applied_reward_id` IS NOT NULL)
 )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
