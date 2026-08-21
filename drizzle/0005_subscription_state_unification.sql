ALTER TABLE `merchant_subscriptions` MODIFY COLUMN `status` enum('pending','trial','active','expired','cancelled') NOT NULL;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant_subscriptions' AND COLUMN_NAME = 'conversations_used') = 0, 'ALTER TABLE `merchant_subscriptions` ADD COLUMN `conversations_used` INT DEFAULT 0 NOT NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant_subscriptions' AND COLUMN_NAME = 'messages_used') = 0, 'ALTER TABLE `merchant_subscriptions` ADD COLUMN `messages_used` INT DEFAULT 0 NOT NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant_subscriptions' AND COLUMN_NAME = 'voice_messages_used') = 0, 'ALTER TABLE `merchant_subscriptions` ADD COLUMN `voice_messages_used` INT DEFAULT 0 NOT NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant_subscriptions' AND COLUMN_NAME = 'last_reset_at') = 0, 'ALTER TABLE `merchant_subscriptions` ADD COLUMN `last_reset_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscription_plans' AND COLUMN_NAME = 'conversation_limit') = 0, 'ALTER TABLE `subscription_plans` ADD COLUMN `conversation_limit` INT DEFAULT 1000 NOT NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscription_plans' AND COLUMN_NAME = 'message_limit') = 0, 'ALTER TABLE `subscription_plans` ADD COLUMN `message_limit` INT DEFAULT -1 NOT NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscription_plans' AND COLUMN_NAME = 'voice_message_limit') = 0, 'ALTER TABLE `subscription_plans` ADD COLUMN `voice_message_limit` INT DEFAULT 100 NOT NULL', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint

-- Stop before changing indexes when duplicate provider references require manual reconciliation.
UPDATE `payment_transactions` SET `tap_charge_id` = NULL
WHERE `tap_charge_id` IS NOT NULL AND TRIM(`tap_charge_id`) = '';--> statement-breakpoint
SET @tap_charge_duplicates = (
  SELECT COUNT(*) FROM (
    SELECT `tap_charge_id` FROM `payment_transactions`
    WHERE `tap_charge_id` IS NOT NULL AND TRIM(`tap_charge_id`) <> ''
    GROUP BY `tap_charge_id` HAVING COUNT(*) > 1
  ) AS duplicate_charges
);--> statement-breakpoint
SET @legacy_tap_charge_duplicates = (
  SELECT COUNT(*) FROM (
    SELECT `transactionId` FROM `payments`
    WHERE `transactionId` IS NOT NULL AND TRIM(`transactionId`) <> ''
    GROUP BY `transactionId` HAVING COUNT(*) > 1
  ) AS duplicate_legacy_charges
);--> statement-breakpoint
SET @tap_charge_duplicates = @tap_charge_duplicates + @legacy_tap_charge_duplicates;--> statement-breakpoint
-- Duplicate payment_transactions.tap_charge_id values intentionally make the UNIQUE DDL below fail.
-- Reconcile the reported provider IDs, then rerun this idempotent migration.
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_transactions' AND INDEX_NAME = 'payment_transactions_tap_charge_id_unique') = 0, 'ALTER TABLE `payment_transactions` ADD CONSTRAINT `payment_transactions_tap_charge_id_unique` UNIQUE(`tap_charge_id`)', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_transactions' AND INDEX_NAME = 'payment_transactions_tap_charge_id_idx') > 0, 'DROP INDEX `payment_transactions_tap_charge_id_idx` ON `payment_transactions`', 'SELECT 1');--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint

-- Preserve legacy plan IDs where possible; name matching avoids overwriting a canonical ID collision.
INSERT INTO `subscription_plans`
  (`id`, `name`, `name_en`, `monthly_price`, `yearly_price`, `currency`, `max_customers`,
   `max_whatsapp_numbers`, `conversation_limit`, `message_limit`, `voice_message_limit`,
   `features`, `is_active`, `sort_order`, `created_at`, `updated_at`)
SELECT p.`id`, p.`nameAr`, p.`name`, p.`priceMonthly`, p.`priceMonthly` * 10, 'SAR',
       IF(p.`conversationLimit` = -1, 999999, GREATEST(p.`conversationLimit`, 100)), 1,
       p.`conversationLimit`, -1, p.`voiceMessageLimit`, p.`features`, p.`isActive`, p.`id`,
       p.`createdAt`, p.`updatedAt`
FROM `plans` p
WHERE NOT EXISTS (SELECT 1 FROM `subscription_plans` sp WHERE sp.`id` = p.`id`)
  AND NOT EXISTS (SELECT 1 FROM `subscription_plans` sp WHERE LOWER(sp.`name_en`) = LOWER(p.`name`));--> statement-breakpoint

UPDATE `subscription_plans` sp
JOIN `plans` p ON LOWER(sp.`name_en`) = LOWER(p.`name`)
SET sp.`conversation_limit` = p.`conversationLimit`,
    sp.`voice_message_limit` = p.`voiceMessageLimit`,
    sp.`features` = COALESCE(sp.`features`, p.`features`)
WHERE sp.`conversation_limit` = 1000 AND sp.`voice_message_limit` = 100;--> statement-breakpoint

-- Copy historical subscriptions once. The natural business identity prevents duplicate reruns.
INSERT INTO `merchant_subscriptions`
  (`merchant_id`, `plan_id`, `status`, `billing_cycle`, `start_date`, `end_date`, `auto_renew`,
   `conversations_used`, `messages_used`, `voice_messages_used`, `last_reset_at`, `created_at`, `updated_at`)
SELECT s.`merchantId`,
       COALESCE(
         (SELECT spn.`id` FROM `subscription_plans` spn JOIN `plans` pn ON LOWER(spn.`name_en`) = LOWER(pn.`name`) WHERE pn.`id` = s.`planId` LIMIT 1),
         (SELECT spi.`id` FROM `subscription_plans` spi WHERE spi.`id` = s.`planId` LIMIT 1)
       ),
       s.`status`, 'monthly', s.`startDate`, s.`endDate`, s.`autoRenew`,
       s.`conversationsUsed`, s.`messagesUsed`, s.`voiceMessagesUsed`, s.`lastResetAt`, s.`createdAt`, s.`updatedAt`
FROM `subscriptions` s
WHERE NOT EXISTS (
  SELECT 1 FROM `merchant_subscriptions` ms
  WHERE ms.`merchant_id` = s.`merchantId`
    AND ms.`start_date` = s.`startDate`
    AND ms.`end_date` = s.`endDate`
);--> statement-breakpoint

-- Reconcile the denormalized merchant mirror from the canonical current row.
UPDATE `merchants` m
JOIN `merchant_subscriptions` ms ON ms.`id` = (
  SELECT current_ms.`id` FROM `merchant_subscriptions` current_ms
  WHERE current_ms.`merchant_id` = m.`id` AND current_ms.`status` IN ('trial', 'active')
  ORDER BY current_ms.`created_at` DESC, current_ms.`id` DESC LIMIT 1
)
JOIN `subscription_plans` sp ON sp.`id` = ms.`plan_id`
SET m.`current_subscription_id` = ms.`id`,
    m.`subscription_status` = ms.`status`,
    m.`max_customers_allowed` = sp.`max_customers`;--> statement-breakpoint

-- Copy externally addressable legacy payments so delayed Tap webhooks resolve canonically.
INSERT INTO `payment_transactions`
  (`merchant_id`, `subscription_id`, `type`, `amount`, `currency`, `status`, `payment_method`,
   `tap_charge_id`, `paid_at`, `metadata`, `created_at`, `updated_at`)
SELECT p.`merchantId`, NULL, 'subscription', p.`amount`, p.`currency`, p.`status`, p.`paymentMethod`,
       p.`transactionId`, p.`paidAt`,
       JSON_OBJECT(
         'planId', COALESCE(
           (SELECT spn.`id` FROM `subscription_plans` spn JOIN `plans` pn ON LOWER(spn.`name_en`) = LOWER(pn.`name`) WHERE pn.`id` = s.`planId` LIMIT 1),
           (SELECT spi.`id` FROM `subscription_plans` spi WHERE spi.`id` = s.`planId` LIMIT 1)
         ),
         'billingCycle', 'monthly',
         'legacyPaymentId', p.`id`
       ),
       p.`createdAt`, p.`updatedAt`
FROM `payments` p
JOIN `subscriptions` s ON s.`id` = p.`subscriptionId`
WHERE p.`transactionId` IS NOT NULL AND TRIM(p.`transactionId`) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM `payment_transactions` pt WHERE pt.`tap_charge_id` = p.`transactionId`
  );
