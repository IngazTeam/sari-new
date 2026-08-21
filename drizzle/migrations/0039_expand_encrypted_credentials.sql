-- AES-GCM ciphertext is longer than its plaintext input. Widen the legacy
-- credential column before running `pnpm security:encrypt-secrets`.
ALTER TABLE `whatsapp_connection_requests`
  MODIFY COLUMN `apiToken` TEXT NULL;

ALTER TABLE `whatsappConnections`
  MODIFY COLUMN `apiToken` TEXT NULL;
