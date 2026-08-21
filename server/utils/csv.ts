const DANGEROUS_FORMULA_PREFIX = /^\s*[=+\-@]/;

/**
 * Escape a CSV cell and neutralize spreadsheet formula injection.
 * A leading apostrophe is intentionally visible to spreadsheet engines as text.
 */
export function escapeCsvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (DANGEROUS_FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map(row => row.map(escapeCsvCell).join(',')),
  ];

  // UTF-8 BOM keeps Arabic headers readable in Excel.
  return `\uFEFF${lines.join('\r\n')}`;
}
