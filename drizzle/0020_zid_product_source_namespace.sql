-- Only migrate projections whose legacy raw ID is independently confirmed by
-- the linked zid_products source row. Unlinked raw IDs are intentionally left
-- untouched because they cannot be distinguished safely from Salla IDs.
UPDATE `products` AS product
INNER JOIN `zid_products` AS source
  ON source.`merchant_id` = product.`merchantId`
 AND source.`sari_product_id` = product.`id`
 AND source.`zid_product_id` = product.`sallaProductId`
SET product.`sallaProductId` = CONCAT('zid:', source.`zid_product_id`)
WHERE CHAR_LENGTH(source.`zid_product_id`) <= 96
  AND product.`sallaProductId` NOT LIKE 'zid:%';
