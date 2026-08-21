import { describe, expect, it } from 'vitest';
import { buildCsv, escapeCsvCell } from './csv';

describe('CSV export hardening', () => {
  it('escapes quotes and commas', () => {
    expect(escapeCsvCell('a,"b"')).toBe('"a,""b"""');
  });

  it.each(['=1+1', '+SUM(A1:A2)', '-2+3', '@cmd'])('neutralizes formula prefix %s', value => {
    expect(escapeCsvCell(value)).toBe(`"'${value}"`);
  });

  it('adds a UTF-8 BOM and CRLF rows', () => {
    expect(buildCsv(['الاسم'], [['عميل']])).toBe('\uFEFF"الاسم"\r\n"عميل"');
  });
});
