/**
 * Security Copilot engine — monitors vault security posture, generates
 * prioritized actions, and tracks improvement over time.
 *
 * All analysis is purely local. No vault data is sent externally.
 */

import type {
  LoginItem,
  SecurityPosture,
  SecurityAction,
  VaultHealthSummary,
  BreachCheckResult,
} from '@lockbox/types';
import { analyzeVaultHealth } from '../health/analyzer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CopilotOptions {
  /** Days before a password is flagged as old. Defaults to 90. */
  ageThresholdDays?: number;
  /** Days before a password age is considered critical. Defaults to 180. */
  criticalAgeDays?: number;
  /** Pre-fetched breach data keyed by item ID. */
  breachResults?: Map<string, BreachCheckResult>;
  /** Previous overall score for trend calculation. */
  previousScore?: number;
}

export interface ScoreHistory {
  /** ISO 8601 date string. */
  date: string;
  /** Overall score 0–100. */
  score: number;
  /** Number of open actions at that point. */
  actionCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_AGE_THRESHOLD_DAYS = 90;
const DEFAULT_CRITICAL_AGE_DAYS = 180;

/** Domains known to support 2FA / TOTP enrollment. */
const TWO_FA_CAPABLE_DOMAINS: ReadonlySet<string> = new Set([
  'github.com',
  'google.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'amazon.com',
  'microsoft.com',
  'apple.com',
  'dropbox.com',
  'slack.com',
  'discord.com',
  'linkedin.com',
  'reddit.com',
  'twitch.tv',
]);

/** Priority weights for score penalty calculation. */
const PRIORITY_WEIGHTS: Record<SecurityAction['priority'], number> = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 1,
};

