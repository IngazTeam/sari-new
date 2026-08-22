import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const pool = mysql.createPool(databaseUrl);
try {
  const [columns] = await pool.query(`
    SELECT COLUMN_NAME AS name
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_integrations'
       AND COLUMN_NAME IN ('webhook_endpoint_id', 'webhook_signing_secret', 'webhook_subscription_uri')
  `);
  const present = new Set(columns.map(row => String(row.name)));
  const schemaReady = present.size === 3;
  let activeConnectionsMissingRegistration = 0;
  let plaintextAccessTokens = 0;
  let plaintextSigningSecrets = 0;
  if (schemaReady) {
    const [rows] = await pool.query(`
      SELECT
        SUM(is_active = 1 AND (
          webhook_endpoint_id IS NULL OR webhook_endpoint_id = '' OR
          webhook_signing_secret IS NULL OR webhook_signing_secret = '' OR
          webhook_subscription_uri IS NULL OR webhook_subscription_uri = ''
        )) AS activeConnectionsMissingRegistration,
        SUM(access_token IS NOT NULL AND access_token NOT LIKE 'enc:v1:%') AS plaintextAccessTokens,
        SUM(webhook_signing_secret IS NOT NULL AND webhook_signing_secret NOT LIKE 'enc:v1:%') AS plaintextSigningSecrets
      FROM platform_integrations WHERE platform_type = 'calendly'
    `);
    activeConnectionsMissingRegistration = Number(rows[0]?.activeConnectionsMissingRegistration || 0);
    plaintextAccessTokens = Number(rows[0]?.plaintextAccessTokens || 0);
    plaintextSigningSecrets = Number(rows[0]?.plaintextSigningSecrets || 0);
  }
  const [legacyRows] = await pool.query(`
    SELECT COUNT(*) AS legacyCalendlyAppointments
      FROM appointments
     WHERE google_event_id LIKE 'https://api.calendly.com/%'
  `);
  const result = {
    schemaReady,
    activeConnectionsMissingRegistration,
    plaintextAccessTokens,
    plaintextSigningSecrets,
    legacyCalendlyAppointments: Number(legacyRows[0]?.legacyCalendlyAppointments || 0),
  };
  console.log(JSON.stringify(result));
  if (!schemaReady || activeConnectionsMissingRegistration || plaintextAccessTokens || plaintextSigningSecrets) {
    console.error('CALENDLY_WEBHOOK_IDENTITY_PREFLIGHT_FAILED');
    process.exitCode = 1;
  }
} catch {
  console.error('CALENDLY_WEBHOOK_IDENTITY_PREFLIGHT_UNAVAILABLE');
  process.exitCode = 2;
} finally {
  await pool.end();
}
