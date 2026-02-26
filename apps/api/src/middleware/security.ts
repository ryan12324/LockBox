/**
 * Security middleware: CORS, security headers, request size validation.
 */

import { createMiddleware } from 'hono/factory';

type Env = { Bindings: { CORS_ORIGINS?: string } };

function parseAllowedOrigins(envValue?: string): string[] {
  if (!envValue) return [];
  return envValue.split(',').map((o) => o.trim()).filter(Boolean);
}

function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes(origin)) return true;
  if (origin.startsWith('chrome-extension://')) return true;
  if (origin.startsWith('moz-extension://')) return true;
  return false;
}

/** CORS middleware — allows web vault and browser extension origins. */
export const corsMiddleware = createMiddleware<Env>(async (c, next) => {
  const origin = c.req.header('Origin') ?? '';
  const allowedOrigins = parseAllowedOrigins(c.env.CORS_ORIGINS);

  if (isAllowedOrigin(origin, allowedOrigins)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    c.header('Access-Control-Allow-Credentials', 'true');
  }

  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 200 });
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

/** Request size limit middleware — rejects bodies over maxBytes (default 1MB). */
export function requestSizeLimit(maxBytes = 1_048_576) {
  return createMiddleware(async (c, next) => {
    const contentLength = c.req.header('Content-Length');
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      return c.json({ error: 'Request too large' }, 413);
    }
    await next();
  });
}
