export interface LockboxServerConnection {
  webBaseUrl: string;
  apiBaseUrl: string;
}

const STORAGE_KEY = 'lockbox-server-connection';
const BUILD_API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function parseOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
      return null;
    }
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname && url.pathname !== '/')
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function isNativeLockboxApp(): boolean {
  const bridge = (globalThis as typeof globalThis & { Capacitor?: CapacitorBridge }).Capacitor;
  try {
    return bridge?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

export function getServerConnection(): LockboxServerConnection | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<LockboxServerConnection>;
    const webBaseUrl = parseOrigin(parsed.webBaseUrl);
    const apiBaseUrl = parseOrigin(parsed.apiBaseUrl);
    return webBaseUrl && apiBaseUrl ? { webBaseUrl, apiBaseUrl } : null;
  } catch {
    return null;
  }
}

export function setServerConnection(connection: LockboxServerConnection): void {
  const webBaseUrl = parseOrigin(connection.webBaseUrl);
  const apiBaseUrl = parseOrigin(connection.apiBaseUrl);
  if (!webBaseUrl || !apiBaseUrl) {
    throw new Error('Authwell could not save an invalid server connection.');
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ webBaseUrl, apiBaseUrl }));
}

export function clearServerConnection(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getApiBaseUrl(): string {
  if (isNativeLockboxApp()) return getServerConnection()?.apiBaseUrl ?? '';
  return BUILD_API_BASE_URL;
}

export function getApiUrl(path: string): string {
  const apiBaseUrl = getApiBaseUrl();
  if (isNativeLockboxApp() && !apiBaseUrl) {
    throw new Error('No Authwell server is connected. Connect your web vault first.');
  }
  return `${apiBaseUrl}${path}`;
}
