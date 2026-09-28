-- Preserve the full 30,000-character intake contract for multibyte text.
ALTER TABLE `merchant_knowledge_docs` MODIFY COLUMN `extracted_text` MEDIUMTEXT NULL;
