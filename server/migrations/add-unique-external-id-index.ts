/**
 * Add unique index on messages.externalId
 * ═══════════════════════════════════════════════════════════
 * Makes webhook dedup atomic at the DB level.
 * MySQL allows multiple NULL values in a unique index.
 * 
 * Run: npx tsx server/migrations/add-unique-external-id-index.ts
 * ═══════════════════════════════════════════════════════════
 */

import '../_core/loadEnv'; // Must be first — loads DATABASE_URL from .env
import { getPool } from '../db';

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('Migration: Add unique index on messages.externalId');
  console.log('═══════════════════════════════════════════════════\n');

  const pool = await getPool();
  if (!pool) {
    console.error('❌ Cannot connect to database');
    process.exit(1);
  }

  // Step 1: Check for duplicate non-NULL externalIds
  console.log('Step 1: Checking for duplicate externalIds...');
  const [dupes] = await pool.execute(`
    SELECT externalId, COUNT(*) as cnt 
    FROM messages 
    WHERE externalId IS NOT NULL 
    GROUP BY externalId 
    HAVING COUNT(*) > 1
  `);

  const dupeRows = dupes as any[];
  if (dupeRows.length > 0) {
    console.log(`  Found ${dupeRows.length} duplicate externalIds — nullifying duplicates...`);
    for (const dupe of dupeRows) {
      // Keep the first (oldest) row's externalId, nullify the rest
      const [rows] = await pool.execute(
        'SELECT id FROM messages WHERE externalId = ? ORDER BY id ASC',
        [dupe.externalId]
      );
      const ids = (rows as any[]).map(r => r.id);
      const keepId = ids[0];
      const nullifyIds = ids.slice(1);
      
      if (nullifyIds.length > 0) {
        await pool.execute(
          `UPDATE messages SET externalId = NULL WHERE id IN (${nullifyIds.join(',')})`,
        );
        console.log(`  Deduped externalId=${dupe.externalId}: kept id=${keepId}, nullified ${nullifyIds.length} duplicates (messages preserved)`);
      }
    }
  } else {
    console.log('  No duplicates found ✅');
  }

  // Step 2: Drop existing non-unique index if present
  console.log('\nStep 2: Dropping old index if exists...');
  try {
    await pool.execute('DROP INDEX idx_messages_external_id ON messages');
    console.log('  Dropped old index ✅');
  } catch (e: any) {
    if (e.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
      console.log('  No old index to drop ✅');
    } else {
      throw e;
    }
  }

  // Step 3: Create unique index
  console.log('\nStep 3: Creating unique index...');
  await pool.execute(
    'CREATE UNIQUE INDEX idx_messages_external_id ON messages (externalId)'
  );
  console.log('  Created unique index on messages.externalId ✅');

  console.log('\n═══════════════════════════════════════════════════');
  console.log('Migration complete ✅');
  console.log('═══════════════════════════════════════════════════');

  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
