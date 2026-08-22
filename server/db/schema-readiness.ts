export type GeneratedColumnRequirement = string | {
  name: string;
  expression: string;
  storage?: 'stored' | 'virtual';
};

export type UniqueIndexRequirement = string | {
  name: string;
  columns: readonly string[];
};

export type CheckConstraintRequirement = string | {
  name: string;
  expression: string;
  enforced?: boolean;
};

export type SchemaRequirement = {
  table: string;
  columns?: readonly string[];
  generatedColumns?: readonly GeneratedColumnRequirement[];
  uniqueIndexes?: readonly UniqueIndexRequirement[];
  checkConstraints?: readonly CheckConstraintRequirement[];
};

export type SchemaReadinessOptions = {
  /**
   * Keep a successful result for the process lifetime. Disable this for rare,
   * security-sensitive mutations that must observe post-startup schema drift.
   * Concurrent callers still share the same in-flight inspection.
   */
  cacheSuccess?: boolean;
};

export class DatabaseSchemaOutdatedError extends Error {
  readonly code = 'DATABASE_SCHEMA_OUTDATED';

  constructor(readonly feature: string, readonly missing: readonly string[]) {
    super(`Database schema is not ready for ${feature}: ${missing.join(', ')}`);
    this.name = 'DatabaseSchemaOutdatedError';
  }
}

const readinessChecks = new Map<string, Promise<void>>();

function namedRequirementKey(
  requirement: GeneratedColumnRequirement | UniqueIndexRequirement | CheckConstraintRequirement,
): string {
  if (typeof requirement === 'string') return requirement;
  if ('columns' in requirement) return `${requirement.name}(${requirement.columns.join(',')})`;
  const definition = requirement as {
    name: string;
    expression: string;
    storage?: 'stored' | 'virtual';
    enforced?: boolean;
  };
  return `${definition.name}=${definition.expression}:storage=${definition.storage ?? 'any'}:enforced=${definition.enforced ?? 'any'}`;
}

function requirementName(
  requirement: GeneratedColumnRequirement | UniqueIndexRequirement | CheckConstraintRequirement,
): string {
  return typeof requirement === 'string' ? requirement : requirement.name;
}

function tokenizeSchemaExpression(expression: string): string[] | null {
  const source = expression
    .replace(/`((?:``|[^`])+)`/g, (_, identifier: string) => identifier.replace(/``/g, '`'))
    .replace(/_[a-z0-9]+\s*(?=')/gi, '')
    .trim();
  const tokens: string[] = [];
  const tokenPattern = /('(?:''|[^'])*'|<=|>=|<>|!=|[(),=<>]|[a-z_][a-z0-9_]*|\d+(?:\.\d+)?)/gi;
  let offset = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(source)) !== null) {
    if (source.slice(offset, match.index).trim() !== '') return null;
    tokens.push(match[1].toLowerCase());
    offset = match.index + match[0].length;
  }
  return source.slice(offset).trim() === '' ? tokens : null;
}

/**
 * Canonicalizes the small deterministic SQL-expression subset used by
 * generated columns and CHECK constraints. Parentheses and AND/OR ordering do
 * not affect the result, while operator precedence and CASE branches do.
 */
