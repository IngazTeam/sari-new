import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const pool = mysql.createPool(databaseUrl);
try {
  const [rows] = await pool.query(`
    SELECT COUNT(*) AS duplicateGroups,
           COALESCE(SUM(duplicateCount - 1), 0) AS extraRows
      FROM (
        SELECT COUNT(*) AS duplicateCount
          FROM orders
         WHERE sallaOrderId IS NOT NULL
         GROUP BY merchantId, sallaOrderId
        HAVING COUNT(*) > 1
      ) duplicateIdentities
  `);
  const duplicateGroups = Number(rows[0]?.duplicateGroups || 0);
  const extraRows = Number(rows[0]?.extraRows || 0);
  console.log(JSON.stringify({ duplicateGroups, extraRows }));
  if (duplicateGroups > 0) {
    console.error('ZID_ORDER_IDENTITY_PREFLIGHT_FAILED');
    process.exitCode = 1;
  }
} catch {
  console.error('ZID_ORDER_IDENTITY_PREFLIGHT_UNAVAILABLE');
  process.exitCode = 2;
} finally {
  await pool.end();
}
