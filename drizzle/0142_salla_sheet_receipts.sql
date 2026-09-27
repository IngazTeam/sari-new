CREATE TABLE IF NOT EXISTS salla_sheet_receipts (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  effect_id INT NOT NULL,
  merchant_id INT NOT NULL,
  creation_id INT NOT NULL,
  local_order_id INT NOT NULL,
  claim_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  intent JSON NOT NULL,
  intent_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  receipt JSON NULL,
  receipt_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  accepted_at DATETIME(3) NULL,
  UNIQUE KEY salla_sheet_effect_once (effect_id),
  KEY salla_sheet_merchant (merchant_id,id),
  CONSTRAINT salla_sheet_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  CONSTRAINT chk_salla_sheet_receipt CHECK (
    effect_id>0 AND creation_id>0 AND local_order_id>0 AND REGEXP_LIKE(claim_token,'^[0-9a-f-]{36}$','c')
    AND REGEXP_LIKE(context_hash,'^[0-9a-f]{64}$','c') AND REGEXP_LIKE(intent_hash,'^[0-9a-f]{64}$','c')
    AND ((receipt IS NULL AND receipt_hash IS NULL AND accepted_at IS NULL)
      OR (receipt IS NOT NULL AND receipt_hash IS NOT NULL AND accepted_at IS NOT NULL
        AND REGEXP_LIKE(receipt_hash,'^[0-9a-f]{64}$','c')))
  )
);
