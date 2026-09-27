CREATE TABLE IF NOT EXISTS salla_product_projections (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  store_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  external_product_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  local_product_id INT NULL,
  connection_id INT NOT NULL,
  read_revision INT NOT NULL,
  archived TINYINT NOT NULL DEFAULT 0,
  observed_at DATETIME(3) NOT NULL,
  UNIQUE KEY salla_product_scope (merchant_id,store_id,external_product_id),
  UNIQUE KEY salla_product_local (local_product_id),
  CONSTRAINT salla_product_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  CONSTRAINT chk_salla_product_projection CHECK (connection_id>0 AND read_revision>0 AND archived IN (0,1)
    AND (local_product_id IS NOT NULL OR archived=1) AND (local_product_id IS NULL OR local_product_id>0)
    AND REGEXP_LIKE(store_id,'^[1-9][0-9]{0,19}$','c') AND REGEXP_LIKE(external_product_id,'^[1-9][0-9]{0,19}$','c'))
);
