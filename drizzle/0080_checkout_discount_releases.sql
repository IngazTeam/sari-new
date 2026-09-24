ALTER TABLE orders ADD COLUMN checkout_discount_released TINYINT NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE checkout_discount_redemptions ADD COLUMN release_policy_version INT NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE checkout_discount_releases (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  order_id INT NOT NULL,
  redemption_id INT NOT NULL,
  coupon_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  policy_version INT NOT NULL,
  used_before INT NOT NULL,
  used_after INT NOT NULL,
  evidence_hash CHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_checkout_discount_release_order (order_id),
  UNIQUE KEY uq_checkout_discount_release_redemption (redemption_id),
  CONSTRAINT fk_discount_release_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  CONSTRAINT fk_discount_release_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_discount_release_redemption FOREIGN KEY (redemption_id) REFERENCES checkout_discount_redemptions(id) ON DELETE CASCADE
);
