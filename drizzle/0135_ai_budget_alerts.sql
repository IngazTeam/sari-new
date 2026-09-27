CREATE TABLE IF NOT EXISTS `ai_budget_alerts` (
  `period_start` date NOT NULL,
  `threshold_percent` tinyint unsigned NOT NULL,
  `limit_micro_usd` bigint unsigned NOT NULL,
  `spent_micro_usd` bigint unsigned NOT NULL,
  `reserved_micro_usd` bigint unsigned NOT NULL,
  `observed_at` datetime(3) NOT NULL,
  PRIMARY KEY (`period_start`, `threshold_percent`),
  CONSTRAINT `chk_ai_budget_alert_threshold` CHECK (`threshold_percent` IN (70,90)),
  CONSTRAINT `chk_ai_budget_alert_limit` CHECK (`limit_micro_usd` > 0)
);
