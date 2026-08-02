/**
 * Chrome storage wrapper for extension session management.
 * Uses chrome.storage.session for tokens (cleared on browser close).
 */

export const INLINE_AUTOFILL_ENABLED_KEY = 'inlineAutofillEnabled';
export const INLINE_AUTOFILL_DISABLED_HOSTS_KEY = 'inlineAutofillDisabledHosts';

export interface InlineAutofillPreferences {
  enabled: boolean;
  disabledHosts: string[];
}

export function normalizeAutofillHost(urlOrHost: string): string {
  const value = urlOrHost.trim().toLowerCase();
  if (!value) return '';

  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  } catch {
    return '';
  }
}

/** Get global and per-site inline autofill preferences. */
export async function getInlineAutofillPreferences(): Promise<InlineAutofillPreferences> {
  const result = await chrome.storage.local.get([
    INLINE_AUTOFILL_ENABLED_KEY,
    INLINE_AUTOFILL_DISABLED_HOSTS_KEY,
  ]);
  const rawHosts = result[INLINE_AUTOFILL_DISABLED_HOSTS_KEY];
  const disabledHosts = Array.isArray(rawHosts)
    ? Array.from(
        new Set(
          rawHosts
            .filter((host): host is string => typeof host === 'string')
            .map(normalizeAutofillHost)
            .filter(Boolean),
        ),
      )
    : [];

  return {
    enabled: result[INLINE_AUTOFILL_ENABLED_KEY] !== false,
    disabledHosts,
  };
}

export async function setInlineAutofillEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [INLINE_AUTOFILL_ENABLED_KEY]: enabled });
}

export async function setInlineAutofillForHost(host: string, enabled: boolean): Promise<void> {
  const normalizedHost = normalizeAutofillHost(host);
  if (!normalizedHost) throw new Error('A valid site is required.');

  const preferences = await getInlineAutofillPreferences();
  const disabledHosts = new Set(preferences.disabledHosts);
  if (enabled) disabledHosts.delete(normalizedHost);
  else disabledHosts.add(normalizedHost);

  await chrome.storage.local.set({
    [INLINE_AUTOFILL_DISABLED_HOSTS_KEY]: Array.from(disabledHosts).sort(),
  });
}

export function inlineAutofillEnabledForHost(
  preferences: InlineAutofillPreferences,
  urlOrHost: string,
): boolean {
  const host = normalizeAutofillHost(urlOrHost);
  return preferences.enabled && Boolean(host) && !preferences.disabledHosts.includes(host);
}

/** Get the stored session token (null if not logged in). */
export async function getSessionToken(): Promise<string | null> {
  const result = await chrome.storage.session.get('token');
  return (result.token as string) ?? null;
}

/** Store the session token. */
export async function setSessionToken(token: string): Promise<void> {
  await chrome.storage.session.set({ token });
}

/** Clear all session data (token, etc.). */
export async function clearSession(): Promise<void> {
  await chrome.storage.session.clear();
}

/** Get the stored email (for re-auth after browser restart). */
export async function getStoredEmail(): Promise<string | null> {
  const result = await chrome.storage.local.get('email');
  return (result.email as string) ?? null;
}

/** Store the email for re-auth. */
export async function setStoredEmail(email: string): Promise<void> {
  await chrome.storage.local.set({ email });
}

/** Get the API base URL from storage (set during initial setup). */
export async function getApiBaseUrl(): Promise<string> {
  const result = await chrome.storage.local.get('apiBaseUrl');
  return (result.apiBaseUrl as string) ?? '';
}

/** Get the verified web vault trust anchor from storage. */
export async function getWebBaseUrl(): Promise<string> {
  const result = await chrome.storage.local.get('webBaseUrl');
  return (result.webBaseUrl as string) ?? '';
}

/** Store the verified web trust anchor and its discovered API atomically. */
export async function setServerConnection(connection: {
  webBaseUrl: string;
  apiBaseUrl: string;
}): Promise<void> {
  await chrome.storage.local.set(connection);
}

/** Remove server routing so the setup flow can run again. */
export async function clearServerConnection(): Promise<void> {
  await chrome.storage.local.remove(['webBaseUrl', 'apiBaseUrl']);
}
