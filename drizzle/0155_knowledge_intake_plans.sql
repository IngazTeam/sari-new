ALTER TABLE `knowledge_intake_reviews`
  ADD COLUMN `basis_hash` char(64) NULL,
  ADD COLUMN `plan` json NULL;
