#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import {
  CRITICAL_TABLES, compareRestoreManifests, databaseIdentity,
  resolveManifestPath, validateManifestSource, validateRestoreTarget,
} from './ops-policy.mjs';

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, ...value] = arg.slice(2).split('=');
      result[key] = value.join('=');
    } else throw new Error(`Unsupported argument: ${arg}`);
  }
  return result;
}

async function inspectDatabase(databaseUrl) {
  const identity = databaseIdentity(databaseUrl);
  const connection = await mysql.createConnection({ uri: databaseUrl, connectTimeout: 10_000 });
  let transactionStarted = false;
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    transactionStarted = true;
    const placeholders = CRITICAL_TABLES.map(() => '?').join(',');
    const [columns] = await connection.execute(
      `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (${placeholders})
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [identity.database, ...CRITICAL_TABLES],
    );
    const byTable = Object.fromEntries(CRITICAL_TABLES.map(table => [table, []]));
    for (const column of columns) {
      byTable[column.TABLE_NAME]?.push({
        name: column.COLUMN_NAME,
        type: column.COLUMN_TYPE,
        nullable: column.IS_NULLABLE,
        default: column.COLUMN_DEFAULT === null ? null : String(column.COLUMN_DEFAULT),
        extra: column.EXTRA,
      });
    }

    const tables = {};
    for (const table of CRITICAL_TABLES) {
      if (!byTable[table].length) throw new Error(`Critical table is missing: ${table}`);
      const [rows] = await connection.query(`SELECT CAST(COUNT(*) AS CHAR) AS rowCount FROM \`${table}\``);
      tables[table] = {
        rowCount: rows[0].rowCount,
        columnCount: byTable[table].length,
        schemaHash: crypto.createHash('sha256').update(JSON.stringify(byTable[table])).digest('hex'),
      };
    }
    const manifest = { schemaVersion: 1, capturedAt: new Date().toISOString(), database: identity.key, tables };
    await connection.commit();
    transactionStarted = false;
    return manifest;
  } finally {
    if (transactionStarted) await connection.rollback().catch(() => undefined);
    await connection.end();
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (!['snapshot', 'verify'].includes(args.mode)) throw new Error('--mode must be snapshot or verify');
  const manifestPath = resolveManifestPath(process.cwd(), args.manifest);
  const sourceDatabaseUrl = process.env.SOURCE_DATABASE_URL;
  if (!sourceDatabaseUrl) throw new Error('SOURCE_DATABASE_URL is required');

  if (args.mode === 'snapshot') {
    const manifest = await inspectDatabase(sourceDatabaseUrl);
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ passed: true, mode: 'snapshot', manifest: path.relative(process.cwd(), manifestPath), capturedAt: manifest.capturedAt }));
  } else {
    const restoreDatabaseUrl = process.env.RESTORE_DATABASE_URL;
    if (!restoreDatabaseUrl) throw new Error('RESTORE_DATABASE_URL is required');
    validateRestoreTarget({ sourceDatabaseUrl, restoreDatabaseUrl, acknowledgement: process.env.RESTORE_DRILL_ACK });
    const source = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    validateManifestSource(source, sourceDatabaseUrl);
    const restored = await inspectDatabase(restoreDatabaseUrl);
    const comparison = compareRestoreManifests(source, restored);
    console.log(JSON.stringify({ ...comparison, mode: 'verify', checkedAt: restored.capturedAt }, null, 2));
    if (!comparison.ok) process.exitCode = 1;
  }
} catch (error) {
  console.error(`[restore-manifest] ${error instanceof Error ? error.message : 'Restore verification failed'}`);
  process.exitCode = 2;
}
