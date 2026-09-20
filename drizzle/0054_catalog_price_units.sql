-- Existing prices have mixed provenance. Preserve their values and require
-- explicit review or a fresh trusted sync; never multiply historical rows.
ALTER TABLE products ADD COLUMN price_unit enum('unverified','minor') NOT NULL DEFAULT 'unverified';
--> statement-breakpoint
ALTER TABLE product_variants ADD COLUMN price_unit enum('unverified','minor') NOT NULL DEFAULT 'unverified';
