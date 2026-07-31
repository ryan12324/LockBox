/**
 * Key pair routes — manage user public/private key pairs for E2EE sharing.
 * POST /api/keypair — create or update key pair
 * GET /api/keypair — get own key pair
 * GET /api/keypair/:userId — get public key for a user
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { userKeyPairs } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';

type Bindings = { DB: D1Database };
type Variables = { userId: string };

export const keypairRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function decodeBase64(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function isValidEncryptedPrivateKey(value: string): boolean {
  if (value.length > 16_384) return false;
  const parts = value.split('.');
  if (parts.length !== 2) return false;
  const iv = decodeBase64(parts[0]);
  const ciphertext = decodeBase64(parts[1]);
  return iv?.byteLength === 12 && Boolean(ciphertext && ciphertext.byteLength >= 16);
}

async function isValidPublicKey(value: string): Promise<boolean> {
  if (value.length > 4_096) return false;
  try {
    const jwk = JSON.parse(value) as JsonWebKey;
    if (
      !jwk ||
      typeof jwk !== 'object' ||
      jwk.kty !== 'RSA' ||
      jwk.alg !== 'RSA-OAEP-256' ||
      jwk.e !== 'AQAB' ||
      !Array.isArray(jwk.key_ops) ||
      !jwk.key_ops.includes('encrypt') ||
      jwk.d !== undefined
    ) {
      return false;
    }
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt']
    );
    const algorithm = key.algorithm as RsaHashedKeyAlgorithm;
    return algorithm.modulusLength === 2_048 && algorithm.hash.name === 'SHA-256';
  } catch {
    return false;
  }
}

keypairRoutes.use('*', authMiddleware);

// ─── POST /api/keypair ───────────────────────────────────────────────────────

keypairRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { publicKey, encryptedPrivateKey } = body as Record<string, unknown>;
  if (typeof publicKey !== 'string' || typeof encryptedPrivateKey !== 'string') {
    return c.json({ error: 'Missing required fields: publicKey, encryptedPrivateKey' }, 400);
  }
  if (!(await isValidPublicKey(publicKey)) || !isValidEncryptedPrivateKey(encryptedPrivateKey)) {
    return c.json({ error: 'Invalid sharing key material' }, 400);
  }

  const db = createDb(c.env.DB);

  // Replacing this key pair without re-wrapping every folder key would make
  // existing shares permanently unreadable. Rotation needs a dedicated flow.
  const existing = await db
    .select()
    .from(userKeyPairs)
    .where(eq(userKeyPairs.userId, userId))
    .get();
  if (existing) {
    if (existing.publicKey === publicKey && existing.encryptedPrivateKey === encryptedPrivateKey) {
      return c.json({ success: true }, 200);
    }
    return c.json({ error: 'Sharing key rotation is not supported' }, 409);
  }

  await db.insert(userKeyPairs).values({
    userId,
    publicKey,
    encryptedPrivateKey,
  });

  return c.json({ success: true }, 201);
});

// ─── GET /api/keypair ────────────────────────────────────────────────────────

keypairRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  const kp = await db.select().from(userKeyPairs).where(eq(userKeyPairs.userId, userId)).get();
  if (!kp) return c.json({ error: 'Key pair not found' }, 404);

  return c.json({
    publicKey: kp.publicKey,
    encryptedPrivateKey: kp.encryptedPrivateKey,
    createdAt: kp.createdAt,
  });
});

// ─── GET /api/auth/keypair/public/:userId ───────────────────────────────────

keypairRoutes.get('/public/:userId', async (c) => {
  const targetUserId = c.req.param('userId');
  const db = createDb(c.env.DB);

  const kp = await db
    .select()
    .from(userKeyPairs)
    .where(eq(userKeyPairs.userId, targetUserId))
    .get();
  if (!kp) return c.json({ error: 'Public key not found' }, 404);

  // Only return public key — never expose encrypted private key to other users
  return c.json({
    userId: targetUserId,
    publicKey: kp.publicKey,
  });
});
