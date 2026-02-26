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

/** Set the API base URL. */
export async function setApiBaseUrl(url: string): Promise<void> {
  await chrome.storage.local.set({ apiBaseUrl: url });
}
