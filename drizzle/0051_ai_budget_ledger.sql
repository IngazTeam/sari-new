CREATE TABLE `ai_budget_policies` (
  `scope_key` varchar(160) NOT NULL,
  `version` varchar(80) NOT NULL,
  `daily_limit_micro_usd` bigint unsigned NOT NULL,
  `enabled` tinyint NOT NULL DEFAULT 1,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`scope_key`)
);
--> statement-breakpoint
CREATE TABLE `ai_price_cards` (
  `provider` varchar(40) NOT NULL,
  `model` varchar(128) NOT NULL,
  `version` varchar(80) NOT NULL,
  `input_micro_usd_per_million` bigint unsigned NOT NULL,
  `output_micro_usd_per_million` bigint unsigned NOT NULL,
  `flat_micro_usd` bigint unsigned NOT NULL DEFAULT 0,
  `max_input_tokens` int unsigned NOT NULL,
  `enabled` tinyint NOT NULL DEFAULT 1,
  PRIMARY KEY (`provider`, `model`)
);
--> statement-breakpoint
INSERT INTO `ai_budget_policies` (`scope_key`, `version`, `daily_limit_micro_usd`, `enabled`)
VALUES ('global', 'owner-approved-2026-09-19', 100000000, 1);
--> statement-breakpoint
CREATE TABLE `ai_budget_periods` (
  `scope_key` varchar(160) NOT NULL,
  `period_start` date NOT NULL,
  `policy_version` varchar(80) NOT NULL,
  `limit_micro_usd` bigint unsigned NOT NULL,
  `reserved_micro_usd` bigint unsigned NOT NULL DEFAULT 0,
  `spent_micro_usd` bigint unsigned NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`scope_key`, `period_start`)
);
--> statement-breakpoint
CREATE TABLE `ai_usage_reservations` (
  `reservation_key` char(64) NOT NULL,
  `request_id` varchar(160) NOT NULL,
  `scope_key` varchar(160) NOT NULL,
  `period_start` date NOT NULL,
  `fingerprint` char(64) NOT NULL,
  `provider` varchar(40) NOT NULL,
  `model` varchar(128) NOT NULL,
  `task_type` varchar(96) NOT NULL,
  `price_version` varchar(80) NOT NULL,
  `input_rate` bigint unsigned NOT NULL,
  `output_rate` bigint unsigned NOT NULL,
  `flat_micro_usd` bigint unsigned NOT NULL DEFAULT 0,
  `reserved_micro_usd` bigint unsigned NOT NULL,
  `settled_micro_usd` bigint unsigned DEFAULT NULL,
  `reconciliation_reference` varchar(160) DEFAULT NULL,
  `reconciled_by` int DEFAULT NULL,
  `state` enum('reserved','settled','released','unknown') NOT NULL DEFAULT 'reserved',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`reservation_key`),
  KEY `idx_ai_reservation_scope_state` (`scope_key`, `state`, `created_at`),
  CONSTRAINT `fk_ai_reservation_period` FOREIGN KEY (`scope_key`, `period_start`)
    REFERENCES `ai_budget_periods` (`scope_key`, `period_start`)
);
