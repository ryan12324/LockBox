import type { ImportIssue } from './types.js';

export interface CsvRow {
  values: string[];
  line: number;
}

export interface CsvParseResult {
  rows: CsvRow[];
  issues: ImportIssue[];
}

function isEmptyRow(values: readonly string[]): boolean {
  return values.every((value) => value.trim().length === 0);
}

/**
 * Parse RFC 4180-style CSV without evaluating or transforming cell contents.
 * Handles BOMs, CRLF, quoted commas, escaped quotes, and multiline fields.
 */
export function parseCsv(text: string): CsvParseResult {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: CsvRow[] = [];
  const issues: ImportIssue[] = [];
  let values: string[] = [];
  let value = '';
  let line = 1;
  let rowLine = 1;
  let inQuotes = false;
  let quoteClosed = false;

  const pushRow = () => {
    values.push(value);
    if (!isEmptyRow(values)) rows.push({ values, line: rowLine });
    values = [];
    value = '';
    quoteClosed = false;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          inQuotes = false;
          quoteClosed = true;
        }
      } else if (character === '\r' || character === '\n') {
        if (character === '\r' && source[index + 1] === '\n') index += 1;
        value += '\n';
        line += 1;
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"') {
      if (value.length === 0 && !quoteClosed) {
        inQuotes = true;
      } else {
        issues.push({
          code: 'csv_unexpected_quote',
          message: `Unexpected quote on line ${line}.`,
          severity: 'error',
          row: line,
        });
        value += character;
      }
      continue;
    }

    if (character === ',') {
      values.push(value);
      value = '';
      quoteClosed = false;
      continue;
    }

    if (character === '\r' || character === '\n') {
      pushRow();
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      line += 1;
      rowLine = line;
      continue;
    }

    if (quoteClosed && character !== ' ' && character !== '\t') {
      issues.push({
        code: 'csv_trailing_characters',
        message: `Unexpected characters after a closing quote on line ${line}.`,
        severity: 'error',
        row: line,
      });
    }
    value += character;
  }

  if (inQuotes) {
    issues.push({
      code: 'csv_unclosed_quote',
      message: `A quoted field beginning on line ${rowLine} is not closed.`,
      severity: 'error',
      row: rowLine,
    });
  }

  if (value.length > 0 || values.length > 0) pushRow();
  return { rows, issues };
}
