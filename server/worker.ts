import './_core/loadEnv';
import { closeDb } from './db/connection';
import { validateEnv } from './_core/validateEnv';
import { installProductionConsoleRedaction } from './security/log-redaction';
import { startInboundWorker } from './messaging/inbound-worker';

async function main() {
  installProductionConsoleRedaction();
  validateEnv();
  const { validateDatabaseSchema } = await import('./cron/schema-validator');
  const schema = await validateDatabaseSchema({ log: false });
  if (!schema.allCritical) throw new Error('Worker schema is outdated');
  const stop = await startInboundWorker();
  let draining = false;
  const drain = async () => {
    if (draining) return;
    draining = true;
    const deadline = setTimeout(() => process.exit(1), 30_000);
    deadline.unref();
    await stop();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', () => { void drain(); });
  process.on('SIGINT', () => { void drain(); });
  if (typeof process.send === 'function') process.send('ready');
}
main().catch(() => { console.error('[InboundWorker] Startup failed'); process.exit(1); });
