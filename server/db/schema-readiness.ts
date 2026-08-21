export type SchemaRequirement = {
  table: string;
  columns?: readonly string[];
};

export class DatabaseSchemaOutdatedError extends Error {
  readonly code = 'DATABASE_SCHEMA_OUTDATED';

  constructor(readonly feature: string, readonly missing: readonly string[]) {
    super(`Database schema is not ready for ${feature}: ${missing.join(', ')}`);
    this.name = 'DatabaseSchemaOutdatedError';
  }
}

const readinessChecks = new Map<string, Promise<void>>();

function requirementKey(feature: string, requirements: readonly SchemaRequirement[]): string {
  return `${feature}:${requirements
    .map(requirement => `${requirement.table}[${[...(requirement.columns ?? [])].sort().join(',')}]`)
    .sort()
    .join('|')}`;
}

export async function inspectSchemaRequirements(requirements: readonly SchemaRequirement[]): Promise<string[]> {
  const { getPool } = await import('../db');
  const pool = await getPool();
  if (!pool) return ['database connection'];

  const tableNames = Array.from(new Set(requirements.map(requirement => requirement.table)));
  if (tableNames.length === 0) return [];

  const placeholders = tableNames.map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${placeholders})`,
    tableNames,
  );

  const available = new Map<string, Set<string>>();
  for (const row of rows as Array<{ tableName: string; columnName: string }>) {
    const columns = available.get(row.tableName) ?? new Set<string>();
    columns.add(row.columnName);
    available.set(row.tableName, columns);
  }

  const missing: string[] = [];
  for (const requirement of requirements) {
    const columns = available.get(requirement.table);
    if (!columns) {
      missing.push(`table:${requirement.table}`);
      continue;
    }
    for (const column of requirement.columns ?? []) {
      if (!columns.has(column)) missing.push(`column:${requirement.table}.${column}`);
    }
  }
  return missing;
}

/**
 * Read-only, cached schema gate for feature entry points. Deployments must run
 * migrations before traffic; application requests never mutate the schema.
 */
export async function assertRuntimeSchema(
  feature: string,
  requirements: readonly SchemaRequirement[],
): Promise<void> {
  const key = requirementKey(feature, requirements);
  const existing = readinessChecks.get(key);
  if (existing) return existing;

  const check = inspectSchemaRequirements(requirements).then(missing => {
    if (missing.length > 0) throw new DatabaseSchemaOutdatedError(feature, missing);
  });
  readinessChecks.set(key, check);

  try {
    await check;
  } catch (error) {
    readinessChecks.delete(key);
    throw error;
  }
}

export function clearSchemaReadinessCacheForTests(): void {
  readinessChecks.clear();
}