function canonicalSchemaExpression(expression: string): string | null {
  const tokens = tokenizeSchemaExpression(expression);
  if (!tokens) return null;
  let cursor = 0;
  const peek = () => tokens[cursor];
  const take = (expected?: string): string | null => {
    const token = tokens[cursor];
    if (token === undefined || (expected !== undefined && token !== expected)) return null;
    cursor += 1;
    return token;
  };

  const combine = (operator: string, operands: string[]): string => {
    const flattened = operands.flatMap(operand => {
      const prefix = `${operator}(`;
      if (!operand.startsWith(prefix) || !operand.endsWith(')')) return [operand];
      const contents = operand.slice(prefix.length, -1);
      const nested: string[] = [];
      let depth = 0;
      let start = 0;
      for (let index = 0; index < contents.length; index += 1) {
        if (contents[index] === '(') depth += 1;
        else if (contents[index] === ')') depth -= 1;
        else if (contents[index] === '|' && depth === 0) {
          nested.push(contents.slice(start, index));
          start = index + 1;
        }
      }
      nested.push(contents.slice(start));
      return nested;
    });
    return `${operator}(${flattened.sort().join('|')})`;
  };

  let parseOr: () => string | null;
  const parsePrimary = (): string | null => {
    if (take('(')) {
      const inner = parseOr();
      if (inner === null || !take(')')) return null;
      return inner;
    }
    if (take('case')) {
      if (!take('when')) return null;
      const condition = parseOr();
      if (condition === null || !take('then')) return null;
      const whenTrue = parseOr();
      if (whenTrue === null || !take('else')) return null;
      const whenFalse = parseOr();
      if (whenFalse === null || !take('end')) return null;
      return `case(${condition}?${whenTrue}:${whenFalse})`;
    }
    const token = take();
    if (token === null) return null;
    if (token.startsWith("'")) return `str:${token.slice(1, -1).replace(/''/g, "'")}`;
    if (/^\d/.test(token)) return `num:${Number(token)}`;
    if (token === 'null' || token === 'true' || token === 'false') return token;
    if (/^[a-z_][a-z0-9_]*$/.test(token)) return `id:${token}`;
    return null;
  };

  const parseComparison = (): string | null => {
    const left = parsePrimary();
    if (left === null) return null;
    const operator = peek();
    if (operator === 'in') {
      take('in');
      if (!take('(')) return null;
      const values: string[] = [];
      while (peek() !== ')') {
        const value = parsePrimary();
        if (value === null) return null;
        values.push(value);
        if (peek() === ',') take(',');
        else if (peek() !== ')') return null;
      }
      if (!take(')')) return null;
      return `in(${left}|${values.sort().join('|')})`;
    }
    if (operator === 'is') {
      take('is');
      const negated = peek() === 'not' ? Boolean(take('not')) : false;
      const right = parsePrimary();
      return right === null ? null : `is${negated ? '-not' : ''}(${left}|${right})`;
    }
    if (operator && ['=', '!=', '<>', '<', '>', '<=', '>='].includes(operator)) {
      take(operator);
      const right = parsePrimary();
      if (right === null) return null;
      const operands = operator === '=' ? [left, right].sort() : [left, right];
      return `${operator}(${operands.join('|')})`;
    }
    return left;
  };

  const parseAnd = (): string | null => {
    const operands: string[] = [];
    const first = parseComparison();
    if (first === null) return null;
    operands.push(first);
    while (peek() === 'and') {
      take('and');
      const next = parseComparison();
      if (next === null) return null;
      operands.push(next);
    }
    return operands.length === 1 ? operands[0] : combine('and', operands);
  };

  parseOr = (): string | null => {
    const operands: string[] = [];
    const first = parseAnd();
    if (first === null) return null;
    operands.push(first);
    while (peek() === 'or') {
      take('or');
      const next = parseAnd();
      if (next === null) return null;
      operands.push(next);
    }
    return operands.length === 1 ? operands[0] : combine('or', operands);
  };

  const result = parseOr();
  return result !== null && cursor === tokens.length ? result : null;
}

function schemaExpressionsMatch(actual: string, expected: string): boolean {
  const actualCanonical = canonicalSchemaExpression(actual);
  const expectedCanonical = canonicalSchemaExpression(expected);
  return actualCanonical !== null
    && expectedCanonical !== null
    && actualCanonical === expectedCanonical;
}

