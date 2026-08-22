import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const pool = mysql.createPool(databaseUrl);
try {
  const [columnRows] = await pool.query(`
    SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName,
           COLUMN_TYPE AS columnType, COLUMN_DEFAULT AS columnDefault
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND (
         (TABLE_NAME = 'woocommerce_products' AND COLUMN_NAME = 'provider_updated_at') OR
         (TABLE_NAME = 'woocommerce_orders' AND COLUMN_NAME = 'provider_updated_at') OR
         (TABLE_NAME = 'woocommerce_sync_logs' AND COLUMN_NAME = 'status') OR
         (TABLE_NAME = 'woocommerce_settings' AND COLUMN_NAME IN ('auto_sync_products', 'auto_sync_orders'))
       )
  `);
  const columns = new Map(columnRows.map(row => [`${row.tableName}.${row.columnName}`, {
    type: String(row.columnType),
    default: row.columnDefault,
  }]));
  const schemaReady = (columns.get('woocommerce_products.provider_updated_at')?.type || '').startsWith('timestamp(3)')
    && (columns.get('woocommerce_orders.provider_updated_at')?.type || '').startsWith('timestamp(3)')
    && (columns.get('woocommerce_sync_logs.status')?.type || '').includes("'running'")
    && Number(columns.get('woocommerce_settings.auto_sync_products')?.default) === 0
    && Number(columns.get('woocommerce_settings.auto_sync_orders')?.default) === 0;

  let plaintextConsumerKeys = 0;
  let plaintextConsumerSecrets = 0;
  let insecureStoreUrls = 0;
  let automaticSyncFlagsEnabled = 0;
  let productsWithoutProviderVersion = 0;
  let ordersWithoutProviderVersion = 0;
  let merchantsAboveSnapshotLimit = 0;

  if (schemaReady) {
    const [settingsRows] = await pool.query(`
      SELECT
        SUM(consumer_key NOT LIKE 'enc:v1:%') AS plaintextConsumerKeys,
        SUM(consumer_secret NOT LIKE 'enc:v1:%') AS plaintextConsumerSecrets,
        SUM(
          store_url NOT LIKE 'https://%' OR
          store_url REGEXP '[?#]' OR
          SUBSTRING_INDEX(SUBSTRING_INDEX(store_url, '/', 3), '/', -1) LIKE '%@%' OR
          (
            SUBSTRING_INDEX(SUBSTRING_INDEX(store_url, '/', 3), '/', -1) REGEXP ':[0-9]+$' AND
            SUBSTRING_INDEX(SUBSTRING_INDEX(store_url, '/', 3), '/', -1) NOT REGEXP ':443$'
          ) OR
          SUBSTRING_INDEX(SUBSTRING_INDEX(store_url, '/', 3), '/', -1) REGEXP '^([0-9]{1,3}\\.){3}[0-9]{1,3}$' OR
          LOWER(store_url) LIKE '%localhost%' OR
          LOWER(store_url) LIKE '%.local%' OR
          LOWER(store_url) LIKE '%.internal%'
        ) AS insecureStoreUrls,
        SUM(auto_sync_products <> 0 OR auto_sync_orders <> 0 OR auto_sync_customers <> 0) AS automaticSyncFlagsEnabled
      FROM woocommerce_settings
    `);
    plaintextConsumerKeys = Number(settingsRows[0]?.plaintextConsumerKeys || 0);
    plaintextConsumerSecrets = Number(settingsRows[0]?.plaintextConsumerSecrets || 0);
    insecureStoreUrls = Number(settingsRows[0]?.insecureStoreUrls || 0);
    automaticSyncFlagsEnabled = Number(settingsRows[0]?.automaticSyncFlagsEnabled || 0);

    const [snapshotRows] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM woocommerce_products WHERE provider_updated_at IS NULL) AS productsWithoutProviderVersion,
        (SELECT COUNT(*) FROM woocommerce_orders WHERE provider_updated_at IS NULL) AS ordersWithoutProviderVersion,
        (
          SELECT COUNT(*) FROM (
            SELECT merchant_id FROM woocommerce_products GROUP BY merchant_id HAVING COUNT(*) > 2000
            UNION
            SELECT merchant_id FROM woocommerce_orders GROUP BY merchant_id HAVING COUNT(*) > 2000
          ) AS oversized
        ) AS merchantsAboveSnapshotLimit
    `);
    productsWithoutProviderVersion = Number(snapshotRows[0]?.productsWithoutProviderVersion || 0);
    ordersWithoutProviderVersion = Number(snapshotRows[0]?.ordersWithoutProviderVersion || 0);
    merchantsAboveSnapshotLimit = Number(snapshotRows[0]?.merchantsAboveSnapshotLimit || 0);
  }

  const result = {
    schemaReady,
    plaintextConsumerKeys,
    plaintextConsumerSecrets,
    insecureStoreUrls,
    automaticSyncFlagsEnabled,
    productsWithoutProviderVersion,
    ordersWithoutProviderVersion,
    merchantsAboveSnapshotLimit,
  };
  console.log(JSON.stringify(result));
  if (!schemaReady || plaintextConsumerKeys || plaintextConsumerSecrets || insecureStoreUrls
    || automaticSyncFlagsEnabled || productsWithoutProviderVersion || ordersWithoutProviderVersion
    || merchantsAboveSnapshotLimit) {
    console.error('WOOCOMMERCE_SECURE_SYNC_PREFLIGHT_FAILED');
    process.exitCode = 1;
  }
} catch {
  console.error('WOOCOMMERCE_SECURE_SYNC_PREFLIGHT_UNAVAILABLE');
  process.exitCode = 2;
} finally {
  await pool.end();
}
