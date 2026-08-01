import type { CustomField, LoginItem, SecureNoteItem, VaultItem } from '@lockbox/types';
import { parseTotpSecret } from '@lockbox/totp';
import { parseCsv } from './csv.js';
import type {
  ImportIssue,
  ImportParseOptions,
  ImportParseResult,
  ImportProviderAdapter,
  ImportRecord,
  LegacyLastPassSecureNoteRepair,
} from './types.js';

const REQUIRED_HEADERS = ['url', 'username', 'password', 'name'] as const;
const KNOWN_HEADERS = new Set([
  'url',
  'username',
  'password',
  'extra',
  'name',
  'grouping',
  'fav',
  'totp',
]);

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    quot: '"',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }
    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }
    return named[normalized] ?? match;
  });
}

function clean(value: string | undefined): string {
  return decodeHtmlEntities(value ?? '').split(String.fromCharCode(0)).join('').trim();
}

function validatedTotp(value: string, row: number, issues: ImportIssue[]): string | undefined {
  if (!value) return undefined;
  try {
    parseTotpSecret(value);
    return value;
  } catch {
    issues.push({
      code: 'lastpass_invalid_totp',
      message: 'The authenticator value is invalid and will be preserved as a hidden field.',
      severity: 'warning',
      row,
      column: 'totp',
    });
    return undefined;
  }
}

export function isLastPassSecureNoteUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLocaleLowerCase().replace(/\.$/, '');
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && hostname === 'sn';
  } catch {
    // Keep recognising the LastPass sentinel even when an older export has a
    // harmless suffix that the URL parser does not accept verbatim.
    return /^https?:\/\/sn(?:[/?#]|$)/i.test(trimmed);
  }
}

function nameFromUrl(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '') || value;
  } catch {
    return value;
  }
}

function parseFavorite(value: string, row: number, issues: ImportIssue[]): boolean {
  if (!value) return false;
  if (/^(1|true|yes)$/i.test(value)) return true;
  if (/^(0|false|no)$/i.test(value)) return false;
  issues.push({
    code: 'lastpass_unknown_favorite',
    message: 'Favourite value was not recognised and was treated as off.',
    severity: 'warning',
    row,
    column: 'fav',
  });
  return false;
}

function parseFolderPath(value: string, row: number, issues: ImportIssue[]): string[] {
  const segments = value
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length > 16) {
    issues.push({
      code: 'lastpass_folder_depth',
      message: 'Only the first 16 folder levels will be imported.',
      severity: 'warning',
      row,
      column: 'grouping',
    });
  }
  return segments.slice(0, 16).map((segment) => {
    if (segment.length <= 100) return segment;
    issues.push({
      code: 'lastpass_folder_name_truncated',
      message: `Folder “${segment.slice(0, 24)}…” was shortened to 100 characters.`,
      severity: 'warning',
      row,
      column: 'grouping',
    });
    return segment.slice(0, 100);
  });
}

function makeBaseItem(
  id: string,
  type: VaultItem['type'],
  name: string,
  favorite: boolean,
  timestamp: string,
): Pick<VaultItem, 'id' | 'type' | 'name' | 'favorite' | 'tags' | 'createdAt' | 'updatedAt' | 'revisionDate'> {
  return {
    id,
    type,
    name,
    favorite,
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    revisionDate: timestamp,
  };
}

function cell(row: readonly string[], indexByHeader: ReadonlyMap<string, number>, name: string): string {
  const index = indexByHeader.get(name);
  return index === undefined ? '' : clean(row[index]);
}

