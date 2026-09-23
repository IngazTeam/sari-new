ALTER TABLE orders ADD COLUMN checkout_review_required TINYINT NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE sales_quotations
  ADD COLUMN source_message_id INT NULL,
  ADD COLUMN consent_message_id INT NULL,
  ADD COLUMN checkout_snapshot JSON NULL,
  ADD COLUMN offer_version INT NOT NULL DEFAULT 1,
  ADD COLUMN offer_expires_at DATETIME(3) NULL,
  ADD COLUMN order_id INT NULL,
  ADD UNIQUE KEY uq_quote_source (merchant_id, source_message_id),
  ADD UNIQUE KEY uq_quote_consent (merchant_id, consent_message_id),
  ADD UNIQUE KEY uq_quote_order (order_id),
  ADD KEY idx_quote_conversation (merchant_id, conversation_id, id),
  ADD CONSTRAINT fk_quote_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
