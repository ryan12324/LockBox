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
  const body = await c.req.json<{ url?: string; urlHash?: string }>();

  if (!body.url && !body.urlHash) {
    return c.json({ error: 'url or urlHash required' }, 400);
  }

  // If actual URL provided (less private, but more useful)
  if (body.url) {
    // Import and use PhishingDetector for server-side check
    const { PhishingDetector } = await import('@lockbox/ai');
    const detector = new PhishingDetector();
    const result = detector.analyzeUrl(body.url);

    return c.json({
      safe: result.safe,
      score: result.score,
      reasons: result.reasons,
      checks: result.checks,
    });
  }

  // Hash-only mode (more private — future: check against reputation database)
  return c.json({
    safe: true, // Unknown — default safe when only hash provided
    score: 0,
    reasons: [],
    checks: {},
  });
});
