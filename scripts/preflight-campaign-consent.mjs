import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
const mode = process.argv.includes('--before') ? 'before' : 'after';
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const digits = "REGEXP_REPLACE(customer_phone, '[^0-9]', '')";
const canonicalPhone = `CASE
  WHEN ${digits} LIKE '00%' THEN SUBSTRING(${digits}, 3)
  WHEN ${digits} LIKE '05________' THEN CONCAT('966', SUBSTRING(${digits}, 2))
  WHEN ${digits} LIKE '5________' THEN CONCAT('966', ${digits})
  ELSE ${digits}
END`;

const pool = mysql.createPool(databaseUrl);
try {
  const [legacyRows] = await pool.query(`
    SELECT COUNT(*) AS rowsTotal,
           COALESCE(SUM(canonical_phone NOT REGEXP '^[1-9][0-9]{7,14}$'), 0) AS invalidRows
      FROM (
        SELECT ${canonicalPhone} AS canonical_phone
          FROM campaign_optouts
      ) normalized
  `);
  const [collisionRows] = await pool.query(`
    SELECT COUNT(*) AS collisionGroups,
           COALESCE(SUM(row_count - 1), 0) AS extraRows
      FROM (
        SELECT merchant_id, ${canonicalPhone} AS canonical_phone, COUNT(*) AS row_count
          FROM campaign_optouts
         GROUP BY merchant_id, canonical_phone
        HAVING COUNT(*) > 1
      ) collisions
  `);
  const [tables] = await pool.query(`
    SELECT TABLE_NAME AS tableName
      FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('campaign_consent_receipts', 'campaign_consent_state')
  `);
  const present = new Set(tables.map(row => row.tableName));
  const schemaReady = present.has('campaign_consent_receipts') && present.has('campaign_consent_state');

  let receiptRows = 0;
  let grantedStates = 0;
  let withdrawnStates = 0;
  let invalidStatePhones = 0;
  let brokenStateReferences = 0;
  let stateReceiptMismatches = 0;
  if (schemaReady) {
    const [receiptCounts] = await pool.query(`
      SELECT COUNT(*) AS receiptRows FROM campaign_consent_receipts
    `);
    receiptRows = Number(receiptCounts[0]?.receiptRows || 0);
    const [stateCounts] = await pool.query(`
      SELECT
        COALESCE(SUM(status = 'granted'), 0) AS grantedStates,
        COALESCE(SUM(status = 'withdrawn'), 0) AS withdrawnStates,
        COALESCE(SUM(customer_phone NOT REGEXP '^[1-9][0-9]{7,14}$'), 0) AS invalidStatePhones,
        COALESCE(SUM(last_receipt_id IS NULL), 0) AS brokenStateReferences
      FROM campaign_consent_state
    `);
    grantedStates = Number(stateCounts[0]?.grantedStates || 0);
    withdrawnStates = Number(stateCounts[0]?.withdrawnStates || 0);
    invalidStatePhones = Number(stateCounts[0]?.invalidStatePhones || 0);
    brokenStateReferences = Number(stateCounts[0]?.brokenStateReferences || 0);
    const [mismatchRows] = await pool.query(`
      SELECT COUNT(*) AS stateReceiptMismatches
        FROM campaign_consent_state s
        LEFT JOIN campaign_consent_receipts r ON r.id = s.last_receipt_id
       WHERE r.id IS NULL
          OR r.merchant_id <> s.merchant_id
          OR r.customer_phone <> s.customer_phone
          OR r.decision <> s.status
          OR r.evidence_digest <> s.evidence_digest
    `);
    stateReceiptMismatches = Number(mismatchRows[0]?.stateReceiptMismatches || 0);
  }

  const result = {
    mode,
    schemaReady,
    legacyOptOutRows: Number(legacyRows[0]?.rowsTotal || 0),
    invalidLegacyPhones: Number(legacyRows[0]?.invalidRows || 0),
    canonicalCollisionGroups: Number(collisionRows[0]?.collisionGroups || 0),
    canonicalCollisionExtraRows: Number(collisionRows[0]?.extraRows || 0),
    receiptRows,
    grantedStates,
    withdrawnStates,
    invalidStatePhones,
    brokenStateReferences,
    stateReceiptMismatches,
  };
  console.log(JSON.stringify(result));

  const unsafeLegacy = result.invalidLegacyPhones > 0 || result.canonicalCollisionGroups > 0;
  const unsafeProjection = invalidStatePhones > 0 || brokenStateReferences > 0 || stateReceiptMismatches > 0;
  if (unsafeLegacy || (mode === 'after' && (!schemaReady || unsafeProjection))) {
    console.error('CAMPAIGN_CONSENT_PREFLIGHT_FAILED');
    process.exitCode = 1;
  }
} catch {
  console.error('CAMPAIGN_CONSENT_PREFLIGHT_UNAVAILABLE');
  process.exitCode = 2;
} finally {
  await pool.end();
}
