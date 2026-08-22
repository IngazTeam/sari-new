ALTER TABLE `order_payments`
  DROP INDEX `order_payments_tap_charge_id_idx`,
  ADD CONSTRAINT `order_payments_tap_charge_id_unique` UNIQUE(`tap_charge_id`);--> statement-breakpoint
ALTER TABLE `payment_links`
  DROP INDEX `payment_links_link_id_unique`,
  ADD CONSTRAINT `payment_links_link_id_unique` UNIQUE(`link_id`);
