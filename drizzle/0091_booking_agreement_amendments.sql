ALTER TABLE conversation_booking_agreements
  ADD COLUMN target_booking_id INT NULL,
  ADD COLUMN prior_agreement_id INT NULL,
  ADD COLUMN before_snapshot JSON NULL,
  ADD COLUMN before_hash CHAR(64) NULL,
  DROP INDEX uq_conversation_booking_result,
  ADD INDEX idx_conversation_booking_result (merchant_id,booking_reference,id);
