CREATE TABLE IF NOT EXISTS salla_creation_effects (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  creation_id INT NOT NULL,
  local_order_id INT NOT NULL,
  kind ENUM('owner_notice','merchant_notice','sheets') NOT NULL,
  context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  state ENUM('pending','processing','dispatching','accepted','review') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  claim_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  lease_until DATETIME(3) NULL,
  available_at DATETIME(3) NOT NULL,
  dispatch_started_at DATETIME(3) NULL,
  accepted_at DATETIME(3) NULL,
  last_error VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY salla_creation_effect_once (creation_id,kind),
  KEY salla_creation_effect_due (state,available_at,id),
  KEY salla_creation_effect_order (merchant_id,local_order_id,id),
  CONSTRAINT salla_creation_effect_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  CONSTRAINT chk_salla_creation_effect CHECK (
    creation_id>0 AND local_order_id>0 AND attempts BETWEEN 0 AND 8
    AND REGEXP_LIKE(context_hash,'^[0-9a-f]{64}$','c')
    AND (claim_token IS NULL OR REGEXP_LIKE(claim_token,'^[0-9a-f-]{36}$','c'))
    AND ((state='pending' AND claim_token IS NULL AND lease_until IS NULL AND dispatch_started_at IS NULL AND accepted_at IS NULL)
      OR (state='processing' AND claim_token IS NOT NULL AND lease_until IS NOT NULL AND dispatch_started_at IS NULL AND accepted_at IS NULL)
      OR (state='dispatching' AND claim_token IS NOT NULL AND lease_until IS NOT NULL AND dispatch_started_at IS NOT NULL AND accepted_at IS NULL)
      OR (state='accepted' AND claim_token IS NOT NULL AND lease_until IS NULL AND dispatch_started_at IS NOT NULL AND accepted_at IS NOT NULL)
      OR (state='review' AND claim_token IS NOT NULL AND lease_until IS NULL AND accepted_at IS NULL))
  )
);
