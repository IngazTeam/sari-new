ALTER TABLE orders ADD COLUMN checkout_subtotal_minor INT NULL, ADD COLUMN checkout_discount_minor INT NULL;
--> statement-breakpoint
CREATE TABLE checkout_discount_redemptions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  order_id INT NOT NULL,
  quotation_id INT NOT NULL,
  coupon_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  discount_code VARCHAR(50) NOT NULL,
  subtotal_minor INT NOT NULL,
  discount_minor INT NOT NULL,
  total_minor INT NOT NULL,
  terms JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_checkout_discount_order (order_id),
  CONSTRAINT fk_checkout_discount_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  CONSTRAINT fk_checkout_discount_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
