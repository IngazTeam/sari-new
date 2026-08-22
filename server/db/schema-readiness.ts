export type SchemaRequirement = {
  table: string;
  columns?: readonly string[];
  generatedColumns?: readonly string[];
  uniqueIndexes?: readonly string[];
  checkConstraints?: readonly string[];
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
    .map(requirement => [
      requirement.table,
      `columns[${[...(requirement.columns ?? [])].sort().join(',')}]`,
      `generated[${[...(requirement.generatedColumns ?? [])].sort().join(',')}]`,
      `unique[${[...(requirement.uniqueIndexes ?? [])].sort().join(',')}]`,
      `checks[${[...(requirement.checkConstraints ?? [])].sort().join(',')}]`,
    ].join(':'))
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
  const needsUniqueIndexes = requirements.some(requirement => (requirement.uniqueIndexes?.length ?? 0) > 0);
  const needsCheckConstraints = requirements.some(requirement => (requirement.checkConstraints?.length ?? 0) > 0);
  const [columnResult, indexResult, checkResult] = await Promise.all([
    pool.execute(
      `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, EXTRA AS extra
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${placeholders})`,
      tableNames,
    ),
    needsUniqueIndexes
      ? pool.execute(
        `SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique
           FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${placeholders})`,
        tableNames,
      )
      : Promise.resolve([[]]),
    needsCheckConstraints
      ? pool.execute(
        `SELECT TABLE_NAME AS tableName, CONSTRAINT_NAME AS constraintName
           FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
          WHERE CONSTRAINT_SCHEMA = DATABASE()
            AND CONSTRAINT_TYPE = 'CHECK'
            AND TABLE_NAME IN (${placeholders})`,
        tableNames,
      )
      : Promise.resolve([[]]),
  ]);

  const [rows] = columnResult;
  const indexRows = indexResult[0] as unknown as Array<{
    tableName: string;
    indexName: string;
    nonUnique: number | string;
  }>;
  const checkRows = checkResult[0] as unknown as Array<{
    tableName: string;
    constraintName: string;
  }>;

  const available = new Map<string, Map<string, string>>();
  for (const row of rows as Array<{ tableName: string; columnName: string; extra: string }>) {
    const columns = available.get(row.tableName) ?? new Map<string, string>();
    columns.set(row.columnName, row.extra ?? '');
    available.set(row.tableName, columns);
  }
  const uniqueIndexes = new Set(
    indexRows
      .filter(row => Number(row.nonUnique) === 0)
      .map(row => `${row.tableName}.${row.indexName}`),
  );
  const checkConstraints = new Set(
    checkRows.map(row => `${row.tableName}.${row.constraintName}`),
  );

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
    for (const column of requirement.generatedColumns ?? []) {
      const extra = columns.get(column);
      if (extra === undefined || !/\b(?:stored|virtual) generated\b/i.test(extra)) {
        missing.push(`generated-column:${requirement.table}.${column}`);
      }
    }
    for (const indexName of requirement.uniqueIndexes ?? []) {
      if (!uniqueIndexes.has(`${requirement.table}.${indexName}`)) {
        missing.push(`unique-index:${requirement.table}.${indexName}`);
      }
    }
    for (const constraintName of requirement.checkConstraints ?? []) {
      if (!checkConstraints.has(`${requirement.table}.${constraintName}`)) {
        missing.push(`check:${requirement.table}.${constraintName}`);
      }
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
