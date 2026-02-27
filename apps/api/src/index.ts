/**
 * Lockbox API — Cloudflare Workers entry point.
 * Zero-knowledge password manager backend.
 */

import { Hono } from 'hono';
import { authRoutes } from './routes/auth.js';
import { vaultRoutes } from './routes/vault.js';
import { syncRoutes } from './routes/sync.js';
import { wsRoutes } from './routes/ws.js';
import { aiRoutes } from './routes/ai.js';
import { keypairRoutes } from './routes/keypair.js';
import { teamRoutes } from './routes/teams.js';
import { sharingRoutes } from './routes/sharing.js';
import { shareLinkRoutes } from './routes/share-links.js';
import { twofaRoutes } from './routes/twofa.js';
import { attachmentRoutes } from './routes/attachments.js';
import { aliasRoutes } from './routes/aliases.js';
import { emergencyRoutes } from './routes/emergency.js';
import { settingsRoutes } from './routes/settings.js';
import { documentRoutes } from './routes/documents.js';
import { hardwareKeyRoutes } from './routes/hardware-key.js';
import { corsMiddleware, securityHeaders, requestSizeLimit } from './middleware/security.js';
import { VaultSyncHub } from './sync-hub.js';
import { createDb } from './db/index.js';
import { vaultItems, emergencyAccessGrants, emergencyAccessRequests } from './db/schema.js';
import { and, eq, isNotNull, lte } from 'drizzle-orm';

export { VaultSyncHub };

type Bindings = {
  DB: D1Database;
  SYNC_HUB: DurableObjectNamespace;
  AUTH_LIMITER: RateLimit;
  CORS_ORIGINS?: string;
  ATTACHMENTS: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

// Global middleware
app.use('*', corsMiddleware);
app.use('*', securityHeaders);
app.use('*', requestSizeLimit());

// Routes
app.route('/api/auth', authRoutes);
app.route('/api/vault', vaultRoutes);
app.route('/api/sync', syncRoutes);
app.route('/api/sync', wsRoutes);
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
  scheduled: async (event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) => {
    const db = createDb(env.DB);

    // Delete vault items that were soft-deleted more than 30 days ago
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    await db
      .delete(vaultItems)
      .where(and(isNotNull(vaultItems.deletedAt), lte(vaultItems.deletedAt, cutoffDate)));

    // Auto-approve emergency access requests past wait period
    const waitingGrants = await db.select().from(emergencyAccessGrants)
      .where(eq(emergencyAccessGrants.status, 'waiting'));

    for (const grant of waitingGrants) {
      const request = await db.select().from(emergencyAccessRequests)
        .where(eq(emergencyAccessRequests.grantId, grant.id))
        .get();
      if (request && new Date(request.expiresAt) <= new Date()) {
        await db.update(emergencyAccessGrants)
          .set({ status: 'approved', updatedAt: new Date().toISOString() })
          .where(eq(emergencyAccessGrants.id, grant.id));
        await db.update(emergencyAccessRequests)
          .set({ approvedAt: new Date().toISOString() })
          .where(eq(emergencyAccessRequests.id, request.id));
      }
    }
  },
};
