ALTER TABLE bookings ADD COLUMN customer_agreement_id INT NULL;
--> statement-breakpoint
UPDATE bookings b
JOIN conversation_booking_agreements a ON a.booking_reference=b.id AND a.merchant_id=b.merchant_id
SET b.customer_agreement_id=a.id
WHERE b.customer_agreement_id IS NULL;
