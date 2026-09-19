import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import '../../drizzle/relations';
import * as schema from '../../drizzle/schema';

export type SariDb = ReturnType<typeof drizzle<typeof schema>>;
export let db: SariDb | null = null;
let pool: mysql.Pool | null = null;
let closing: Promise<void> | null = null;

export function formatDateForDB(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/** One lazily created pool per process; no application domains or runtime DDL. */
export async function getDb(): Promise<SariDb | null> {
  if (closing) throw new Error('Database is shutting down');
  if (db) return db;
  if (!process.env.DATABASE_URL) return null;
  let url: URL;
  try { url = new URL(process.env.DATABASE_URL); }
  catch { throw new Error('Invalid database URL'); }
  if (!['mysql:', 'mysql2:'].includes(url.protocol)) throw new Error('Invalid database protocol');
  const ssl = url.searchParams.get('ssl');
  let candidate: mysql.Pool;
  try { candidate = mysql.createPool({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    timezone: 'Z',
    connectionLimit: 25,
    maxIdle: 10,
    idleTimeout: 60_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30_000,
    waitForConnections: true,
    queueLimit: 100,
    ...(ssl ? { ssl: JSON.parse(ssl) } : {}),
  }); } catch { throw new Error('Invalid database connection configuration'); }
  try {
    // Queue UTC initialization before each physical connection is handed to a caller.
    candidate.pool.on('connection', connection => {
      connection.query("SET SESSION time_zone = '+00:00'", error => {
        if (error) connection.destroy();
      });
    });
    // Initialization is synchronous until publication, including concurrent getDb callers.
    const connection = drizzle({ client: candidate, schema, mode: 'default' }) as unknown as SariDb;
    pool = candidate;
    db = connection;
    return connection;
  } catch {
    await candidate.end();
    throw new Error('Database initialization failed');
  }
}

export async function getPool(): Promise<mysql.Pool | null> {
  await getDb();
  return pool;
}

export function requireDb(): SariDb {
  if (!db || closing) throw new Error('Database not initialized or shutting down');
  return db;
}

export async function closeDb(): Promise<void> {
  if (closing) return closing;
  if (!pool) return;
  const current = pool;
  closing = Promise.resolve().then(() => current.end()).finally(() => {
    pool = null;
    db = null;
    closing = null;
  });
  return closing;
}