/** Sort order for priorities (lower = higher priority). */
const PRIORITY_ORDER: Record<SecurityAction['priority'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a hostname from a URI string.
 * Returns null for invalid or unparseable URIs.
 */
function extractHostname(uri: string): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;

  const withProtocol = /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Check whether any URI in the item matches a known 2FA-capable domain.
 */
function matchesTwoFaDomain(uris: string[]): boolean {
  for (const uri of uris) {
    const hostname = extractHostname(uri);
    if (hostname && TWO_FA_CAPABLE_DOMAINS.has(hostname)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class SecurityCopilot {
  /**
   * Evaluate overall vault security posture.
   *
   * 1. Runs `analyzeVaultHealth` for aggregate health metrics
   * 2. Generates prioritized action items from health + breach data
   * 3. Calculates a 0–100 composite score
   * 4. Determines trend from `previousScore` if provided
   */
  async evaluate(vault: LoginItem[], options: CopilotOptions = {}): Promise<SecurityPosture> {
    const { ageThresholdDays = DEFAULT_AGE_THRESHOLD_DAYS, breachResults, previousScore } = options;

    // 1. Aggregate health analysis
    const healthSummary = await analyzeVaultHealth(vault, { ageThresholdDays });

    // 2. Generate actions
    const actions = this.generateActions(vault, healthSummary, breachResults);

    // 3. Calculate score
    const score = this.calculateScore(healthSummary, actions);

    // 4. Determine trend
    let trend: SecurityPosture['trend'] = 'stable';
    if (previousScore !== undefined) {
      const diff = score - previousScore;
      if (diff > 5) trend = 'improving';
      else if (diff < -5) trend = 'declining';
    }

    return { score, trend, actions };
  }

  /**
   * Generate prioritized action items from vault health data and breach results.
   *
   * Priority order:
   * 1. critical — breached passwords
   * 2. high     — reused passwords
   * 3. medium   — weak passwords (score < 3)
   * 4. low      — old passwords (> ageThresholdDays)
   * 5. medium   — items without TOTP on 2FA-capable domains
   */
  generateActions(
    vault: LoginItem[],
    healthSummary: VaultHealthSummary,
    breachResults?: Map<string, BreachCheckResult>
  ): SecurityAction[] {
    const actions: SecurityAction[] = [];
    const { ageThresholdDays = DEFAULT_AGE_THRESHOLD_DAYS } = {} as CopilotOptions;

    // --- 1. Critical: Breached passwords ---
    if (breachResults) {
      for (const [itemId, result] of breachResults) {
        if (!result.found) continue;
        const item = vault.find((v) => v.id === itemId);
        const name = item?.name ?? itemId;
        actions.push({
          priority: 'critical',
          type: 'rotate',
          affectedItems: [itemId],
          message: `Password for ${name} was found in a data breach. Change it immediately.`,
        });
      }
    }

    // --- Build password hash groups for reuse detection ---
    const passwordGroups = new Map<string, LoginItem[]>();
    for (const item of vault) {
      const existing = passwordGroups.get(item.password);
      if (existing) {
        existing.push(item);
      } else {
        passwordGroups.set(item.password, [item]);
      }
    }

    // --- 2. High: Reused passwords ---
    const reportedReusedGroups = new Set<string>();
    for (const [password, group] of passwordGroups) {
      if (group.length <= 1) continue;
      // Use the password as a group key to avoid duplicate actions
      if (reportedReusedGroups.has(password)) continue;
      reportedReusedGroups.add(password);

      for (const item of group) {
        actions.push({
          priority: 'high',
          type: 'deduplicate',
          affectedItems: [item.id],
          message: `${item.name} shares a password with ${group.length - 1} other items. Use unique passwords.`,
        });
      }
    }

    // --- 3. Medium: Weak passwords ---
    for (const item of vault) {
      // Simple strength heuristic: length < 8 or all-lowercase or common patterns
      // We use zxcvbn-like scoring via @lockbox/generator internally through
      // analyzeVaultHealth, but for per-item action generation we need a quick check.
      // healthSummary.weak tells us the count — we need to identify which items.
      if (isWeakPassword(item.password)) {
        actions.push({
          priority: 'medium',
          type: 'strengthen',
          affectedItems: [item.id],
          message: `Password for ${item.name} is weak. Generate a stronger one.`,
        });
      }
    }

    // --- 4. Low: Old passwords ---
    const now = Date.now();
    const thresholdMs = DEFAULT_AGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
    for (const item of vault) {
      const ageMs = now - new Date(item.updatedAt).getTime();
      if (ageMs > thresholdMs) {
        const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        actions.push({
          priority: 'low',
          type: 'rotate',
          affectedItems: [item.id],
          message: `Password for ${item.name} hasn't been changed in ${days} days.`,
        });
      }
    }

    // --- 5. Medium: Items without TOTP on 2FA-capable domains ---
    for (const item of vault) {
      if (item.totp) continue; // Already has TOTP
      if (!matchesTwoFaDomain(item.uris)) continue;
      actions.push({
        priority: 'medium',
        type: 'enable-2fa',
        affectedItems: [item.id],
        message: `${item.name} supports 2FA but doesn't have it enabled.`,
      });
    }

    // Sort by priority: critical → high → medium → low
    actions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

    return actions;
  }

  /**
   * Calculate trend from a series of historical scores.
   *
   * - < 2 data points → 'stable'
   * - Last score > avg of previous + 5 → 'improving'
   * - Last score < avg of previous - 5 → 'declining'
   * - Otherwise → 'stable'
   */
  calculateTrend(history: ScoreHistory[]): 'improving' | 'stable' | 'declining' {
    if (history.length < 2) return 'stable';

    const lastScore = history[history.length - 1].score;
    const previousScores = history.slice(0, -1);
    const avg = previousScores.reduce((sum, h) => sum + h.score, 0) / previousScores.length;

    if (lastScore > avg + 5) return 'improving';
    if (lastScore < avg - 5) return 'declining';
    return 'stable';
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Calculate composite score (0–100) from health summary and actions.
   *
   * Base score is the health summary's overallScore.
   * Penalty is applied per-action weighted by priority severity.
   * Score is clamped to [0, 100].
   */
  private calculateScore(healthSummary: VaultHealthSummary, actions: SecurityAction[]): number {
    if (healthSummary.totalItems === 0) return 100;

    const baseScore = healthSummary.overallScore;

    // Calculate penalty from actions
    let penalty = 0;
    for (const action of actions) {
      penalty += PRIORITY_WEIGHTS[action.priority];
    }

    // Normalize penalty: cap at 50 so base score still matters
    const normalizedPenalty = Math.min(penalty, 50);
    const score = Math.round(Math.max(0, Math.min(100, baseScore - normalizedPenalty)));

    return score;
  }
}

/**
 * Quick heuristic for weak password detection.
 * A password is considered weak if:
 * - Length < 8 characters
 * - All lowercase letters
 * - All digits
 * - Common trivial patterns
 */
function isWeakPassword(password: string): boolean {
  if (password.length < 8) return true;
  if (/^[a-z]+$/.test(password)) return true;
  if (/^[0-9]+$/.test(password)) return true;
  if (/^(.)\1+$/.test(password)) return true; // all same character
  // Common patterns
  if (/^(password|123456|qwerty|letmein|welcome|admin)/i.test(password)) return true;
  return false;
}
