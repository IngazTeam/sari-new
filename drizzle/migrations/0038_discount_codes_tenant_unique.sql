-- A discount code belongs to one merchant. The same text may be reused by other merchants,
-- but duplicate codes inside a merchant must be rejected atomically.
-- This migration intentionally fails if historical duplicates exist so they can be reviewed
-- instead of deleting or renaming customer-facing codes silently.
-- Add the protective constraint first. If duplicates exist, this statement fails
-- and the old lookup index remains untouched.
ALTER TABLE `discount_codes`
  ADD UNIQUE INDEX `uq_discount_codes_merchant_code` (`merchantId`, `code`);

-- Remove the now-redundant single-column index only after the unique key succeeds.
ALTER TABLE `discount_codes`
  DROP INDEX `discount_codes_code_unique`;
