/**
 * Lockbox API — Cloudflare Workers entry point.
 * Zero-knowledge password manager backend.
 */

import { Hono } from 'hono';
import { authRoutes } from './routes/auth.js';
import { vaultRoutes } from './routes/vault.js';
import { syncRoutes } from './routes/sync.js';
import { wsRoutes } from './routes/ws.js';
import { corsMiddleware, securityHeaders, requestSizeLimit } from './middleware/security.js';
import { VaultSyncHub } from './sync-hub.js';

export { VaultSyncHub };

type Bindings = {
  DB: D1Database;
  SYNC_HUB: DurableObjectNamespace;
  AUTH_LIMITER: RateLimit;
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

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

export default app;