function buildItem(
  values: readonly string[],
  indexByHeader: ReadonlyMap<string, number>,
  sourceRow: number,
  options: Required<ImportParseOptions>,
): ImportRecord | null {
  const issues: ImportIssue[] = [];
  const url = cell(values, indexByHeader, 'url');
  const username = cell(values, indexByHeader, 'username');
  const password = cell(values, indexByHeader, 'password');
  const extra = cell(values, indexByHeader, 'extra');
  const suppliedName = cell(values, indexByHeader, 'name');
  const grouping = cell(values, indexByHeader, 'grouping');
  const totp = cell(values, indexByHeader, 'totp');
  const usableTotp = validatedTotp(totp, sourceRow, issues);
  const favorite = parseFavorite(cell(values, indexByHeader, 'fav'), sourceRow, issues);

  if (![url, username, password, extra, suppliedName, grouping, totp].some(Boolean)) return null;

  const secureNote = isLastPassSecureNoteUrl(url);
  const fallbackName = secureNote ? 'Imported secure note' : nameFromUrl(url) || 'Imported login';
  const name = suppliedName || fallbackName;
  if (!suppliedName) {
    issues.push({
      code: 'lastpass_missing_name',
      message: `No name was supplied; Lockbox will use “${name}”.`,
      severity: 'warning',
      row: sourceRow,
      column: 'name',
    });
  }

  const timestamp = options.now().toISOString();
  const id = options.createId();
  let item: VaultItem;

  if (secureNote) {
    const customFields: CustomField[] = [];
    if (username) customFields.push({ name: 'LastPass username', value: username, type: 'text' });
    if (password) customFields.push({ name: 'LastPass password', value: password, type: 'hidden' });
    if (totp) {
      customFields.push({ name: 'LastPass authenticator', value: totp, type: 'hidden' });
      if (usableTotp) {
        issues.push({
          code: 'lastpass_note_totp_preserved',
          message: 'The secure note authenticator value will be preserved as a hidden field.',
          severity: 'warning',
          row: sourceRow,
          column: 'totp',
        });
      }
    }
    const noteItem: SecureNoteItem = {
      ...makeBaseItem(id, 'note', name, favorite, timestamp),
      type: 'note',
      content: extra,
      customFields: customFields.length > 0 ? customFields : undefined,
    };
    item = noteItem;
    if (!extra && customFields.length === 0) {
      issues.push({
        code: 'lastpass_empty_note',
        message: 'This secure note has no content to import.',
        severity: 'error',
        row: sourceRow,
      });
    }
  } else {
    const customFields: CustomField[] = [];
    if (extra) customFields.push({ name: 'LastPass notes', value: extra, type: 'text' });
    if (totp && !usableTotp) {
      customFields.push({
        name: 'LastPass authenticator (invalid)',
        value: totp,
        type: 'hidden',
      });
    }
    const loginItem: LoginItem = {
      ...makeBaseItem(id, 'login', name, favorite, timestamp),
      type: 'login',
      username,
      password,
      uris: url ? [url] : [],
      totp: usableTotp,
      customFields: customFields.length > 0 ? customFields : undefined,
    };
    item = loginItem;
    if (![url, username, password, extra, totp].some(Boolean)) {
      issues.push({
        code: 'lastpass_empty_login',
        message: 'This login has no URL, username, password, note, or authenticator secret.',
        severity: 'error',
        row: sourceRow,
      });
    }
    if (url) {
      try {
        new URL(url);
      } catch {
        issues.push({
          code: 'lastpass_unusual_url',
          message: 'The URL is not absolute. It will be preserved exactly as exported.',
          severity: 'warning',
          row: sourceRow,
          column: 'url',
        });
      }
    }
  }

  return {
    sourceId: `lastpass:${sourceRow}:${id}`,
    sourceRow,
    item,
    folderPath: parseFolderPath(grouping, sourceRow, issues),
    issues,
    importable: !issues.some((issue) => issue.severity === 'error'),
  };
}

function createDefaultId(): string {
  return crypto.randomUUID();
}

