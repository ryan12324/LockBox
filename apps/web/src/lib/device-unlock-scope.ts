import { getApiBaseUrl } from './server-connection.js';

/** Bind every device unlock envelope to one Authwell server and account. */
export function deviceUnlockScope(accountId: string): string {
  if (!accountId || accountId.length > 256) {
    throw new Error('The account is unavailable for device unlock');
  }

  const configuredApi = getApiBaseUrl();
  const apiOrigin = configuredApi
    ? new URL(configuredApi, window.location.origin).origin
    : window.location.origin;
  return `${apiOrigin}#${accountId}`;
}
