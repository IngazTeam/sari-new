import { pathToFileURL } from 'node:url';

/** Older web workers use raw provider IDs and cannot consume durable jobs. */
export async function assertLegacyInboundRollbackSafe(connection) {
  let rows;
  try {
    [rows] = await connection.query('SELECT id FROM whatsapp_inbound_jobs LIMIT 1');
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return;
    throw new Error('Unable to verify inbound rollback compatibility');
  }
  if (!Array.isArray(rows)) throw new Error('Invalid inbound rollback result');
  if (rows.length) throw new Error('Legacy rollback blocked: durable inbound history requires a compatible release');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let connection;
  try {
    if (!process.env.DATABASE_URL) throw new Error('Rollback database is unavailable');
    const { createConnection } = await import('mysql2/promise');
    connection = await createConnection(process.env.DATABASE_URL);
    await assertLegacyInboundRollbackSafe(connection);
    console.log('[rollback] Legacy inbound compatibility verified');
  } catch {
    console.error('[rollback] Cannot activate a legacy inbound release; keep the current queue intact and roll forward with a compatible release');
    process.exitCode = 1;
  } finally { await connection?.end(); }
}
