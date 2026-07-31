/**
 * Lockbox API — Cloudflare Workers entry point.
 * Zero-knowledge password manager backend.
 */

import { Hono } from 'hono';
import { authRoutes } from './routes/auth.js';
import { vaultRoutes } from './routes/vault.js';
import { syncRoutes } from './routes/sync.js';
import { aiRoutes } from './routes/ai.js';
import { keypairRoutes } from './routes/keypair.js';
import { teamRoutes } from './routes/teams.js';
import { sharingRoutes } from './routes/sharing.js';
import { shareLinkRoutes } from './routes/share-links.js';
import { twofaRoutes } from './routes/twofa.js';
import { attachmentRoutes, MAX_ATTACHMENT_REQUEST_SIZE } from './routes/attachments.js';
import { aliasRoutes } from './routes/aliases.js';
import { emergencyRoutes } from './routes/emergency.js';
import { settingsRoutes } from './routes/settings.js';
import { documentRoutes, MAX_DOCUMENT_REQUEST_SIZE } from './routes/documents.js';
import { hardwareKeyRoutes } from './routes/hardware-key.js';
import { corsMiddleware, securityHeaders, requestSizeLimit } from './middleware/security.js';
import { createDb } from './db/index.js';
import { sessions, vaultItems, twoFactorChallenges } from './db/schema.js';
import { and, eq, isNotNull, lte } from 'drizzle-orm';
import { purgeVaultItemStorage } from './services/vault-storage.js';

type Bindings = {
  DB: D1Database;
  AUTH_LIMITER: RateLimit;
  CORS_ORIGINS?: string;
  EXTENSION_IDS?: string;
  ATTACHMENTS: R2Bucket;
};

export const app = new Hono<{ Bindings: Bindings }>();

// Global middleware
app.use('*', corsMiddleware);
app.use('*', securityHeaders);
app.use(
  '*',
  requestSizeLimit((request) => {
    const url = new URL(request.url);
    if (
      request.method === 'POST' &&
      /^\/api\/vault\/items\/[^/]+\/attachments$/.test(url.pathname)
    ) {
      return MAX_ATTACHMENT_REQUEST_SIZE;
    }
    if (
      request.method === 'POST' &&
      /^\/api\/vault\/items\/[^/]+\/document$/.test(url.pathname)
    ) {
      return MAX_DOCUMENT_REQUEST_SIZE;
    }
    return 1_048_576;
  })
);

// Routes
app.route('/api/auth', authRoutes);
app.route('/api/vault', vaultRoutes);
app.route('/api/sync', syncRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api/auth/keypair', keypairRoutes);
app.route('/api/teams', teamRoutes);
app.route('/api/sharing', sharingRoutes);
app.route('/api/share-links', shareLinkRoutes);
app.route('/api/auth/2fa', twofaRoutes);
app.route('/api/vault', attachmentRoutes);
app.route('/api', aliasRoutes);
app.route('/api/emergency', emergencyRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/vault', documentRoutes);
app.route('/api/auth/hardware-key', hardwareKeyRoutes);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

export default {
  fetch: app.fetch,
  scheduled: async (event: ScheduledEvent, env: Bindings, _ctx: ExecutionContext) => {
    const db = createDb(env.DB);

    // Delete vault items that were soft-deleted more than 30 days ago
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const expiredItems = await db
      .select({ id: vaultItems.id, userId: vaultItems.userId })
      .from(vaultItems)
      .where(and(isNotNull(vaultItems.deletedAt), lte(vaultItems.deletedAt, cutoffDate)));

    for (const item of expiredItems) {
      try {
        await purgeVaultItemStorage(env, item.userId, item.id);
        await db
          .delete(vaultItems)
          .where(
            and(
              eq(vaultItems.id, item.id),
              eq(vaultItems.userId, item.userId),
              isNotNull(vaultItems.deletedAt),
              lte(vaultItems.deletedAt, cutoffDate)
            )
          );
      } catch (error) {
        console.error(`Failed to purge expired vault item ${item.id}`, error);
      }
    }

    const now = new Date().toISOString();

    // Remove expired bearer sessions and abandoned password-only challenges so
    // inactive accounts cannot grow D1 indefinitely.
    await db.delete(sessions).where(lte(sessions.expiresAt, now));
    await db
      .delete(twoFactorChallenges)
      .where(lte(twoFactorChallenges.expiresAt, now));

  },
};
