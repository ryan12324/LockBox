import {
  getImportProvider,
  type ImportParseOptions,
  type ImportParseResult,
} from '@lockbox/importers';

/** Shared adapter used by the web UI packaged into the Android WebView. */
export const androidLastPassImportProvider = getImportProvider('lastpass');

export function parseLastPassOnAndroid(
  csv: string,
  options?: ImportParseOptions,
): ImportParseResult {
  return androidLastPassImportProvider.parse(csv, options);
}
