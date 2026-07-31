/**
 * Chrome storage wrapper for extension session management.
 * Uses chrome.storage.session for tokens (cleared on browser close).
 */

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
