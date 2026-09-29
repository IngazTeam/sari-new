ALTER TABLE `sari_coaching_questions`
  ADD COLUMN `context_json` json NULL,
  ADD COLUMN `context_digest` char(64) NULL,
  ADD COLUMN `delivery_key` varchar(100) NULL,
  ADD COLUMN `review_event_key` char(64) NULL,
  ADD COLUMN `review_source_digest` char(64) NULL,
  ADD COLUMN `review_analysis` json NULL,
  ADD UNIQUE KEY `uq_coaching_delivery` (`delivery_key`),
  ADD UNIQUE KEY `uq_coaching_review_event` (`merchant_id`, `review_event_key`);
