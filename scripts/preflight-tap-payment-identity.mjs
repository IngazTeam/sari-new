import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const pool = mysql.createPool(databaseUrl);
try {
  const [chargeRows] = await pool.query(`
    SELECT COUNT(*) AS duplicateChargeGroups,
           COALESCE(SUM(rowCount - 1), 0) AS duplicateChargeRows
      FROM (
        SELECT tap_charge_id, COUNT(*) AS rowCount
          FROM order_payments
         WHERE tap_charge_id IS NOT NULL AND tap_charge_id <> ''
         GROUP BY tap_charge_id
        HAVING COUNT(*) > 1
      ) duplicates
  `);
  const [linkRows] = await pool.query(`
    SELECT COUNT(*) AS duplicateLinkGroups,
           COALESCE(SUM(rowCount - 1), 0) AS duplicateLinkRows
      FROM (
        SELECT link_id, COUNT(*) AS rowCount
          FROM payment_links
         GROUP BY link_id
        HAVING COUNT(*) > 1
      ) duplicates
  `);
  const [invalidRows] = await pool.query(`
    SELECT COALESCE(SUM(tap_charge_id = ''), 0) AS emptyChargeIds,
           (SELECT COALESCE(SUM(link_id IS NULL OR link_id = ''), 0) FROM payment_links) AS invalidLinkIds
      FROM order_payments
  `);

  const result = {
    duplicateChargeGroups: Number(chargeRows[0]?.duplicateChargeGroups || 0),
    duplicateChargeRows: Number(chargeRows[0]?.duplicateChargeRows || 0),
    duplicateLinkGroups: Number(linkRows[0]?.duplicateLinkGroups || 0),
    duplicateLinkRows: Number(linkRows[0]?.duplicateLinkRows || 0),
    emptyChargeIds: Number(invalidRows[0]?.emptyChargeIds || 0),
    invalidLinkIds: Number(invalidRows[0]?.invalidLinkIds || 0),
  };
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => value > 0)) {
    console.error('TAP_PAYMENT_IDENTITY_PREFLIGHT_FAILED');
    process.exitCode = 1;
  }
} catch {
  console.error('TAP_PAYMENT_IDENTITY_PREFLIGHT_UNAVAILABLE');
  process.exitCode = 2;
} finally {
  await pool.end();
}
