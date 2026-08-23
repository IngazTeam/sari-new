import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
const beforeMigration = process.argv.includes('--before');
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const pool = mysql.createPool(databaseUrl);
try {
  const [rows] = await pool.query(`
    SELECT COUNT(*) AS rowCount,
           COALESCE(SUM(id <> 1), 0) AS nonSingletonRows
      FROM ai_settings
  `);
  const result = {
    rowCount: Number(rows[0]?.rowCount || 0),
    nonSingletonRows: Number(rows[0]?.nonSingletonRows || 0),
  };

  if (!beforeMigration) {
    const [constraintRows] = await pool.query(`
      SELECT COUNT(*) AS singletonConstraint
        FROM information_schema.table_constraints
       WHERE table_schema = DATABASE()
         AND table_name = 'ai_settings'
         AND constraint_name = 'ai_settings_singleton_id_check'
         AND constraint_type = 'CHECK'
    `);
    result.singletonConstraint = Number(constraintRows[0]?.singletonConstraint || 0);
  }

  console.log(JSON.stringify(result));
  const unsafeRows = result.rowCount > 1;
  const invalidAfter = !beforeMigration
    && (result.nonSingletonRows !== 0 || result.singletonConstraint !== 1);
  if (unsafeRows || invalidAfter) {
    console.error('AI_SETTINGS_SINGLETON_PREFLIGHT_FAILED');
    process.exitCode = 1;
  }
} catch {
  console.error('AI_SETTINGS_SINGLETON_PREFLIGHT_UNAVAILABLE');
  process.exitCode = 2;
} finally {
  await pool.end();
}
