import {
  LOCKBOX_DISCOVERY_PATH,
  LOCKBOX_PRODUCT,
  LOCKBOX_PROTOCOL_VERSION,
  type LockboxDiscoveryDocument,
  type LockboxHealthResponse,
} from '@lockbox/types/discovery';
import type { LockboxServerConnection } from './server-connection.js';

export type DiscoveryErrorCode =
  | 'invalid-url'
  | 'insecure-url'
  | 'discovery-unavailable'
  | 'discovery-not-found'
  | 'discovery-invalid'
  | 'unsupported-protocol'
  | 'api-unavailable'
  | 'api-invalid';

export class LockboxDiscoveryError extends Error {
  constructor(
    public readonly code: DiscoveryErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'LockboxDiscoveryError';
  }
}

type FetchImplementation = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function parseTrustedOrigin(input: string): URL {
  const candidate = input.includes('://') ? input : `https://${input}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new LockboxDiscoveryError(
      'invalid-url',
      'Enter the address of your Authwell web vault, such as https://vault.example.com.'
    );
  }

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
    throw new LockboxDiscoveryError(
      'insecure-url',
      'Your Authwell web vault must use HTTPS. HTTP is allowed only for local development.'
    );
  }
  if (url.username || url.password) {
    throw new LockboxDiscoveryError('invalid-url', 'The web vault URL cannot contain credentials.');
  }

  return new URL(url.origin);
}

function assertJsonResponse(response: Response, message: string, code: DiscoveryErrorCode): void {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new LockboxDiscoveryError(code, message);
  }
}

async function fetchWithTimeout(
  url: string,
  fetchImpl: FetchImplementation,
  code: DiscoveryErrorCode,
  message: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    return await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
    });
  } catch {
    throw new LockboxDiscoveryError(code, message);
  } finally {
    clearTimeout(timeout);
  }
}

function parseApiOrigin(value: unknown, webOrigin: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new LockboxDiscoveryError(
      'discovery-invalid',
      'The web vault did not provide a valid Authwell API address.'
    );
  }
  if (value === '/') return webOrigin;
  if (value.startsWith('/')) {
    throw new LockboxDiscoveryError(
      'discovery-invalid',
      'The web vault published an unsupported API path.'
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LockboxDiscoveryError(
      'discovery-invalid',
      'The web vault published an invalid Authwell API address.'
    );
  }

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
    throw new LockboxDiscoveryError(
      'discovery-invalid',
      'The discovered Authwell API must use HTTPS.'
    );
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname && url.pathname !== '/')
  ) {
    throw new LockboxDiscoveryError(
      'discovery-invalid',
      'The discovered API address must be an origin without credentials, a path, query, or fragment.'
    );
  }
  return url.origin;
}

async function readDiscoveryDocument(
  webOrigin: string,
  fetchImpl: FetchImplementation
): Promise<LockboxDiscoveryDocument> {
  const response = await fetchWithTimeout(
    `${webOrigin}${LOCKBOX_DISCOVERY_PATH}`,
    fetchImpl,
    'discovery-unavailable',
    'Authwell could not reach that web vault. Check the address and try again.'
  );
  if (response.status === 404) {
    throw new LockboxDiscoveryError(
      'discovery-not-found',
      'This server does not publish Authwell app connection settings.'
    );
  }
  if (!response.ok) {
    throw new LockboxDiscoveryError(
      'discovery-unavailable',
      `The web vault could not provide app connection settings (HTTP ${response.status}).`
    );
  }
  assertJsonResponse(
    response,
    'The web vault returned HTML or another invalid discovery response. Redeploy the current web vault and try again.',
    'discovery-invalid'
  );

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new LockboxDiscoveryError(
      'discovery-invalid',
      'The web vault returned malformed app connection settings. Redeploy it and try again.'
    );
  }
  if (!isRecord(body) || body.product !== LOCKBOX_PRODUCT) {
    throw new LockboxDiscoveryError(
      'discovery-invalid',
      'That address is not an Authwell web vault.'
    );
  }
  if (body.protocolVersion !== LOCKBOX_PROTOCOL_VERSION) {
    throw new LockboxDiscoveryError(
      'unsupported-protocol',
      'This Authwell web vault uses an unsupported app protocol. Update the web vault and Android app together.'
    );
  }
  return body as unknown as LockboxDiscoveryDocument;
}

async function verifyApi(apiOrigin: string, fetchImpl: FetchImplementation): Promise<void> {
  const response = await fetchWithTimeout(
    `${apiOrigin}/health`,
    fetchImpl,
    'api-unavailable',
    'The web vault was found, but its API could not be reached. Check the deployment and try again.'
  );
  if (!response.ok) {
    throw new LockboxDiscoveryError(
      'api-unavailable',
      `The discovered API health check failed (HTTP ${response.status}).`
    );
  }
  assertJsonResponse(
    response,
    'The discovered server did not return an Authwell API response.',
    'api-invalid'
  );

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new LockboxDiscoveryError('api-invalid', 'The discovered API returned malformed JSON.');
  }
  const health = body as Partial<LockboxHealthResponse>;
  if (
    !isRecord(body) ||
    health.product !== LOCKBOX_PRODUCT ||
    health.protocolVersion !== LOCKBOX_PROTOCOL_VERSION ||
    health.status !== 'ok' ||
    typeof health.timestamp !== 'string' ||
    Number.isNaN(Date.parse(health.timestamp))
  ) {
    throw new LockboxDiscoveryError(
      'api-invalid',
      'The discovered server could not be verified as a compatible Authwell API.'
    );
  }
}

/** Resolve and verify a Lockbox API using the web vault as the trust anchor. */
export async function discoverLockboxServer(
  input: string,
  fetchImpl: FetchImplementation = fetch
): Promise<LockboxServerConnection> {
  const webOrigin = parseTrustedOrigin(input.trim()).origin;
  let apiOrigin: string;
  try {
    const document = await readDiscoveryDocument(webOrigin, fetchImpl);
    apiOrigin = parseApiOrigin(document.apiBaseUrl, webOrigin);
  } catch (error) {
    if (error instanceof LockboxDiscoveryError && error.code === 'discovery-not-found') {
      try {
        await verifyApi(webOrigin, fetchImpl);
        return { webBaseUrl: webOrigin, apiBaseUrl: webOrigin };
      } catch {
        throw new LockboxDiscoveryError(
          'discovery-not-found',
          'No Authwell configuration was found there. Enter your web vault address, then redeploy the web vault if needed.'
        );
      }
    }
    throw error;
  }
  await verifyApi(apiOrigin, fetchImpl);
  return { webBaseUrl: webOrigin, apiBaseUrl: apiOrigin };
}
