-- `payment_gateways` fed only an unconsumed admin UI and an unsafe PayPal
-- webhook. Tap platform checkout reads `tap_settings`; merchant checkout reads
-- `merchant_payment_settings`. Remove the unused credential store instead of
-- retaining a second source of truth or migrating unverified secrets.
DROP TABLE IF EXISTS `payment_gateways`;
