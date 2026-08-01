import { describe, expect, it } from 'vitest';
import { parseCsv } from '../csv.js';

describe('parseCsv', () => {
  it('handles a BOM, CRLF, trailing empty cells, and quoted commas', () => {
    const result = parseCsv('\ufeffname,notes,empty\r\nGitHub,"Personal, primary",\r\n');

    expect(result.issues).toEqual([]);
    expect(result.rows).toEqual([
      { line: 1, values: ['name', 'notes', 'empty'] },
      { line: 2, values: ['GitHub', 'Personal, primary', ''] },
    ]);
  });

  it('preserves escaped quotes and newlines inside a quoted field', () => {
    const result = parseCsv('name,notes\nExample,"First line\nSecond ""quoted"" line"');

    expect(result.issues).toEqual([]);
    expect(result.rows[1]).toEqual({
      line: 2,
      values: ['Example', 'First line\nSecond "quoted" line'],
    });
  });

  it('reports an unclosed quoted field with its starting line', () => {
    const result = parseCsv('name,notes\nExample,"not closed');

    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'csv_unclosed_quote', severity: 'error', row: 2 }),
    );
  });

  it('ignores fully blank rows', () => {
    expect(parseCsv('name,value\n\n\r\nExample,test\n').rows).toHaveLength(2);
  });
});
