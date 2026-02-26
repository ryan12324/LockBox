/**
 * Credential Lifecycle Management — tracks password age, suggests rotation
 * schedules, and detects items that need attention based on importance and
 * breach status.
 *
 * Fully client-side. No network calls.
 */

import type { LoginItem } from '@lockbox/types';
import type { RotationSchedule, BreachCheckResult } from '@lockbox/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Category for rotation interval determination */
export type ItemCategory = 'financial' | 'email' | 'social' | 'development' | 'shopping' | 'other';

/** Default rotation intervals per category (in days) */
export const DEFAULT_ROTATION_INTERVALS: Record<ItemCategory, number> = {
  financial: 60, // Banking, payment — tightest rotation
  email: 90, // Email providers
  social: 90, // Social media
  development: 120, // Dev tools (GitHub, etc.)
  shopping: 180, // Shopping sites
  other: 90, // Default
};

export interface LifecycleOptions {
  rotationIntervals?: Partial<Record<ItemCategory, number>>; // Override defaults
  breachResults?: Map<string, BreachCheckResult>; // Breach data for urgency boost
  now?: Date; // For testing — defaults to new Date()
}

// ---------------------------------------------------------------------------
// Domain keyword lists
// ---------------------------------------------------------------------------

const FINANCIAL_DOMAINS = [
  'bank',
  'chase',
  'wellsfargo',
  'bofa',
  'bankofamerica',
  'citi',
  'capitalone',
  'paypal',
  'venmo',
  'cashapp',
  'stripe',
  'plaid',
  'fidelity',
  'schwab',
  'vanguard',
  'robinhood',
  'coinbase',
  'crypto',
];

const EMAIL_DOMAINS = [
  'gmail',
  'outlook',
  'yahoo',
  'proton',
  'protonmail',
  'fastmail',
  'icloud',
  'zoho',
];

const SOCIAL_DOMAINS = [
  'facebook',
  'instagram',
  'twitter',
  'x.com',
  'tiktok',
  'snapchat',
  'reddit',
  'linkedin',
  'mastodon',
  'threads',
  'bluesky',
  'discord',
  'telegram',
  'whatsapp',
];

const DEVELOPMENT_DOMAINS = [
  'github',
  'gitlab',
  'bitbucket',
  'stackoverflow',
  'npm',
  'docker',
  'aws',
  'azure',
  'gcp',
  'vercel',
  'netlify',
  'cloudflare',
  'heroku',
  'digitalocean',
];

const SHOPPING_DOMAINS = [
  'amazon',
  'ebay',
  'walmart',
  'target',
  'bestbuy',
  'etsy',
  'shopify',
  'alibaba',
  'aliexpress',
  'wish',
];

/** Ordered category → keyword pairs for matching */
const CATEGORY_KEYWORDS: [ItemCategory, string[]][] = [
  ['financial', FINANCIAL_DOMAINS],
  ['email', EMAIL_DOMAINS],
  ['social', SOCIAL_DOMAINS],
  ['development', DEVELOPMENT_DOMAINS],
  ['shopping', SHOPPING_DOMAINS],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Number of days before nextRotation that triggers 'due-soon' urgency */
const DUE_SOON_WINDOW_DAYS = 14;

/**
 * Extract hostname from a URI string, returning lowercase.
 * Returns null if the URI is invalid or empty.
 */
function extractHostname(uri: string): string | null {
  try {
    const url = new URL(uri);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Check whether a hostname contains any of the given keywords.
 * Matches substrings so "chase.com" matches keyword "chase".
 */
function hostnameMatchesAny(hostname: string, keywords: string[]): boolean {
  return keywords.some((kw) => hostname.includes(kw));
}

// ---------------------------------------------------------------------------
// LifecycleTracker
// ---------------------------------------------------------------------------

export class LifecycleTracker {
  private readonly intervals: Record<ItemCategory, number>;
  private readonly breachResults: Map<string, BreachCheckResult>;
  private readonly now: Date;

  constructor(private options?: LifecycleOptions) {
    this.intervals = {
      ...DEFAULT_ROTATION_INTERVALS,
      ...options?.rotationIntervals,
    };
    this.breachResults = options?.breachResults ?? new Map();
    this.now = options?.now ?? new Date();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Get rotation schedules for all items. */
  getRotationSchedule(items: LoginItem[]): RotationSchedule[] {
    return items.map((item) => this.buildSchedule(item));
  }

  /** Categorize an item based on its URIs. */
  categorizeItem(item: LoginItem): ItemCategory {
    for (const uri of item.uris) {
      const hostname = extractHostname(uri);
      if (!hostname) continue;

      for (const [category, keywords] of CATEGORY_KEYWORDS) {
        if (hostnameMatchesAny(hostname, keywords)) {
          return category;
        }
      }
    }
    return 'other';
  }

  /** Get items due for rotation (overdue or due-soon), sorted by urgency then nextRotation. */
  getDueItems(items: LoginItem[]): RotationSchedule[] {
    const schedules = this.getRotationSchedule(items);
    const due = schedules.filter((s) => s.urgency === 'overdue' || s.urgency === 'due-soon');

    return due.sort((a, b) => {
      // overdue before due-soon
      if (a.urgency !== b.urgency) {
        return a.urgency === 'overdue' ? -1 : 1;
      }
      // Earlier nextRotation first
      return new Date(a.nextRotation).getTime() - new Date(b.nextRotation).getTime();
    });
  }

  /** Get days since last password change. */
  getDaysSinceChange(item: LoginItem): number {
    const updatedAt = new Date(item.updatedAt).getTime();
    const nowMs = this.now.getTime();
    return Math.floor((nowMs - updatedAt) / MS_PER_DAY);
  }

  /** Get rotation interval (in days) for an item. */
  getRotationInterval(item: LoginItem): number {
    const category = this.categorizeItem(item);
    return this.intervals[category];
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private buildSchedule(item: LoginItem): RotationSchedule {
    const intervalDays = this.getRotationInterval(item);
    const lastRotated = item.updatedAt;
    const lastRotatedMs = new Date(lastRotated).getTime();
    const nextRotationMs = lastRotatedMs + intervalDays * MS_PER_DAY;
    const nextRotation = new Date(nextRotationMs).toISOString();

    const urgency = this.determineUrgency(item.id, nextRotationMs);

    return {
      itemId: item.id,
      lastRotated,
      nextRotation,
      urgency,
    };
  }

  private determineUrgency(itemId: string, nextRotationMs: number): RotationSchedule['urgency'] {
    // Breached items are always overdue
    const breach = this.breachResults.get(itemId);
    if (breach?.found) {
      return 'overdue';
    }

    const nowMs = this.now.getTime();

    if (nextRotationMs <= nowMs) {
      return 'overdue';
    }

    const dueSoonThresholdMs = nowMs + DUE_SOON_WINDOW_DAYS * MS_PER_DAY;
    if (nextRotationMs <= dueSoonThresholdMs) {
      return 'due-soon';
    }

    return 'ok';
  }
}
