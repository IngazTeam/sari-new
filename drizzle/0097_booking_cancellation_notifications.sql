ALTER TABLE booking_reschedule_notifications
  MODIFY COLUMN reschedule_id INT NULL,
  ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'reschedule',
  ADD COLUMN cancellation_id INT NULL,
  ADD UNIQUE KEY uq_booking_notice_cancel (merchant_id,cancellation_id),
  ADD CONSTRAINT chk_booking_notice_kind CHECK (
    (kind='reschedule' AND reschedule_id IS NOT NULL AND cancellation_id IS NULL)
    OR (kind='cancellation' AND cancellation_id IS NOT NULL AND reschedule_id IS NULL)
  );
