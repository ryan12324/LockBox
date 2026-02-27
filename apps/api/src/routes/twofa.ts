/**
 * 2FA routes: setup, verify, disable, validate.
 * Account-level TOTP two-factor authentication with backup codes.
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';

import { createDb } from '../db/index.js';
import { users, sessions, userTotpSettings, backupCodes } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { totp } from '@lockbox/totp';
import { base32Encode, base32Decode } from '@lockbox/totp';

type Bindings = { DB: D1Database; AUTH_LIMITER: RateLimit };
type Variables = { userId: string };

export const twofaRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/** SHA-256 hash a string, returning hex. */
async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
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

/** Verify a TOTP code against a secret with ±1 time-step tolerance. */
async function verifyTotpCode(secretBytes: Uint8Array, code: string): Promise<boolean> {
  const now = Date.now();
  const codes = await Promise.all([
    totp(secretBytes, now - 30000),
    totp(secretBytes, now),
    totp(secretBytes, now + 30000),
  ]);
  return codes.includes(code);
}

// ─── POST /setup ──────────────────────────────────────────────────────────────

twofaRoutes.post('/setup', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  // Check if 2FA is already enabled
  const existing = await db
    .select()
    .from(userTotpSettings)
    .where(and(eq(userTotpSettings.userId, userId), eq(userTotpSettings.enabled, 1)))
    .get();

  if (existing) {
    return c.json({ error: '2FA is already enabled' }, 409);
  }

  // Look up user email
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Generate random 20-byte TOTP secret
  const secretBytes = crypto.getRandomValues(new Uint8Array(20));
  const base32Secret = base32Encode(secretBytes);

  // Build otpauth URI
  const otpauthUri = `otpauth://totp/Lockbox:${encodeURIComponent(user.email)}?secret=${base32Secret}&issuer=Lockbox`;

  // Delete any existing pending setup
  await db.delete(userTotpSettings).where(eq(userTotpSettings.userId, userId));

  // Store the secret
  const now = new Date().toISOString();
  await db.insert(userTotpSettings).values({
    userId,
    encryptedTotpSecret: base32Secret,
    enabled: 0,
    createdAt: now,
  });

  return c.json({ secret: base32Secret, otpauthUri });
});

// ─── POST /verify ─────────────────────────────────────────────────────────────

twofaRoutes.post('/verify', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { code } = body as Record<string, unknown>;
  if (!code || typeof code !== 'string') {
    return c.json({ error: 'Missing code' }, 400);
  }

  // Look up TOTP settings
  const settings = await db
    .select()
    .from(userTotpSettings)
    .where(eq(userTotpSettings.userId, userId))
    .get();

  if (!settings) {
    return c.json({ error: '2FA not set up' }, 400);
  }

  if (settings.enabled === 1) {
    return c.json({ error: '2FA is already enabled' }, 409);
  }

  // Decode secret and verify code
  const secretBytes = base32Decode(settings.encryptedTotpSecret);
  const valid = await verifyTotpCode(secretBytes, code);

  if (!valid) {
    return c.json({ error: 'Invalid code' }, 401);
  }

  // Enable 2FA
  await db.update(userTotpSettings).set({ enabled: 1 }).where(eq(userTotpSettings.userId, userId));

  // Generate 8 backup codes
  const plainCodes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    plainCodes.push(hex);
  }

  // Delete any existing backup codes for this user
  await db.delete(backupCodes).where(eq(backupCodes.userId, userId));

  // Store SHA-256 hashes of backup codes
  const now = new Date().toISOString();
  for (const plainCode of plainCodes) {
    const hash = await sha256(plainCode);
    await db.insert(backupCodes).values({
      id: crypto.randomUUID(),
      userId,
      codeHash: hash,
      used: 0,
      createdAt: now,
    });
  }

  return c.json({ enabled: true, backupCodes: plainCodes });
});

// ─── POST /disable ────────────────────────────────────────────────────────────

twofaRoutes.post('/disable', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { code } = body as Record<string, unknown>;
  if (!code || typeof code !== 'string') {
    return c.json({ error: 'Missing code' }, 400);
  }

  // Look up TOTP settings
  const settings = await db
    .select()
    .from(userTotpSettings)
    .where(and(eq(userTotpSettings.userId, userId), eq(userTotpSettings.enabled, 1)))
    .get();

  if (!settings) {
    return c.json({ error: '2FA is not enabled' }, 400);
  }

  // Verify code
  const secretBytes = base32Decode(settings.encryptedTotpSecret);
  const valid = await verifyTotpCode(secretBytes, code);

  if (!valid) {
    return c.json({ error: 'Invalid code' }, 401);
  }

  // Delete TOTP settings and backup codes
  await db.delete(userTotpSettings).where(eq(userTotpSettings.userId, userId));
  await db.delete(backupCodes).where(eq(backupCodes.userId, userId));

  return c.json({ disabled: true });
});

// ─── POST /validate ───────────────────────────────────────────────────────────

twofaRoutes.post('/validate', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { tempToken, code } = body as Record<string, unknown>;
  if (!tempToken || !code || typeof tempToken !== 'string' || typeof code !== 'string') {
    return c.json({ error: 'Missing tempToken or code' }, 400);
  }

  const db = createDb(c.env.DB);

  // Look up session by tempToken
  const now = new Date().toISOString();
  const session = await db.select().from(sessions).where(eq(sessions.token, tempToken)).get();

  if (!session) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Check if session is expired
  if (session.expiresAt <= now) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const userId = session.userId;

  // Get TOTP settings
  const settings = await db
    .select()
    .from(userTotpSettings)
    .where(and(eq(userTotpSettings.userId, userId), eq(userTotpSettings.enabled, 1)))
    .get();

  if (!settings) {
    return c.json({ error: '2FA is not enabled for this account' }, 400);
  }

  // Try TOTP verification first
  const secretBytes = base32Decode(settings.encryptedTotpSecret);
  let valid = await verifyTotpCode(secretBytes, code);

  // If TOTP fails, try backup code
  if (!valid) {
    const codeHash = await sha256(code);
    const backupCode = await db
      .select()
      .from(backupCodes)
      .where(
        and(
          eq(backupCodes.userId, userId),
          eq(backupCodes.codeHash, codeHash),
          eq(backupCodes.used, 0)
        )
      )
      .get();

    if (backupCode) {
      // Mark backup code as used
      await db.update(backupCodes).set({ used: 1 }).where(eq(backupCodes.id, backupCode.id));
      valid = true;
    }
  }

  if (!valid) {
    return c.json({ error: 'Invalid code' }, 401);
  }

  // Extend session expiry to full 24 hours
  const fullExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await db.update(sessions).set({ expiresAt: fullExpiry }).where(eq(sessions.id, session.id));

  // Get user info for full login response
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({
    token: tempToken,
    user: {
      id: user.id,
      email: user.email,
      kdfConfig: JSON.parse(user.kdfConfig),
      salt: user.salt,
      encryptedUserKey: user.encryptedUserKey,
    },
  });
});
