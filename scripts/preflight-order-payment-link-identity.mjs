import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const pool = mysql.createPool(databaseUrl);
try {
  const [duplicateRows] = await pool.query(`
    SELECT COUNT(*) AS duplicateOrderGroups,
           COALESCE(SUM(rowCount - 1), 0) AS duplicateOrderLinks
      FROM (
        SELECT order_id, COUNT(*) AS rowCount
          FROM payment_links
         WHERE order_id IS NOT NULL
         GROUP BY order_id
        HAVING COUNT(*) > 1
      ) duplicates
  `);
  const [driftRows] = await pool.query(`
    SELECT
      COALESCE(SUM(pl.merchant_id <> o.merchantId), 0) AS crossTenantLinks,
      COALESCE(SUM(pl.amount <> o.totalAmount OR pl.currency <> o.currency), 0) AS amountCurrencyDrift,
      COALESCE(SUM(pl.booking_id IS NOT NULL OR pl.is_fixed_amount <> 1 OR pl.max_usage_count <> 1), 0) AS unsafeOrderLinks
    FROM payment_links pl
    JOIN orders o ON o.id = pl.order_id
    WHERE pl.order_id IS NOT NULL
  `);
  const [orphanRows] = await pool.query(`
    SELECT COUNT(*) AS orphanOrderLinks
      FROM payment_links pl
      LEFT JOIN orders o ON o.id = pl.order_id
     WHERE pl.order_id IS NOT NULL AND o.id IS NULL
  `);

  const result = {
    duplicateOrderGroups: Number(duplicateRows[0]?.duplicateOrderGroups || 0),
    duplicateOrderLinks: Number(duplicateRows[0]?.duplicateOrderLinks || 0),
    crossTenantLinks: Number(driftRows[0]?.crossTenantLinks || 0),
    amountCurrencyDrift: Number(driftRows[0]?.amountCurrencyDrift || 0),
    unsafeOrderLinks: Number(driftRows[0]?.unsafeOrderLinks || 0),
    orphanOrderLinks: Number(orphanRows[0]?.orphanOrderLinks || 0),
  };
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => value > 0)) {
    console.error('ORDER_PAYMENT_LINK_IDENTITY_PREFLIGHT_FAILED');
    process.exitCode = 1;
  }
} catch {
  console.error('ORDER_PAYMENT_LINK_IDENTITY_PREFLIGHT_UNAVAILABLE');
  process.exitCode = 2;
} finally {
  await pool.end();
}
