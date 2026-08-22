UPDATE `byaan_faqs`
SET `external_id` = CONCAT('content:', SHA2(CONCAT(TRIM(COALESCE(`question`, '')), CHAR(0), TRIM(COALESCE(`answer`, ''))), 256))
WHERE `external_id` IS NULL OR `external_id` = '';
--> statement-breakpoint
CREATE TEMPORARY TABLE `tmp_byaan_faq_dedupe` AS
SELECT
  `merchant_id`,
  `external_id`,
  MAX(`id`) AS `keep_id`,
  MIN(`is_active`) AS `is_active`,
  MIN(`use_in_bot`) AS `use_in_bot`
FROM `byaan_faqs`
GROUP BY `merchant_id`, `external_id`
HAVING COUNT(*) > 1;
--> statement-breakpoint
UPDATE `byaan_faqs` AS `keeper`
INNER JOIN `tmp_byaan_faq_dedupe` AS `duplicate_group`
  ON `keeper`.`id` = `duplicate_group`.`keep_id`
SET
  `keeper`.`is_active` = `duplicate_group`.`is_active`,
  `keeper`.`use_in_bot` = `duplicate_group`.`use_in_bot`;
--> statement-breakpoint
DELETE `duplicate_row`
FROM `byaan_faqs` AS `duplicate_row`
INNER JOIN `tmp_byaan_faq_dedupe` AS `duplicate_group`
  ON `duplicate_row`.`merchant_id` = `duplicate_group`.`merchant_id`
 AND `duplicate_row`.`external_id` = `duplicate_group`.`external_id`
WHERE `duplicate_row`.`id` <> `duplicate_group`.`keep_id`;
--> statement-breakpoint
DROP TEMPORARY TABLE `tmp_byaan_faq_dedupe`;
--> statement-breakpoint
ALTER TABLE `byaan_faqs`
  ADD CONSTRAINT `uq_byaan_faq` UNIQUE (`merchant_id`, `external_id`);
--> statement-breakpoint
CREATE INDEX `idx_byaan_faq_knowledge`
  ON `byaan_faqs` (`merchant_id`, `is_active`, `use_in_bot`, `id`);
