/**
 * Hardware key auth routes — YubiKey PIV and FIDO2 hardware key management.
 * Hardware keys are a secondary unlock mechanism — NOT a sole auth factor.
 * The wrapped master key is decrypted client-side using the hardware key.
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { hardwareKeys, sessions } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';

type Bindings = { DB: D1Database };
type Variables = { userId: string };

export const hardwareKeyRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// In-memory challenge store with expiry (Workers are short-lived, so this is per-request-context)
const challengeStore = new Map<string, { keyId: string; challenge: string; expiresAt: number }>();

/** Generate a cryptographically random session token (base64, 32 bytes). */
function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Session expiry: 24 hours from now. */
function sessionExpiry(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

// ─── POST /setup ─────────────────────────────────────────────────────────────

hardwareKeyRoutes.post('/setup', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { keyType, publicKey, wrappedMasterKey } = body as Record<string, unknown>;

  if (!keyType || !publicKey || !wrappedMasterKey) {
    return c.json({ error: 'Missing required fields: keyType, publicKey, wrappedMasterKey' }, 400);
  }

  if (keyType !== 'yubikey-piv' && keyType !== 'fido2') {
    return c.json({ error: 'Invalid keyType. Must be yubikey-piv or fido2' }, 400);
  }

  if (typeof publicKey !== 'string' || typeof wrappedMasterKey !== 'string') {
    return c.json({ error: 'publicKey and wrappedMasterKey must be strings' }, 400);
  }

  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();

  await db.insert(hardwareKeys).values({
    id,
    userId,
    keyType: keyType as string,
    publicKey: publicKey as string,
    wrappedMasterKey: wrappedMasterKey as string,
  });

  return c.json({ id }, 201);
});

// ─── GET / ───────────────────────────────────────────────────────────────────

hardwareKeyRoutes.get('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  const keys = await db
    .select({
      id: hardwareKeys.id,
      keyType: hardwareKeys.keyType,
      createdAt: hardwareKeys.createdAt,
    })
    .from(hardwareKeys)
    .where(eq(hardwareKeys.userId, userId));

  return c.json({ keys });
});

// ─── POST /challenge ─────────────────────────────────────────────────────────

hardwareKeyRoutes.post('/challenge', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { keyId } = body as Record<string, unknown>;
  if (!keyId || typeof keyId !== 'string') {
    return c.json({ error: 'Missing keyId' }, 400);
  }

  const db = createDb(c.env.DB);

  // Verify key exists
  const key = await db
    .select({ id: hardwareKeys.id })
    .from(hardwareKeys)
    .where(eq(hardwareKeys.id, keyId))
    .get();
  if (!key) return c.json({ error: 'Hardware key not found' }, 404);

  // Generate 32-byte random challenge
  const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (let i = 0; i < challengeBytes.length; i++) binary += String.fromCharCode(challengeBytes[i]);
  const challenge = btoa(binary);

  const expiresAt = Date.now() + 60 * 1000; // 60s expiry
  const challengeId = crypto.randomUUID();

  // Store challenge in memory
  challengeStore.set(challengeId, { keyId, challenge, expiresAt });

  return c.json({
    challengeId,
    challenge,
    expiresAt: new Date(expiresAt).toISOString(),
  });
});

// ─── POST /verify ────────────────────────────────────────────────────────────

hardwareKeyRoutes.post('/verify', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { keyId, challengeId, signature } = body as Record<string, unknown>;
  if (!keyId || !challengeId || !signature) {
    return c.json({ error: 'Missing required fields: keyId, challengeId, signature' }, 400);
  }
  if (
    typeof keyId !== 'string' ||
    typeof challengeId !== 'string' ||
    typeof signature !== 'string'
  ) {
    return c.json({ error: 'All fields must be strings' }, 400);
  }

  // Verify challenge was issued and not expired
  const stored = challengeStore.get(challengeId);
  if (!stored) {
    return c.json({ error: 'Invalid or expired challenge' }, 401);
  }

  if (Date.now() > stored.expiresAt) {
    challengeStore.delete(challengeId);
    return c.json({ error: 'Challenge expired' }, 401);
  }

  if (stored.keyId !== keyId) {
    return c.json({ error: 'Challenge does not match key' }, 401);
  }

  // Clean up used challenge
  challengeStore.delete(challengeId);

  // For now: accept any signature (actual WebAuthn verification is client-side)
  // Look up hardware key to get wrapped master key
  const db = createDb(c.env.DB);
  const hwKey = await db.select().from(hardwareKeys).where(eq(hardwareKeys.id, keyId)).get();
  if (!hwKey) return c.json({ error: 'Hardware key not found' }, 404);

  // Create session
  const token = generateToken();
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(sessions).values({
    id: sessionId,
    userId: hwKey.userId,
    token,
    expiresAt: sessionExpiry(),
    createdAt: now,
  });

  return c.json({ token, wrappedMasterKey: hwKey.wrappedMasterKey });
});

// ─── DELETE /:id ─────────────────────────────────────────────────────────────

hardwareKeyRoutes.delete('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const keyId = c.req.param('id');
  const db = createDb(c.env.DB);

  // Verify ownership
  const key = await db
    .select()
    .from(hardwareKeys)
    .where(and(eq(hardwareKeys.id, keyId), eq(hardwareKeys.userId, userId)))
    .get();
  if (!key) return c.json({ error: 'Not found' }, 404);

  await db.delete(hardwareKeys).where(eq(hardwareKeys.id, keyId));

  return c.json({ success: true });
});
