/** Static SQL fragments only. Never accept user-supplied identifiers here. */
function identifier(value:string) { if(!/^[a-zA-Z_][a-zA-Z_0-9.]*$/.test(value))throw Error('Invalid catalog identifier');return value; }
export function currentZidStoreSql(merchant:string):string {
  merchant=identifier(merchant);
  // Presence of a disabled/malformed canonical connection prevents legacy fallback.
  return `(CASE WHEN EXISTS (SELECT 1 FROM platform_integrations zi WHERE zi.merchant_id=${merchant} AND zi.platform_type='zid')
    THEN (SELECT CASE WHEN zi.is_active=1 AND zi.access_token IS NOT NULL AND zi.access_token<>''
      AND JSON_TYPE(JSON_EXTRACT(IF(JSON_VALID(zi.settings),zi.settings,'{}'),'$.storeId'))='STRING'
      AND JSON_TYPE(JSON_EXTRACT(IF(JSON_VALID(zi.settings),zi.settings,'{}'),'$.managerToken'))='STRING'
      AND JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(zi.settings),zi.settings,'{}'),'$.managerToken'))<>''
      THEN JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(zi.settings),zi.settings,'{}'),'$.storeId')) ELSE NULL END
      FROM platform_integrations zi WHERE zi.merchant_id=${merchant} AND zi.platform_type='zid')
    ELSE (SELECT CASE WHEN zs.is_active=1 AND zs.access_token IS NOT NULL AND zs.access_token<>''
      AND zs.manager_token IS NOT NULL AND zs.manager_token<>'' THEN zs.store_id ELSE NULL END
      FROM zid_settings zs WHERE zs.merchant_id=${merchant}) END)`;
}
export function zidCatalogVisibleSql(alias='products'):string {
  alias=identifier(alias);
  return `((COALESCE(${alias}.sallaProductId,'') NOT LIKE 'zid:%'
      AND NOT EXISTS (SELECT 1 FROM zid_products zc WHERE zc.merchant_id=${alias}.merchantId AND zc.sari_product_id=${alias}.id))
    OR EXISTS (SELECT 1 FROM zid_products zc WHERE zc.merchant_id=${alias}.merchantId AND zc.sari_product_id=${alias}.id
      AND zc.zid_store_id REGEXP '^[1-9][0-9]{0,19}$' AND BINARY zc.zid_store_id=BINARY ${currentZidStoreSql(`${alias}.merchantId`)}))`;
}
