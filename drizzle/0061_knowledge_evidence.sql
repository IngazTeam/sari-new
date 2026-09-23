ALTER TABLE knowledge_sections
  ADD COLUMN embedding_content_hash CHAR(64) NULL,
  ADD COLUMN valid_until DATETIME(3) NULL,
  ADD COLUMN provenance JSON NULL;
