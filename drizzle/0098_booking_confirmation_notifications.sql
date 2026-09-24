ALTER TABLE booking_reschedule_notifications
  ADD COLUMN confirmation_id INT NULL,
  ADD UNIQUE KEY uq_booking_notice_confirm (merchant_id,confirmation_id),
  DROP CHECK chk_booking_notice_kind,
  ADD CONSTRAINT chk_booking_notice_kind CHECK (
    (kind='reschedule' AND reschedule_id IS NOT NULL AND cancellation_id IS NULL AND confirmation_id IS NULL)
    OR (kind='cancellation' AND cancellation_id IS NOT NULL AND reschedule_id IS NULL AND confirmation_id IS NULL)
    OR (kind='confirmation' AND confirmation_id IS NOT NULL AND reschedule_id IS NULL AND cancellation_id IS NULL)
  );
