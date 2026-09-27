/** Static identifiers only; fragments are never built from request input. */
export function sallaCatalogVisibleSql(alias='products'):string {
  if(!/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(alias))throw Error('Invalid catalog identifier');
  return `((COALESCE(${alias}.sallaProductId,'') NOT LIKE 'salla:%'
    AND COALESCE(${alias}.sallaProductId,'') NOT REGEXP '^[0-9]+$'
    AND NOT EXISTS (SELECT 1 FROM salla_product_projections sp WHERE sp.local_product_id=${alias}.id))
    OR EXISTS (SELECT 1 FROM salla_product_projections sp JOIN salla_connections sc
      ON sc.merchantId=sp.merchant_id AND sc.salla_store_id=sp.store_id AND sc.syncStatus='active'
      WHERE sp.merchant_id=${alias}.merchantId AND sp.local_product_id=${alias}.id AND sp.archived=0
        AND ${alias}.sallaProductId=CONCAT('salla:',sp.store_id,':',sp.external_product_id)))`;
}
