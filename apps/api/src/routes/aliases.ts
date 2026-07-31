/**
 * Email alias routes — proxy to SimpleLogin / AnonAddy.
 * API keys are encrypted client-side; server only stores ciphertext.
 * For proxy calls, client decrypts locally and sends plaintext key in request body.
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { aliasSettings } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';

const VALID_PROVIDERS = ['simplelogin', 'anonaddy'] as const;
type AliasProvider = (typeof VALID_PROVIDERS)[number];
const MAX_API_KEY_LENGTH = 4_096;
const MAX_ENCRYPTED_API_KEY_LENGTH = 16_384;
const PROVIDER_TIMEOUT_MS = 15_000;

type Bindings = { DB: D1Database };
type Variables = { userId: string };

export const aliasRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function normalizeCustomBaseUrl(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2_048) return undefined;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isIpLiteral = hostname.includes(':') || /^[0-9.]+$/.test(hostname);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      isIpLiteral ||
      !hostname.includes('.') ||
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local')
    ) {
      return undefined;
    }
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.origin}${path}`;
  } catch {
    return undefined;
  }
}

function isValidEncryptedApiKey(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length < 3 ||
    value.length > MAX_ENCRYPTED_API_KEY_LENGTH
  ) {
    return false;
  }
  const parts = value.split('.');
  return parts.length === 2 && parts.every((part) => part.length > 0);
}

function isValidApiKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_API_KEY_LENGTH;
}

function upstreamError(provider: 'SimpleLogin' | 'AnonAddy', status: number) {
  return { error: `${provider} request failed with status ${status}` };
}

// All alias routes require authentication
aliasRoutes.use('*', authMiddleware);

// ─── PUT /api/settings/alias ────────────────────────────────────────────────
// Save/update alias provider configuration

aliasRoutes.put('/settings/alias', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { provider, encryptedApiKey, baseUrl } = body as Record<string, unknown>;

  if (!provider || typeof provider !== 'string') {
    return c.json({ error: 'Missing provider' }, 400);
  }
  if (!VALID_PROVIDERS.includes(provider as AliasProvider)) {
    return c.json({ error: 'Invalid provider. Must be simplelogin or anonaddy' }, 400);
  }
  if (!isValidEncryptedApiKey(encryptedApiKey)) {
    return c.json({ error: 'Missing encryptedApiKey' }, 400);
  }
  const normalizedBaseUrl = normalizeCustomBaseUrl(baseUrl);
  if (normalizedBaseUrl === undefined) {
    return c.json({ error: 'baseUrl must be a public HTTPS URL without credentials or a query' }, 400);
  }

  const db = createDb(c.env.DB);

  await db
    .insert(aliasSettings)
    .values({
      userId,
      provider: provider as string,
      encryptedApiKey: encryptedApiKey as string,
      baseUrl: normalizedBaseUrl,
    })
    .onConflictDoUpdate({
      target: aliasSettings.userId,
      set: {
        provider: provider as string,
        encryptedApiKey: encryptedApiKey as string,
        baseUrl: normalizedBaseUrl,
      },
    });

  return c.json({ success: true });
});

// ─── GET /api/settings/alias ────────────────────────────────────────────────
// Get alias provider configuration for user

aliasRoutes.get('/settings/alias', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  const config = await db
    .select()
    .from(aliasSettings)
    .where(eq(aliasSettings.userId, userId))
    .get();

  if (!config) {
    return c.json({ error: 'Alias provider not configured' }, 404);
  }

  return c.json({
    provider: config.provider,
    encryptedApiKey: config.encryptedApiKey,
    baseUrl: config.baseUrl,
  });
});

// ─── DELETE /api/settings/alias ─────────────────────────────────────────────
// Remove alias provider configuration

aliasRoutes.delete('/settings/alias', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(aliasSettings)
    .where(eq(aliasSettings.userId, userId))
    .get();

  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  await db.delete(aliasSettings).where(eq(aliasSettings.userId, userId));
  return c.json({ success: true });
});

// ─── POST /api/aliases/generate ─────────────────────────────────────────────
// Generate a new email alias. Client sends decrypted apiKey in body.

aliasRoutes.post('/aliases/generate', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { provider, apiKey, baseUrl } = body as Record<string, unknown>;

  if (!provider || !VALID_PROVIDERS.includes(provider as AliasProvider)) {
    return c.json({ error: 'Invalid provider' }, 400);
  }
  if (!isValidApiKey(apiKey)) {
    return c.json({ error: 'Missing apiKey' }, 400);
  }
  const normalizedBaseUrl = normalizeCustomBaseUrl(baseUrl);
  if (normalizedBaseUrl === undefined) {
    return c.json({ error: 'baseUrl must be a public HTTPS URL without credentials or a query' }, 400);
  }

  try {
    let aliasEmail: string;

    if (provider === 'simplelogin') {
      const slBase = normalizedBaseUrl || 'https://app.simplelogin.io';
      const res = await fetch(`${slBase}/api/alias/random/new`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          Authentication: apiKey,
        },
        body: JSON.stringify({ note: 'Generated by Lockbox' }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });

      if (!res.ok) {
        return c.json(upstreamError('SimpleLogin', res.status), 502);
      }

      const data = (await res.json()) as { alias?: string };
      aliasEmail = data.alias || '';
    } else {
      // anonaddy
      const adBase = normalizedBaseUrl || 'https://app.anonaddy.com';
      const res = await fetch(`${adBase}/api/v1/aliases`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          domain: 'anonaddy.me',
          description: 'Lockbox',
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });

      if (!res.ok) {
        return c.json(upstreamError('AnonAddy', res.status), 502);
      }

      const data = (await res.json()) as { data?: { email?: string } };
      aliasEmail = data.data?.email || '';
    }

    if (!aliasEmail) {
      return c.json({ error: 'Provider returned no alias' }, 502);
    }

    return c.json({ alias: { email: aliasEmail } });
  } catch (err) {
    return c.json({ error: 'Failed to contact alias provider' }, 502);
  }
});

// ─── GET /api/aliases ───────────────────────────────────────────────────────
// List aliases from provider. Client sends provider + apiKey in headers.

aliasRoutes.get('/aliases', async (c) => {
  const provider = c.req.header('X-Alias-Provider');
  const apiKey = c.req.header('X-Alias-ApiKey');
  const baseUrl = c.req.header('X-Alias-BaseUrl');

  if (!provider || !VALID_PROVIDERS.includes(provider as AliasProvider)) {
    return c.json({ error: 'Missing or invalid X-Alias-Provider header' }, 400);
  }
  if (!isValidApiKey(apiKey)) {
    return c.json({ error: 'Missing X-Alias-ApiKey header' }, 400);
  }
  const normalizedBaseUrl = normalizeCustomBaseUrl(baseUrl);
  if (normalizedBaseUrl === undefined) {
    return c.json({ error: 'X-Alias-BaseUrl must be a public HTTPS URL' }, 400);
  }

  try {
    if (provider === 'simplelogin') {
      const slBase = normalizedBaseUrl || 'https://app.simplelogin.io';
      const res = await fetch(`${slBase}/api/v2/aliases?page_id=0`, {
        redirect: 'error',
        headers: { Authentication: apiKey },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });

      if (!res.ok) {
        return c.json(upstreamError('SimpleLogin', res.status), 502);
      }

      const data = (await res.json()) as {
        aliases?: Array<{ alias: string; enabled: boolean; id: number }>;
      };
      const aliases = (data.aliases || []).map((a) => ({
        email: a.alias,
        enabled: a.enabled,
        id: String(a.id),
      }));

      return c.json({ aliases });
    } else {
      // anonaddy
      const adBase = normalizedBaseUrl || 'https://app.anonaddy.com';
      const res = await fetch(`${adBase}/api/v1/aliases`, {
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });

      if (!res.ok) {
        return c.json(upstreamError('AnonAddy', res.status), 502);
      }

      const data = (await res.json()) as {
        data?: Array<{ email: string; active: boolean; id: string }>;
      };
      const aliases = (data.data || []).map((a) => ({
        email: a.email,
        enabled: a.active,
        id: a.id,
      }));

      return c.json({ aliases });
    }
  } catch (err) {
    return c.json({ error: 'Failed to contact alias provider' }, 502);
  }
});
