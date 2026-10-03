CREATE TABLE IF NOT EXISTS `occasion_authorizations` (
 `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `grant_key` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `occasion_id` INT NOT NULL,
 `merchant_id` INT NOT NULL,
 `actor_id` INT NOT NULL,
 `active` TINYINT NULL DEFAULT 1,
 `review_revision` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `contract_digest` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `reviewed_contract` JSON NOT NULL,
 `prepared_campaign_id` INT NULL,
 `prepared_campaign_digest` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 `prepared_discount_id` INT NULL,
 `prepared_discount_digest` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `revoked_at` DATETIME(3) NULL,
 UNIQUE KEY `uq_occasion_grant_key` (`grant_key`),
 UNIQUE KEY `uq_occasion_active_grant` (`occasion_id`,`active`),
 KEY `idx_occasion_grant_history` (`merchant_id`,`occasion_id`,`id`),
 CONSTRAINT `fk_occasion_grant_occasion` FOREIGN KEY (`occasion_id`) REFERENCES `occasion_campaigns` (`id`) ON DELETE CASCADE,
 CONSTRAINT `fk_occasion_grant_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
 CONSTRAINT `chk_occasion_grant_active` CHECK ((`active` IS NOT NULL AND `active`=1 AND `revoked_at` IS NULL) OR (`active` IS NULL AND `revoked_at` IS NOT NULL)),
 CONSTRAINT `chk_occasion_grant_prepared` CHECK (
  (`prepared_campaign_id` IS NULL AND `prepared_campaign_digest` IS NULL AND `prepared_discount_id` IS NULL AND `prepared_discount_digest` IS NULL)
  OR (`prepared_campaign_id` IS NOT NULL AND `prepared_campaign_digest` IS NOT NULL AND `prepared_discount_id` IS NOT NULL AND `prepared_discount_digest` IS NOT NULL)
 )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
