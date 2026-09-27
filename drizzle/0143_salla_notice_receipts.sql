CREATE TABLE IF NOT EXISTS salla_notice_receipts (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  effect_id INT NOT NULL,
  merchant_id INT NOT NULL,
  creation_id INT NOT NULL,
  local_order_id INT NOT NULL,
  claim_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  evidence JSON NOT NULL,
  evidence_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  fully_accepted TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY salla_notice_effect_once(effect_id),
  KEY salla_notice_merchant(merchant_id,id),
  CONSTRAINT salla_notice_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  CONSTRAINT chk_salla_notice_receipt CHECK (
    effect_id>0 AND creation_id>0 AND local_order_id>0 AND fully_accepted IN (0,1)
    AND REGEXP_LIKE(claim_token,'^[0-9a-f-]{36}$','c')
    AND REGEXP_LIKE(context_hash,'^[0-9a-f]{64}$','c') AND REGEXP_LIKE(evidence_hash,'^[0-9a-f]{64}$','c')
  )
);
