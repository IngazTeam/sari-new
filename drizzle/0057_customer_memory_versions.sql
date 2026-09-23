ALTER TABLE `customer_profiles`
  ADD COLUMN `memory_version` INT NOT NULL DEFAULT 0,
  ADD COLUMN `last_enriched_message_id` INT NULL;
