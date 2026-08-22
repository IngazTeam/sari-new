import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const pool = mysql.createPool(databaseUrl);
try {
  const [columnRows] = await pool.query(`
    SELECT COUNT(*) AS present
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'salla_connections'
       AND COLUMN_NAME = 'salla_store_id'
  `);
  const identityColumnPresent = Number(columnRows[0]?.present || 0) === 1;
  const [duplicateMerchantRows] = await pool.query(`
    SELECT COUNT(*) AS duplicateMerchantGroups
      FROM (
        SELECT merchantId FROM salla_connections
         GROUP BY merchantId HAVING COUNT(*) > 1
      ) duplicates
  `);
  const [tokenRows] = await pool.query(`
    SELECT COUNT(*) AS plaintextAccessTokens
      FROM salla_connections
     WHERE accessToken NOT LIKE 'enc:v1:%'
  `);
  const [totalRows] = await pool.query('SELECT COUNT(*) AS totalConnections FROM salla_connections');

  let missingStoreIdentities = Number(totalRows[0]?.totalConnections || 0);
  let duplicateStoreIdentityGroups = 0;
  if (identityColumnPresent) {
    const [identityRows] = await pool.query(`
      SELECT
        SUM(salla_store_id IS NULL OR salla_store_id = '') AS missingStoreIdentities,
        (SELECT COUNT(*) FROM (
          SELECT salla_store_id FROM salla_connections
           WHERE salla_store_id IS NOT NULL AND salla_store_id <> ''
           GROUP BY salla_store_id HAVING COUNT(*) > 1
        ) duplicate_ids) AS duplicateStoreIdentityGroups
      FROM salla_connections
    `);
    missingStoreIdentities = Number(identityRows[0]?.missingStoreIdentities || 0);
    duplicateStoreIdentityGroups = Number(identityRows[0]?.duplicateStoreIdentityGroups || 0);
  }

  const result = {
    identityColumnPresent,
    duplicateMerchantGroups: Number(duplicateMerchantRows[0]?.duplicateMerchantGroups || 0),
    missingStoreIdentities,
    duplicateStoreIdentityGroups,
    plaintextAccessTokens: Number(tokenRows[0]?.plaintextAccessTokens || 0),
  };
  console.log(JSON.stringify(result));
  if (!identityColumnPresent || Object.entries(result).some(([key, value]) => key !== 'identityColumnPresent' && Number(value) > 0)) {
    console.error('SALLA_WEBHOOK_IDENTITY_PREFLIGHT_FAILED');
    process.exitCode = 1;
  }
} catch {
  console.error('SALLA_WEBHOOK_IDENTITY_PREFLIGHT_UNAVAILABLE');
  process.exitCode = 2;
} finally {
  await pool.end();
}
