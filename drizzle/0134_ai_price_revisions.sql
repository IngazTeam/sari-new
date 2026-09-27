CREATE TABLE IF NOT EXISTS `ai_price_card_revisions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `provider` varchar(40) NOT NULL,
  `model` varchar(128) NOT NULL,
  `version` varchar(80) NOT NULL,
  `origin` enum('legacy','admin') NOT NULL,
  `actor_id` int DEFAULT NULL,
  `reference` varchar(240) DEFAULT NULL,
  `request_id` char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `request_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `snapshot` json NOT NULL,
  `snapshot_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ai_price_revision` (`provider`,`model`,`version`),
  UNIQUE KEY `uq_ai_price_request` (`request_id`),
  KEY `idx_ai_price_history` (`provider`,`model`,`id`),
  CONSTRAINT `chk_ai_price_revision_origin` CHECK (
    (`origin` = 'legacy' AND `actor_id` IS NULL AND `reference` IS NULL AND `request_id` IS NULL AND `request_digest` IS NULL)
    OR (`origin` = 'admin' AND `actor_id` > 0 AND `actor_id` IS NOT NULL AND `reference` IS NOT NULL AND `request_id` IS NOT NULL AND `request_digest` IS NOT NULL)
  )
);