function requirementKey(feature: string, requirements: readonly SchemaRequirement[]): string {
  return `${feature}:${requirements
    .map(requirement => [
      requirement.table,
      `columns[${[...(requirement.columns ?? [])].sort().join(',')}]`,
      `generated[${[...(requirement.generatedColumns ?? [])].map(namedRequirementKey).sort().join(',')}]`,
      `unique[${[...(requirement.uniqueIndexes ?? [])].map(namedRequirementKey).sort().join(',')}]`,
      `checks[${[...(requirement.checkConstraints ?? [])].map(namedRequirementKey).sort().join(',')}]`,
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
      `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, EXTRA AS extra,
              GENERATION_EXPRESSION AS generationExpression
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${placeholders})`,
      tableNames,
    ),
    needsUniqueIndexes
      ? pool.execute(
        `SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique,
                SEQ_IN_INDEX AS seqInIndex, COLUMN_NAME AS columnName
           FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${placeholders})`,
        tableNames,
      )
      : Promise.resolve([[]]),
    needsCheckConstraints
      ? pool.execute(
        `SELECT tc.TABLE_NAME AS tableName, tc.CONSTRAINT_NAME AS constraintName,
                tc.ENFORCED AS enforced, cc.CHECK_CLAUSE AS checkClause
           FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
           JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
             ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
            AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
          WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
            AND tc.CONSTRAINT_TYPE = 'CHECK'
            AND tc.TABLE_NAME IN (${placeholders})`,
        tableNames,
      )
      : Promise.resolve([[]]),
  ]);

  const [rows] = columnResult;
  const indexRows = indexResult[0] as unknown as Array<{
    tableName: string;
    indexName: string;
    nonUnique: number | string;
    seqInIndex: number | string;
    columnName: string;
  }>;
  const checkRows = checkResult[0] as unknown as Array<{
    tableName: string;
    constraintName: string;
    checkClause: string;
    enforced: string;
  }>;

  const available = new Map<string, Map<string, { extra: string; generationExpression: string }>>();
  for (const row of rows as Array<{
    tableName: string;
    columnName: string;
    extra: string;
    generationExpression: string | null;
  }>) {
    const columns = available.get(row.tableName) ?? new Map<string, { extra: string; generationExpression: string }>();
    columns.set(row.columnName, {
      extra: row.extra ?? '',
      generationExpression: row.generationExpression ?? '',
    });
    available.set(row.tableName, columns);
  }
  const uniqueIndexes = new Map<string, string[]>();
  for (const row of indexRows.filter(row => Number(row.nonUnique) === 0)) {
    const key = `${row.tableName}.${row.indexName}`;
    const columns = uniqueIndexes.get(key) ?? [];
    columns[Number(row.seqInIndex) - 1] = row.columnName;
    uniqueIndexes.set(key, columns);
  }
  const checkConstraints = new Map(
    checkRows.map(row => [`${row.tableName}.${row.constraintName}`, {
      expression: row.checkClause ?? '',
      enforced: String(row.enforced).toUpperCase() === 'YES',
    }]),
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
    for (const generatedRequirement of requirement.generatedColumns ?? []) {
      const columnName = requirementName(generatedRequirement);
      const column = columns.get(columnName);
      if (column === undefined || !/\b(?:stored|virtual) generated\b/i.test(column.extra)) {
        missing.push(`generated-column:${requirement.table}.${columnName}`);
      } else if (
        typeof generatedRequirement !== 'string'
        && !schemaExpressionsMatch(column.generationExpression, generatedRequirement.expression)
      ) {
        missing.push(`generated-column-definition:${requirement.table}.${columnName}`);
      } else if (
        typeof generatedRequirement !== 'string'
        && generatedRequirement.storage
        && !new RegExp(`\\b${generatedRequirement.storage} generated\\b`, 'i').test(column.extra)
      ) {
        missing.push(`generated-column-storage:${requirement.table}.${columnName}`);
      }
    }
    for (const indexRequirement of requirement.uniqueIndexes ?? []) {
      const indexName = requirementName(indexRequirement);
      const actualColumns = uniqueIndexes.get(`${requirement.table}.${indexName}`);
      if (!actualColumns) {
        missing.push(`unique-index:${requirement.table}.${indexName}`);
      } else if (
        typeof indexRequirement !== 'string'
        && (actualColumns.length !== indexRequirement.columns.length
          || actualColumns.some((column, index) => column !== indexRequirement.columns[index]))
      ) {
        missing.push(`unique-index-definition:${requirement.table}.${indexName}`);
      }
    }
    for (const checkRequirement of requirement.checkConstraints ?? []) {
      const constraintName = requirementName(checkRequirement);
      const actualConstraint = checkConstraints.get(`${requirement.table}.${constraintName}`);
      if (actualConstraint === undefined) {
        missing.push(`check:${requirement.table}.${constraintName}`);
      } else if (
        typeof checkRequirement !== 'string'
        && !schemaExpressionsMatch(actualConstraint.expression, checkRequirement.expression)
      ) {
        missing.push(`check-definition:${requirement.table}.${constraintName}`);
      } else if (
        typeof checkRequirement !== 'string'
        && checkRequirement.enforced === true
        && !actualConstraint.enforced
      ) {
        missing.push(`check-enforcement:${requirement.table}.${constraintName}`);
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
  options: SchemaReadinessOptions = {},
): Promise<void> {
  const cacheSuccess = options.cacheSuccess !== false;
  const key = `${requirementKey(feature, requirements)}:cache-success=${cacheSuccess}`;
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
  } finally {
    if (!cacheSuccess && readinessChecks.get(key) === check) {
      readinessChecks.delete(key);
    }
  }
}

export function clearSchemaReadinessCacheForTests(): void {
  readinessChecks.clear();
}
