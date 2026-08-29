-- Customer marketing consent is explicit, tenant-scoped and auditable. Existing
-- conversations, orders and imported customer directories do not imply consent.
CREATE TABLE IF NOT EXISTS `campaign_consent_receipts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `merchant_id` INT NOT NULL,
  `customer_phone` VARCHAR(20) NOT NULL,
  `decision` ENUM('granted','withdrawn') NOT NULL,
  `source` VARCHAR(32) NOT NULL,
  `provider` VARCHAR(20) NOT NULL,
  `consent_version` VARCHAR(40) NOT NULL,
  `evidence_digest` CHAR(64) NOT NULL,
  `provider_event_digest` CHAR(64) NOT NULL,
  `decided_at` DATETIME(3) NOT NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `campaign_consent_receipts_event_unique` (`merchant_id`, `provider_event_digest`),
  KEY `campaign_consent_receipts_subject_idx` (`merchant_id`, `customer_phone`, `decided_at`, `id`),
  CONSTRAINT `campaign_consent_receipts_merchant_fk`
    FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `campaign_consent_state` (
  `merchant_id` INT NOT NULL,
  `customer_phone` VARCHAR(20) NOT NULL,
  `status` ENUM('granted','withdrawn') NOT NULL,
  `consent_version` VARCHAR(40) NOT NULL,
  `source` VARCHAR(32) NOT NULL,
  `evidence_digest` CHAR(64) NOT NULL,
  `last_decided_at` DATETIME(3) NOT NULL,
  `last_receipt_id` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`merchant_id`, `customer_phone`),
  KEY `campaign_consent_state_status_idx` (`merchant_id`, `status`),
  CONSTRAINT `campaign_consent_state_merchant_fk`
    FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `campaign_consent_state_receipt_fk`
    FOREIGN KEY (`last_receipt_id`) REFERENCES `campaign_consent_receipts` (`id`) ON DELETE SET NULL
);--> statement-breakpoint

-- Preserve historical withdrawals without inferring a grant for anybody else.
INSERT IGNORE INTO `campaign_consent_receipts`
  (`merchant_id`, `customer_phone`, `decision`, `source`, `provider`,
   `consent_version`, `evidence_digest`, `provider_event_digest`, `decided_at`)
SELECT
  `merchant_id`,
  CASE
    WHEN REGEXP_REPLACE(`customer_phone`, '[^0-9]', '') LIKE '00%'
      THEN SUBSTRING(REGEXP_REPLACE(`customer_phone`, '[^0-9]', ''), 3)
    WHEN REGEXP_REPLACE(`customer_phone`, '[^0-9]', '') LIKE '05________'
      THEN CONCAT('966', SUBSTRING(REGEXP_REPLACE(`customer_phone`, '[^0-9]', ''), 2))
    WHEN REGEXP_REPLACE(`customer_phone`, '[^0-9]', '') LIKE '5________'
      THEN CONCAT('966', REGEXP_REPLACE(`customer_phone`, '[^0-9]', ''))
    ELSE REGEXP_REPLACE(`customer_phone`, '[^0-9]', '')
  END,
  'withdrawn',
  'legacy_migration',
  'legacy',
  'campaign-marketing-v1',
  SHA2(CONCAT('legacy-optout-evidence-v1|', `merchant_id`, '|', `customer_phone`, '|', `opted_out_at`), 256),
  SHA2(CONCAT('legacy-optout-event-v1|', `merchant_id`, '|', `customer_phone`, '|', `opted_out_at`), 256),
  `opted_out_at`
FROM `campaign_optouts`
WHERE CHAR_LENGTH(REGEXP_REPLACE(`customer_phone`, '[^0-9]', '')) BETWEEN 8 AND 17;--> statement-breakpoint

INSERT INTO `campaign_consent_state`
  (`merchant_id`, `customer_phone`, `status`, `consent_version`, `source`,
   `evidence_digest`, `last_decided_at`, `last_receipt_id`)
SELECT r.`merchant_id`, r.`customer_phone`, 'withdrawn', r.`consent_version`, r.`source`,
       r.`evidence_digest`, r.`decided_at`, r.`id`
FROM `campaign_consent_receipts` r
JOIN (
  SELECT `merchant_id`, `customer_phone`, MAX(`id`) AS `id`
  FROM `campaign_consent_receipts`
  GROUP BY `merchant_id`, `customer_phone`
) latest ON latest.`id` = r.`id`
ON DUPLICATE KEY UPDATE
  `status` = IF(VALUES(`last_decided_at`) >= `campaign_consent_state`.`last_decided_at`, VALUES(`status`), `campaign_consent_state`.`status`),
  `consent_version` = IF(VALUES(`last_decided_at`) >= `campaign_consent_state`.`last_decided_at`, VALUES(`consent_version`), `campaign_consent_state`.`consent_version`),
  `source` = IF(VALUES(`last_decided_at`) >= `campaign_consent_state`.`last_decided_at`, VALUES(`source`), `campaign_consent_state`.`source`),
  `evidence_digest` = IF(VALUES(`last_decided_at`) >= `campaign_consent_state`.`last_decided_at`, VALUES(`evidence_digest`), `campaign_consent_state`.`evidence_digest`),
  `last_receipt_id` = IF(VALUES(`last_decided_at`) >= `campaign_consent_state`.`last_decided_at`, VALUES(`last_receipt_id`), `campaign_consent_state`.`last_receipt_id`),
  `last_decided_at` = GREATEST(VALUES(`last_decided_at`), `campaign_consent_state`.`last_decided_at`);--> statement-breakpoint
