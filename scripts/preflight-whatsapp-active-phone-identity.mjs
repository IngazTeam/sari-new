import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const canonicalPhoneSql = `
  CASE
    WHEN LEFT(REGEXP_REPLACE(phone_number, '[^0-9]', ''), 2) = '00'
      THEN SUBSTRING(REGEXP_REPLACE(phone_number, '[^0-9]', ''), 3)
    ELSE REGEXP_REPLACE(phone_number, '[^0-9]', '')
  END
`;

const pool = mysql.createPool(databaseUrl);
try {
  const [validityRows] = await pool.query(`
    SELECT COUNT(*) AS activePhoneRows,
           COALESCE(SUM(canonicalDigits NOT REGEXP '^[0-9]{7,15}$'), 0) AS invalidRows
      FROM (
        SELECT ${canonicalPhoneSql} AS canonicalDigits
          FROM whatsapp_instances
         WHERE status = 'active' AND phone_number IS NOT NULL
      ) activeIdentities
  `);
  const [duplicateRows] = await pool.query(`
    SELECT COUNT(*) AS duplicateGroups,
           COALESCE(SUM(duplicateCount - 1), 0) AS extraRows
      FROM (
        SELECT COUNT(*) AS duplicateCount
          FROM (
            SELECT ${canonicalPhoneSql} AS canonicalDigits
              FROM whatsapp_instances
             WHERE status = 'active' AND phone_number IS NOT NULL
          ) activeIdentities
         WHERE canonicalDigits REGEXP '^[0-9]{7,15}$'
         GROUP BY canonicalDigits
        HAVING COUNT(*) > 1
      ) duplicateIdentities
  `);

  const result = {
    activePhoneRows: Number(validityRows[0]?.activePhoneRows || 0),
    invalidRows: Number(validityRows[0]?.invalidRows || 0),
    duplicateGroups: Number(duplicateRows[0]?.duplicateGroups || 0),
    extraRows: Number(duplicateRows[0]?.extraRows || 0),
  };
  console.log(JSON.stringify(result));
  if (result.invalidRows > 0 || result.duplicateGroups > 0) {
    console.error('WHATSAPP_ACTIVE_PHONE_IDENTITY_PREFLIGHT_FAILED');
    process.exitCode = 1;
  }
} catch {
  console.error('WHATSAPP_ACTIVE_PHONE_IDENTITY_PREFLIGHT_UNAVAILABLE');
  process.exitCode = 2;
} finally {
  await pool.end();
}
