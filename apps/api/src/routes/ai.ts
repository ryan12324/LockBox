/**
 * AI & Security Analysis routes — authenticated URL reputation checks.
 * Requires authentication.
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';

type Bindings = { DB: D1Database };

export const aiRoutes = new Hono<{ Bindings: Bindings; Variables: { userId: string } }>();

/**
 * POST /api/ai/url-check
 * Check URL for phishing indicators.
 *
 * Body: { url?: string; urlHash?: string } — URL or SHA-256 hash (privacy mode)
 * Response: { safe: boolean; score: number; reasons: string[]; checks: Record<string, boolean> }
 *
 * NOTE: In the current implementation, we do the phishing check client-side.
 * This endpoint exists for future server-side reputation database integration.
 * For now, it returns a basic response based on the PhishingDetector analysis.
 */
aiRoutes.post('/url-check', authMiddleware, async (c) => {
  const body = await c.req.json<{ url?: unknown; urlHash?: unknown }>().catch(() => null);

  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  if (!body.url && !body.urlHash) {
    return c.json({ error: 'url or urlHash required' }, 400);
  }

  // If actual URL provided (less private, but more useful)
  if (body.url) {
    if (typeof body.url !== 'string' || body.url.length > 2_048) {
      return c.json({ error: 'url must be a string of at most 2048 characters' }, 400);
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(body.url);
    } catch {
      return c.json({ error: 'url must be an absolute HTTP or HTTPS URL' }, 400);
    }
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return c.json({ error: 'url must use HTTP or HTTPS' }, 400);
    }

    // Import and use PhishingDetector for server-side check
    const { PhishingDetector } = await import('@lockbox/ai');
    const detector = new PhishingDetector();
    const result = detector.analyzeUrl(parsedUrl.href);

    return c.json({
      safe: result.safe,
      score: result.score,
      reasons: result.reasons,
      checks: result.checks,
    });
  }

  if (typeof body.urlHash !== 'string' || !/^[a-f0-9]{64}$/i.test(body.urlHash)) {
    return c.json({ error: 'urlHash must be a SHA-256 hex digest' }, 400);
  }

  // No server-side reputation database ships in v1. Never turn missing evidence
  // into a reassuring "safe" verdict.
  return c.json(
    { error: 'Hash-only reputation checks are not available in this deployment' },
    501
  );
});
