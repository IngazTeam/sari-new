-- Append only: retain existing enum ordinals and all historical records.
-- A verified capture may be held for review when its reviewed subscription changed.
ALTER TABLE `payment_transactions`
  MODIFY COLUMN `status` ENUM('pending','completed','failed','refunded','requires_review') NOT NULL DEFAULT 'pending';
