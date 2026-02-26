/**
 * Auth routes: register, login, logout, refresh, me, change-password.
 * Security model: client sends authHash (PBKDF2 of masterKey), server stores Argon2id(authHash).
 * Server NEVER sees the master password or master key.
 */

import { Hono } from 'hono';
import { eq, and, ne } from 'drizzle-orm';

import { createDb } from '../db/index.js';
import { users, sessions } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';

type Bindings = { DB: D1Database; AUTH_LIMITER: RateLimit };
type Variables = { userId: string };

export const authRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// PBKDF2 parameters for server-side auth hash hashing.
// The auth hash is already high-entropy (derived client-side via Argon2id),
// so PBKDF2 here is defense-in-depth for stored credentials.
const PBKDF2_SERVER_ITERATIONS = 100_000;
const HASH_LENGTH = 32;

/** Derive a deterministic 16-byte salt from an email address using SHA-256. */
async function emailToArgonSalt(email: string): Promise<Uint8Array> {
  const emailBytes = new TextEncoder().encode(email.toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', emailBytes);
  return new Uint8Array(hashBuffer).slice(0, 16);
}

/** Hash the client's authHash with PBKDF2-SHA256 for server-side storage. */
async function hashAuthHash(authHash: string, email: string): Promise<string> {
  const salt = await emailToArgonSalt(email);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authHash),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as Uint8Array<ArrayBuffer>,
      iterations: PBKDF2_SERVER_ITERATIONS,
    },
    keyMaterial,
    HASH_LENGTH * 8,
  );
  // Return hex string
  return Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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

// ─── GET /kdf-params ─────────────────────────────────────────────────────────

authRoutes.get('/kdf-params', async (c) => {
  const email = c.req.query('email');
  if (!email || typeof email !== 'string') {
    return c.json({ error: 'Missing email parameter' }, 400);
  }

  const db = createDb(c.env.DB);
  const user = await db.select().from(users).where(eq(users.email, email)).get();

  // Always return 200 — don't reveal whether email exists (timing-safe: same response shape)
  if (!user) {
    // Return default KDF params for unknown emails (prevents email enumeration)
    return c.json({
      kdfConfig: { type: 'argon2id', iterations: 3, memory: 65536, parallelism: 4 },
      salt: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),
    });
  }

  return c.json({
    kdfConfig: JSON.parse(user.kdfConfig),
    salt: user.salt,
  });
});

// ─── POST /register ───────────────────────────────────────────────────────────

authRoutes.post('/register', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'unknown';
  const { success } = await c.env.AUTH_LIMITER.limit({ key: ip });
  if (!success) return c.json({ error: 'Too many requests' }, 429);
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { email, authHash, encryptedUserKey, kdfConfig, salt } = body as Record<string, unknown>;

  if (!email || !authHash || !encryptedUserKey || !kdfConfig || !salt) {
    return c.json({ error: 'Missing required fields' }, 400);
  }
  if (typeof email !== 'string' || typeof authHash !== 'string') {
    return c.json({ error: 'Invalid field types' }, 400);
  }

  const db = createDb(c.env.DB);
  const now = new Date().toISOString();

  // Check for duplicate email
  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) return c.json({ error: 'Email already registered' }, 409);

  // Double-hash the authHash on server side
  const serverAuthHash = await hashAuthHash(authHash, email);

  const userId = crypto.randomUUID();
  const token = generateToken();
  const sessionId = crypto.randomUUID();

  await db.insert(users).values({
    id: userId,
    email,
    authHash: serverAuthHash,
    encryptedUserKey: encryptedUserKey as string,
    kdfConfig: JSON.stringify(kdfConfig),
    salt: salt as string,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    token,
    expiresAt: sessionExpiry(),
    createdAt: now,
  });

  return c.json(
    {
      token,
      user: { id: userId, email, kdfConfig, salt },
    },
    201,
  );
});

// ─── POST /login ──────────────────────────────────────────────────────────────

authRoutes.post('/login', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'unknown';
  const { success } = await c.env.AUTH_LIMITER.limit({ key: ip });
  if (!success) return c.json({ error: 'Too many requests' }, 429);
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { email, authHash } = body as Record<string, unknown>;
  if (!email || !authHash || typeof email !== 'string' || typeof authHash !== 'string') {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const db = createDb(c.env.DB);

  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    // Constant-time: still hash even if user not found to prevent timing attacks
    await hashAuthHash(authHash, email);
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const serverHash = await hashAuthHash(authHash, email);

  // Constant-time comparison
  if (serverHash !== user.authHash) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const token = generateToken();
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    token,
    expiresAt: sessionExpiry(),
    createdAt: now,
  });

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      kdfConfig: JSON.parse(user.kdfConfig),
      salt: user.salt,
      encryptedUserKey: user.encryptedUserKey,
    },
  });
});

// ─── POST /logout ─────────────────────────────────────────────────────────────

authRoutes.post('/logout', authMiddleware, async (c) => {
  const authHeader = c.req.header('Authorization')!;
  const token = authHeader.slice(7);
  const db = createDb(c.env.DB);

  await db.delete(sessions).where(eq(sessions.token, token));
  return c.json({ success: true });
});

// ─── POST /refresh ────────────────────────────────────────────────────────────

authRoutes.post('/refresh', authMiddleware, async (c) => {
  const authHeader = c.req.header('Authorization')!;
  const token = authHeader.slice(7);
  const db = createDb(c.env.DB);
  const newExpiry = sessionExpiry();

  await db.update(sessions).set({ expiresAt: newExpiry }).where(eq(sessions.token, token));
  return c.json({ token, expiresAt: newExpiry });
});

// ─── GET /me ──────────────────────────────────────────────────────────────────

authRoutes.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return c.json({ error: 'User not found' }, 404);

  return c.json({
    id: user.id,
    email: user.email,
    kdfConfig: JSON.parse(user.kdfConfig),
    salt: user.salt,
  });
});

// ─── POST /change-password ────────────────────────────────────────────────────

authRoutes.post('/change-password', authMiddleware, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { currentAuthHash, newAuthHash, newEncryptedUserKey, newKdfConfig, newSalt } =
    body as Record<string, unknown>;

  if (!currentAuthHash || !newAuthHash || !newEncryptedUserKey || !newKdfConfig || !newSalt) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return c.json({ error: 'User not found' }, 404);

  // Verify current auth hash
  const currentServerHash = await hashAuthHash(currentAuthHash as string, user.email);
  if (currentServerHash !== user.authHash) {
    return c.json({ error: 'Invalid current password' }, 401);
  }

  // Hash new auth hash
  const newServerHash = await hashAuthHash(newAuthHash as string, user.email);
  const now = new Date().toISOString();

  // Update user record
  await db
    .update(users)
    .set({
      authHash: newServerHash,
      encryptedUserKey: newEncryptedUserKey as string,
      kdfConfig: JSON.stringify(newKdfConfig),
      salt: newSalt as string,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  // Invalidate all OTHER sessions (keep current)
  const currentToken = c.req.header('Authorization')!.slice(7);
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.token, currentToken)));

  return c.json({ success: true });
});
