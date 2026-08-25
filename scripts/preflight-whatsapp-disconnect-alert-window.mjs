import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
const mode = process.argv.includes('--before') ? 'before' : 'after';
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const pool = mysql.createPool(databaseUrl);
try {
  const result = { mode };
  if (mode === 'before') {
    const [rows] = await pool.query(`
      SELECT COUNT(*) AS existingIncidentTable
        FROM information_schema.tables
       WHERE table_schema = DATABASE()
         AND table_name = 'whatsapp_disconnect_incidents'
    `);
    result.existingIncidentTable = Number(rows[0]?.existingIncidentTable || 0);
  } else {
    const [columnRows] = await pool.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN column_name IN (
          'merchant_id','instance_id','detected_at','alerts_sent','next_alert_at',
          'last_alert_at','resolved_at','open_instance_id'
        ) THEN column_name END) AS incidentColumns,
        COALESCE(MAX(CASE WHEN column_name = 'open_instance_id'
          AND extra LIKE '%STORED GENERATED%' THEN 1 ELSE 0 END), 0) AS generatedOpenIdentity
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'whatsapp_disconnect_incidents'
    `);
    const [indexRows] = await pool.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN index_name = 'uq_whatsapp_disconnect_open_instance'
          AND non_unique = 0 THEN index_name END) AS openUniqueIndex,
        COUNT(DISTINCT CASE WHEN index_name = 'idx_whatsapp_disconnect_due'
          THEN index_name END) AS dueIndex
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'whatsapp_disconnect_incidents'
    `);
    const [constraintRows] = await pool.query(`
      SELECT COUNT(*) AS alertCountConstraint
        FROM information_schema.table_constraints
       WHERE table_schema = DATABASE()
         AND table_name = 'whatsapp_disconnect_incidents'
         AND constraint_name = 'whatsapp_disconnect_alert_count_check'
         AND constraint_type = 'CHECK'
    `);
    const [incidentRows] = await pool.query(`
      SELECT
        COALESCE(SUM(alerts_sent < 0 OR alerts_sent > 2), 0) AS invalidAlertCounts,
        COALESCE(SUM(resolved_at IS NULL AND open_instance_id IS NULL), 0) AS invalidOpenIdentities
      FROM whatsapp_disconnect_incidents
    `);
    Object.assign(result, {
      incidentColumns: Number(columnRows[0]?.incidentColumns || 0),
      generatedOpenIdentity: Number(columnRows[0]?.generatedOpenIdentity || 0),
      openUniqueIndex: Number(indexRows[0]?.openUniqueIndex || 0),
      dueIndex: Number(indexRows[0]?.dueIndex || 0),
      alertCountConstraint: Number(constraintRows[0]?.alertCountConstraint || 0),
      invalidAlertCounts: Number(incidentRows[0]?.invalidAlertCounts || 0),
      invalidOpenIdentities: Number(incidentRows[0]?.invalidOpenIdentities || 0),
    });
  }

  console.log(JSON.stringify(result));
  if (mode === 'after' && (
    result.incidentColumns !== 8
    || result.generatedOpenIdentity !== 1
    || result.openUniqueIndex !== 1
    || result.dueIndex !== 1
    || result.alertCountConstraint !== 1
    || result.invalidAlertCounts !== 0
    || result.invalidOpenIdentities !== 0
  )) {
    console.error('WHATSAPP_DISCONNECT_ALERT_WINDOW_PREFLIGHT_FAILED');
    process.exitCode = 1;
  }
} catch {
  console.error('WHATSAPP_DISCONNECT_ALERT_WINDOW_PREFLIGHT_UNAVAILABLE');
  process.exitCode = 2;
} finally {
  await pool.end();
}
