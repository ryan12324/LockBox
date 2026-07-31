/**
 * Security middleware: CORS, security headers, request size validation.
 */

import { createMiddleware } from 'hono/factory';

type Env = { Bindings: { CORS_ORIGINS?: string; EXTENSION_IDS?: string } };

function parseAllowedOrigins(envValue?: string): string[] {
  if (!envValue) return [];
  return envValue.split(',').map((o) => o.trim()).filter(Boolean);
}

function isAllowedOrigin(origin: string, allowedOrigins: string[], extensionIds: string[]): boolean {
  if (allowedOrigins.includes(origin)) return true;
  if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
    // Extension origins must be explicitly configured. Accepting every
    // installed extension by default weakens the boundary around authenticated
    // API responses on a user's browser.
    return extensionIds.some((id) =>
      origin === `chrome-extension://${id}` || origin === `moz-extension://${id}`
    );
  }
  return false;
}

/** CORS middleware — allows web vault and browser extension origins. */
export const corsMiddleware = createMiddleware<Env>(async (c, next) => {
  const origin = c.req.header('Origin') ?? '';
  const allowedOrigins = parseAllowedOrigins(c.env?.CORS_ORIGINS);
  const extensionIds = parseAllowedOrigins(c.env?.EXTENSION_IDS);

  if (isAllowedOrigin(origin, allowedOrigins, extensionIds)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    c.header('Access-Control-Allow-Credentials', 'true');
  }

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  await next();
});

/** Security headers middleware — applied to all API responses. */
export const securityHeaders = createMiddleware(async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
});

type SizeLimitResolver = (request: Request) => number;

/**
 * Request size limit middleware. A resolver can grant larger, explicit limits
 * to upload endpoints while keeping JSON routes at the 1MB default.
 */
export function requestSizeLimit(maxBytes: number | SizeLimitResolver = 1_048_576) {
  return createMiddleware(async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD') {
      await next();
      return;
    }

    const resolvedMaxBytes =
      typeof maxBytes === 'function' ? maxBytes(c.req.raw) : maxBytes;
    const contentLength = c.req.header('Content-Length');
    if (contentLength && !/^\d+$/.test(contentLength)) {
      return c.json({ error: 'Invalid Content-Length' }, 400);
    }
    if (contentLength && Number(contentLength) > resolvedMaxBytes) {
      return c.json({ error: 'Request too large' }, 413);
    }

    // A client can omit Content-Length (for example with a chunked request).
    // Inspect a clone up to the configured limit so that omission cannot bypass
    // the application-level cap while leaving the original body for the route.
    if (!contentLength && c.req.raw.body) {
      const reader = c.req.raw.clone().body?.getReader();
      if (reader) {
        let received = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            if (received > resolvedMaxBytes) {
              // Do not await cancellation of a tee'd clone: some runtimes wait
              // for the untouched original branch, which would deadlock before
              // the route is invoked.
              void reader.cancel();
              return c.json({ error: 'Request too large' }, 413);
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
    }

    await next();
  });
}
