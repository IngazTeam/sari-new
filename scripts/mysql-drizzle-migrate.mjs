import mysql from 'mysql2/promise';
import { readMigrationFiles } from 'drizzle-orm/migrator';

const migrationsTable = '__drizzle_migrations';
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run migrations');
}

const connection = await mysql.createConnection(databaseUrl);

try {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`${migrationsTable}\` (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `);

  const [rows] = await connection.query(
    `SELECT id, hash, created_at FROM \`${migrationsTable}\` ORDER BY created_at DESC LIMIT 1`,
  );
  const lastMigration = Array.isArray(rows) ? rows[0] : undefined;
  const lastCreatedAt = lastMigration ? Number(lastMigration.created_at) : undefined;
  const migrations = readMigrationFiles({ migrationsFolder: './drizzle' });

  for (const migration of migrations) {
    if (lastCreatedAt !== undefined && lastCreatedAt >= migration.folderMillis) {
      continue;
    }

    console.log(`Applying migration ${migration.folderMillis}`);
    for (const statement of migration.sql) {
      await connection.query(statement);
    }
    await connection.query(
      `INSERT INTO \`${migrationsTable}\` (\`hash\`, \`created_at\`) VALUES (?, ?)`,
      [migration.hash, migration.folderMillis],
    );
  }

  console.log('Migrations applied successfully');
} finally {
  await connection.end();
}
