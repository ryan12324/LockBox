import { getImportProvider } from '@lockbox/importers';
import { openWebVault } from './web-vault.js';

export const LASTPASS_IMPORT_ROUTE = '/settings/import-export';
export const extensionImportProvider = getImportProvider('lastpass');

/** Opens the full client-side review flow; popup dimensions are too small for safe CSV review. */
export async function openLastPassImport(): Promise<void> {
  await openWebVault(LASTPASS_IMPORT_ROUTE);
}
