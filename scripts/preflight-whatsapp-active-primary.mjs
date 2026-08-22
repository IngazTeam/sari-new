import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const pool = mysql.createPool(databaseUrl);
try {
  const [summaryRows] = await pool.query(`
    SELECT COUNT(*) AS activeMerchantCount,
           COALESCE(SUM(primaryCount = 0), 0) AS zeroPrimaryMerchantCount,
           COALESCE(SUM(primaryCount > 1), 0) AS multiplePrimaryMerchantCount
      FROM (
        SELECT merchant_id,
               SUM(status = 'active') AS activeCount,
               SUM(status = 'active' AND is_primary = 1) AS primaryCount
          FROM whatsapp_instances
         GROUP BY merchant_id
        HAVING activeCount > 0
      ) merchantPrimaryState
  `);
  const [flagRows] = await pool.query(`
    SELECT COALESCE(SUM(status <> 'active' AND is_primary = 1), 0) AS inactivePrimaryRows,
           COALESCE(SUM(is_primary NOT IN (0, 1)), 0) AS invalidPrimaryFlagRows
      FROM whatsapp_instances
  `);

  const result = {
    activeMerchantCount: Number(summaryRows[0]?.activeMerchantCount || 0),
    zeroPrimaryMerchantCount: Number(summaryRows[0]?.zeroPrimaryMerchantCount || 0),
    multiplePrimaryMerchantCount: Number(summaryRows[0]?.multiplePrimaryMerchantCount || 0),
    inactivePrimaryRows: Number(flagRows[0]?.inactivePrimaryRows || 0),
    invalidPrimaryFlagRows: Number(flagRows[0]?.invalidPrimaryFlagRows || 0),
  };
  console.log(JSON.stringify(result));
  if (
    result.zeroPrimaryMerchantCount > 0
    || result.multiplePrimaryMerchantCount > 0
    || result.inactivePrimaryRows > 0
    || result.invalidPrimaryFlagRows > 0
  ) {
    console.error('WHATSAPP_ACTIVE_PRIMARY_PREFLIGHT_FAILED');
    process.exitCode = 1;
  }
} catch {
  console.error('WHATSAPP_ACTIVE_PRIMARY_PREFLIGHT_UNAVAILABLE');
  process.exitCode = 2;
} finally {
  await pool.end();
}
