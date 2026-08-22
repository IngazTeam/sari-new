import '../server/_core/loadEnv';
import axios from 'axios';
import { eq, isNull, or } from 'drizzle-orm';
import { sallaConnections } from '../drizzle/schema';
import { closeDb, getDb } from '../server/db';
import { normalizeSallaStoreIdentity } from '../server/integrations/salla';
import { decryptSecret } from '../server/security/secrets';

const apply = process.argv.includes('--apply');
let discovered = 0;
let updated = 0;
let conflicts = 0;
let unavailable = 0;

async function main() {
  const db = await getDb();
  if (!db) throw new Error('Database is not initialized');
  const rows = await db.select({
    id: sallaConnections.id,
    accessToken: sallaConnections.accessToken,
  }).from(sallaConnections).where(or(
    isNull(sallaConnections.sallaStoreId),
    eq(sallaConnections.sallaStoreId, ''),
  ));

  for (const row of rows) {
    try {
      const response = await axios.get('https://api.salla.dev/admin/v2/store/info', {
        headers: { Authorization: `Bearer ${decryptSecret(row.accessToken)}`, Accept: 'application/json' },
        timeout: 10_000,
        maxContentLength: 2 * 1024 * 1024,
      });
      const identity = normalizeSallaStoreIdentity(response.data?.data);
      if (!identity) {
        unavailable++;
        continue;
      }
      discovered++;
      const collision = await db.select({ id: sallaConnections.id }).from(sallaConnections)
        .where(eq(sallaConnections.sallaStoreId, identity.id)).limit(1);
      if (collision[0] && collision[0].id !== row.id) {
        conflicts++;
        continue;
      }
      if (apply) {
        await db.update(sallaConnections).set({
          sallaStoreId: identity.id,
          storeUrl: identity.domain,
        }).where(eq(sallaConnections.id, row.id));
        updated++;
      }
    } catch {
      unavailable++;
    }
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', discovered, updated, conflicts, unavailable }));
  if (conflicts > 0 || unavailable > 0) process.exitCode = 1;
}

main()
  .catch(() => {
    console.error('SALLA_STORE_IDENTITY_BACKFILL_UNAVAILABLE');
    process.exitCode = 2;
  })
  .finally(() => closeDb());
