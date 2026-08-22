import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const pool = mysql.createPool(databaseUrl);
try {
  const [columns] = await pool.query(`
    SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND (
         (TABLE_NAME = 'woocommerce_settings' AND COLUMN_NAME IN ('webhook_endpoint_id', 'webhook_signing_secret')) OR
         (TABLE_NAME = 'woocommerce_webhook_registrations' AND COLUMN_NAME IN ('merchant_id', 'topic', 'webhook_id')) OR
         (TABLE_NAME = 'woocommerce_webhook_receipts' AND COLUMN_NAME IN ('merchant_id', 'delivery_id', 'webhook_id', 'topic', 'resource_id', 'status', 'available_at'))
       )
  `);
  const present = new Set(columns.map(row => `${row.tableName}.${row.columnName}`));
  const [indexes] = await pool.query(`
    SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique
      FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND INDEX_NAME IN (
         'woocommerce_settings_webhook_endpoint_unique',
         'woocommerce_webhook_registrations_topic_unique',
         'woocommerce_webhook_registrations_remote_unique',
         'woocommerce_webhook_receipts_delivery_unique'
       )
  `);
  const uniqueIndexes = new Set(indexes
    .filter(row => Number(row.nonUnique) === 0)
    .map(row => `${row.tableName}.${row.indexName}`));
  const required = [
    'woocommerce_settings.webhook_endpoint_id',
    'woocommerce_settings.webhook_signing_secret',
    'woocommerce_webhook_registrations.merchant_id',
    'woocommerce_webhook_registrations.topic',
    'woocommerce_webhook_registrations.webhook_id',
    'woocommerce_webhook_receipts.merchant_id',
    'woocommerce_webhook_receipts.delivery_id',
    'woocommerce_webhook_receipts.webhook_id',
    'woocommerce_webhook_receipts.topic',
    'woocommerce_webhook_receipts.resource_id',
    'woocommerce_webhook_receipts.status',
    'woocommerce_webhook_receipts.available_at',
  ];
  const requiredIndexes = [
    'woocommerce_settings.woocommerce_settings_webhook_endpoint_unique',
    'woocommerce_webhook_registrations.woocommerce_webhook_registrations_topic_unique',
    'woocommerce_webhook_registrations.woocommerce_webhook_registrations_remote_unique',
    'woocommerce_webhook_receipts.woocommerce_webhook_receipts_delivery_unique',
  ];
  const schemaReady = required.every(column => present.has(column))
    && requiredIndexes.every(index => uniqueIndexes.has(index));
  let activeConnectionsMissingIdentity = 0;
  let activeConnectionsWithoutSixTopics = 0;
  let plaintextSigningSecrets = 0;
  let manualReviewReceipts = 0;
  let awaitingReceipts = 0;
  let legacyPayloadRows = 0;
  if (schemaReady) {
    const [settingsRows] = await pool.query(`
      SELECT
        SUM(is_active = 1 AND connection_status = 'connected' AND (
          webhook_endpoint_id IS NULL OR webhook_endpoint_id = '' OR
          webhook_signing_secret IS NULL OR webhook_signing_secret = ''
        )) AS activeConnectionsMissingIdentity,
        SUM(webhook_signing_secret IS NOT NULL AND webhook_signing_secret NOT LIKE 'enc:v1:%') AS plaintextSigningSecrets
      FROM woocommerce_settings
    `);
    activeConnectionsMissingIdentity = Number(settingsRows[0]?.activeConnectionsMissingIdentity || 0);
    plaintextSigningSecrets = Number(settingsRows[0]?.plaintextSigningSecrets || 0);

    const [registrationRows] = await pool.query(`
      SELECT COUNT(*) AS activeConnectionsWithoutSixTopics
        FROM (
          SELECT s.merchant_id
            FROM woocommerce_settings s
            LEFT JOIN woocommerce_webhook_registrations r ON r.merchant_id = s.merchant_id
           WHERE s.is_active = 1 AND s.connection_status = 'connected'
           GROUP BY s.merchant_id
          HAVING COUNT(r.id) <> 6 OR COUNT(DISTINCT r.topic) <> 6 OR COUNT(DISTINCT r.webhook_id) <> 6
        ) missing
    `);
    activeConnectionsWithoutSixTopics = Number(registrationRows[0]?.activeConnectionsWithoutSixTopics || 0);

    const [receiptRows] = await pool.query(`
      SELECT
        SUM(status = 'manual_review') AS manualReviewReceipts,
        SUM(status IN ('pending','processing','failed')) AS awaitingReceipts
      FROM woocommerce_webhook_receipts
    `);
    manualReviewReceipts = Number(receiptRows[0]?.manualReviewReceipts || 0);
    awaitingReceipts = Number(receiptRows[0]?.awaitingReceipts || 0);

    const [legacyTables] = await pool.query(`
      SELECT COUNT(*) AS present FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'woocommerce_webhooks'
    `);
    if (Number(legacyTables[0]?.present || 0) === 1) {
      const [legacyRows] = await pool.query('SELECT COUNT(*) AS legacyPayloadRows FROM woocommerce_webhooks');
      legacyPayloadRows = Number(legacyRows[0]?.legacyPayloadRows || 0);
    }
  }
  const result = {
    schemaReady,
    activeConnectionsMissingIdentity,
    activeConnectionsWithoutSixTopics,
    plaintextSigningSecrets,
    manualReviewReceipts,
    awaitingReceipts,
    legacyPayloadRows,
  };
  console.log(JSON.stringify(result));
  if (!schemaReady || activeConnectionsMissingIdentity || activeConnectionsWithoutSixTopics || plaintextSigningSecrets) {
    console.error('WOOCOMMERCE_WEBHOOK_INGRESS_PREFLIGHT_FAILED');
    process.exitCode = 1;
  }
} catch {
  console.error('WOOCOMMERCE_WEBHOOK_INGRESS_PREFLIGHT_UNAVAILABLE');
  process.exitCode = 2;
} finally {
  await pool.end();
}
