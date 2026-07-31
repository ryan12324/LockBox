/**
 * 2FA routes: setup, verify, disable, validate.
 * Account-level TOTP two-factor authentication with backup codes.
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';

import { createDb } from '../db/index.js';
import {
  users,
  sessions,
  twoFactorChallenges,
  userTotpSettings,
  backupCodes,
} from '../db/schema.js';
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

/** Generate a random 256-bit bearer token. */
function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function isTotpCode(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value);
}

function isLoginVerificationCode(value: unknown): value is string {
  return typeof value === 'string' && (/^\d{6}$/.test(value) || /^[a-fA-F0-9]{16}$/.test(value));
}

// ─── GET /status ─────────────────────────────────────────────────────────────

twofaRoutes.get('/status', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);
  const settings = await db
    .select({ enabled: userTotpSettings.enabled })
    .from(userTotpSettings)
    .where(eq(userTotpSettings.userId, userId))
    .get();
  return c.json({ enabled: settings?.enabled === 1 });
});

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

  // Store or replace the pending secret atomically. The server must retain this
  // secret to verify login codes; it never grants access to vault ciphertext.
  const now = new Date().toISOString();
  await db
    .insert(userTotpSettings)
    .values({
      userId,
      encryptedTotpSecret: base32Secret,
      enabled: 0,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: userTotpSettings.userId,
      set: { encryptedTotpSecret: base32Secret, enabled: 0, createdAt: now },
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
  if (!isTotpCode(code)) {
    return c.json({ error: 'Code must contain 6 digits' }, 400);
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

  // Generate 8 backup codes
  const plainCodes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    plainCodes.push(hex);
  }

  // Prepare all hashes before mutating account state.
  const now = new Date().toISOString();
  const backupCodeRows = await Promise.all(
    plainCodes.map(async (plainCode) => ({
      id: crypto.randomUUID(),
      userId,
      codeHash: await sha256(plainCode),
      used: 0,
      createdAt: now,
    })),
  );

  // Enabling 2FA and replacing its recovery codes is one account transition.
  await db.batch([
    db.delete(backupCodes).where(eq(backupCodes.userId, userId)),
    db.insert(backupCodes).values(backupCodeRows),
    db
      .update(userTotpSettings)
      .set({ enabled: 1 })
      .where(and(eq(userTotpSettings.userId, userId), eq(userTotpSettings.enabled, 0))),
  ]);

  return c.json({ enabled: true, backupCodes: plainCodes });
});

// ─── POST /disable ────────────────────────────────────────────────────────────

twofaRoutes.post('/disable', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { code } = body as Record<string, unknown>;
  if (!isTotpCode(code)) {
    return c.json({ error: 'Code must contain 6 digits' }, 400);
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

  // Remove the factor and its recovery codes atomically.
  await db.batch([
    db.delete(userTotpSettings).where(eq(userTotpSettings.userId, userId)),
    db.delete(backupCodes).where(eq(backupCodes.userId, userId)),
  ]);

  return c.json({ disabled: true });
});

// ─── POST /validate ───────────────────────────────────────────────────────────

twofaRoutes.post('/validate', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'unknown';
  if (c.env?.AUTH_LIMITER) {
    const { success } = await c.env.AUTH_LIMITER.limit({ key: ip });
    if (!success) return c.json({ error: 'Too many requests' }, 429);
  }

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { tempToken, code } = body as Record<string, unknown>;
  if (!tempToken || typeof tempToken !== 'string' || !isLoginVerificationCode(code)) {
    return c.json({ error: 'A valid tempToken and verification code are required' }, 400);
  }

  const db = createDb(c.env.DB);

  // Look up the dedicated pre-auth challenge. It is intentionally never stored
  // in the sessions table, so it cannot authorize any other API route.
  const now = new Date().toISOString();
  const challenge = await db
    .select()
    .from(twoFactorChallenges)
    .where(eq(twoFactorChallenges.token, tempToken))
    .get();

  if (!challenge) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  if (challenge.expiresAt <= now) {
    await db.delete(twoFactorChallenges).where(eq(twoFactorChallenges.id, challenge.id));
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const userId = challenge.userId;

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
  let valid = /^\d{6}$/.test(code) && (await verifyTotpCode(secretBytes, code));

  // If TOTP fails, try backup code
  if (!valid) {
    const codeHash = await sha256(code.toLowerCase());
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
      // Consume the code atomically so concurrent validation cannot reuse it.
      const consumedCode = await db
        .update(backupCodes)
        .set({ used: 1 })
        .where(and(eq(backupCodes.id, backupCode.id), eq(backupCodes.used, 0)))
        .returning({ id: backupCodes.id })
        .get();
      valid = Boolean(consumedCode);
    }
  }

  if (!valid) {
    const attempts = challenge.attempts + 1;
    if (attempts >= 5) {
      await db.delete(twoFactorChallenges).where(eq(twoFactorChallenges.id, challenge.id));
    } else {
      await db
        .update(twoFactorChallenges)
        .set({ attempts })
        .where(eq(twoFactorChallenges.id, challenge.id));
    }
    return c.json({ error: 'Invalid code' }, 401);
  }

  // Consume the challenge before issuing a real session. Only one concurrent
  // validation can delete-and-return it successfully.
  const consumedChallenge = await db
    .delete(twoFactorChallenges)
    .where(eq(twoFactorChallenges.id, challenge.id))
    .returning({ id: twoFactorChallenges.id })
    .get();
  if (!consumedChallenge) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const sessionToken = generateToken();
  const fullExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    token: sessionToken,
    expiresAt: fullExpiry,
    createdAt: now,
  });

  // Get user info for full login response
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({
    token: sessionToken,
    user: {
      id: user.id,
      email: user.email,
      kdfConfig: JSON.parse(user.kdfConfig),
      salt: user.salt,
      encryptedUserKey: user.encryptedUserKey,
    },
  });
});