export const lastPassAdapter: ImportProviderAdapter = {
  id: 'lastpass',
  label: 'LastPass',
  description: 'LastPass CSV export',
  acceptedFileExtensions: ['.csv'],
  detect(headers) {
    const normalized = new Set(headers.map((header) => header.toLowerCase().trim()));
    const matches = [...KNOWN_HEADERS].filter((header) => normalized.has(header)).length;
    if (!REQUIRED_HEADERS.every((header) => normalized.has(header))) return 0;
    return matches / KNOWN_HEADERS.size;
  },
  parse(text, suppliedOptions = {}): ImportParseResult {
    const options: Required<ImportParseOptions> = {
      now: suppliedOptions.now ?? (() => new Date()),
      createId: suppliedOptions.createId ?? createDefaultId,
    };
    const csv = parseCsv(text);
    const issues = [...csv.issues];
    const headerRow = csv.rows[0];
    if (!headerRow) {
      issues.push({
        code: 'lastpass_empty_file',
        message: 'The selected file is empty.',
        severity: 'error',
      });
      return { providerId: 'lastpass', records: [], issues, headers: [] };
    }

    const headers = headerRow.values.map((header) => clean(header).toLowerCase());
    const indexByHeader = new Map<string, number>();
    headers.forEach((header, index) => {
      if (indexByHeader.has(header)) {
        issues.push({
          code: 'lastpass_duplicate_header',
          message: `The “${header}” column appears more than once.`,
          severity: 'error',
          row: headerRow.line,
          column: header,
        });
      } else {
        indexByHeader.set(header, index);
      }
    });

    for (const required of REQUIRED_HEADERS) {
      if (!indexByHeader.has(required)) {
        issues.push({
          code: 'lastpass_missing_header',
          message: `This does not look like a LastPass export: the “${required}” column is missing.`,
          severity: 'error',
          row: headerRow.line,
          column: required,
        });
      }
    }

    if (issues.some((issue) => issue.severity === 'error')) {
      return { providerId: 'lastpass', records: [], issues, headers };
    }

    const records: ImportRecord[] = [];
    for (const row of csv.rows.slice(1)) {
      const record = buildItem(row.values, indexByHeader, row.line, options);
      if (!record) continue;
      if (row.values.length > headers.length) {
        record.issues.push({
          code: 'lastpass_extra_columns',
          message: 'Extra columns were ignored on this row.',
          severity: 'warning',
          row: row.line,
        });
      }
      records.push(record);
    }

    if (records.length === 0) {
      issues.push({
        code: 'lastpass_no_items',
        message: 'No LastPass items were found in this file.',
        severity: 'error',
      });
    }
    return { providerId: 'lastpass', records, issues, headers };
  },
};

function normalizedRepairName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

function repairKey(name: string, username: string, password: string): string {
  return [normalizedRepairName(name), username, password].join('\u001f');
}

function noteField(item: SecureNoteItem, fieldName: string): string {
  return item.customFields?.find((field) => field.name === fieldName)?.value ?? '';
}

/**
 * Matches secure notes from a fresh LastPass CSV to broken login records made by
 * Lockbox's legacy importer. Only one-to-one matches are returned so cleanup can
 * never guess when multiple records share the same identifying data.
 */
export function findLegacyLastPassSecureNoteRepairs(
  records: readonly ImportRecord[],
  existingItems: readonly VaultItem[],
): LegacyLastPassSecureNoteRepair[] {
  const incomingByKey = new Map<string, ImportRecord[]>();
  for (const record of records) {
    if (record.item.type !== 'note') continue;
    const note = record.item as SecureNoteItem;
    const key = repairKey(
      note.name,
      noteField(note, 'LastPass username'),
      noteField(note, 'LastPass password'),
    );
    incomingByKey.set(key, [...(incomingByKey.get(key) ?? []), record]);
  }

  const legacyByKey = new Map<string, LoginItem[]>();
  for (const item of existingItems) {
    if (item.type !== 'login') continue;
    const login = item as LoginItem;
    if (!login.uris.some(isLastPassSecureNoteUrl)) continue;
    const key = repairKey(login.name, login.username, login.password);
    legacyByKey.set(key, [...(legacyByKey.get(key) ?? []), login]);
  }

  const repairs: LegacyLastPassSecureNoteRepair[] = [];
  for (const [key, incoming] of incomingByKey) {
    const legacy = legacyByKey.get(key);
    if (incoming.length !== 1 || legacy?.length !== 1) continue;
    repairs.push({ sourceId: incoming[0].sourceId, existingItemId: legacy[0].id });
  }
  return repairs;
}
