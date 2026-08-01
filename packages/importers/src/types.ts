import type { VaultItem } from '@lockbox/types';

export type ImportProviderId = 'lastpass';
export type ImportIssueSeverity = 'error' | 'warning';

export interface ImportIssue {
  code: string;
  message: string;
  severity: ImportIssueSeverity;
  row?: number;
  column?: string;
}

export interface ImportRecord {
  /** Stable within a single parse operation. Never contains secret material. */
  sourceId: string;
  sourceRow: number;
  item: VaultItem;
  folderPath: string[];
  issues: ImportIssue[];
  importable: boolean;
}

export interface ImportParseResult {
  providerId: ImportProviderId;
  records: ImportRecord[];
  issues: ImportIssue[];
  headers: string[];
}

export interface ImportParseOptions {
  now?: () => Date;
  createId?: () => string;
}

export interface ImportProviderAdapter {
  id: ImportProviderId;
  label: string;
  description: string;
  acceptedFileExtensions: readonly string[];
  detect(headers: readonly string[]): number;
  parse(text: string, options?: ImportParseOptions): ImportParseResult;
}

export interface ImportDuplicate {
  sourceId: string;
  existingItemId?: string;
  duplicateSourceId?: string;
}

export interface LegacyLastPassSecureNoteRepair {
  sourceId: string;
  existingItemId: string;
}

export type DuplicateStrategy = 'skip' | 'keep-both';
