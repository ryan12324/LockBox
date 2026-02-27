/**
 * Password rotation adapter interfaces.
 *
 * Adapters produce step-by-step automation plans for changing passwords on
 * specific sites. They never execute browser actions — that happens client-side.
 */

// ---------------------------------------------------------------------------
// Step & Plan types
// ---------------------------------------------------------------------------

/** A single atomic action in a password rotation flow. */
export interface RotationStep {
  action: 'navigate' | 'click' | 'type' | 'wait' | 'verify' | 'screenshot';
  selector?: string;
  url?: string;
  value?: string;
  timeout?: number;
  description: string;
}

/** A complete plan for rotating a password on a specific site. */
export interface RotationPlan {
  siteName: string;
  steps: RotationStep[];
  estimatedDuration: number; // seconds
  requiresConfirmation: boolean;
  fallbackInstructions?: string[];
}

/** The outcome of a rotation attempt (or fallback). */
export interface RotationResult {
  success: boolean;
  newPassword?: string;
  error?: string;
  fallbackUsed: boolean;
  instructions?: string[];
  duration: number;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/** Site-specific adapter that knows how to rotate passwords for a set of domains. */
export interface SiteAdapter {
  /** Human-readable adapter name (e.g. "Google", "GitHub"). */
  name: string;
  /** Domains this adapter handles (e.g. ["github.com"]). */
  domains: string[];
  /** Return true if the adapter can handle the given URL. */
  canHandle(url: string): boolean;
  /** Build a step-by-step rotation plan for the given credentials. */
  createPlan(currentUrl: string, currentPassword: string, newPassword: string): RotationPlan;
  /** Direct URL for the site's "change password" page. */
  getChangePasswordUrl(domain: string): string;
  /** Human-readable fallback instructions when automation fails. */
  getFallbackInstructions(domain: string): string[];
}

// ---------------------------------------------------------------------------
// Helpers shared by concrete adapters
// ---------------------------------------------------------------------------

/**
 * Extract the hostname from a URL string, returning an empty string for
 * unparseable input.
 */
export function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Return true if `hostname` ends with (or equals) one of the given `domains`.
 *
 * For example `accounts.google.com` matches `google.com`.
 */
export function domainMatches(hostname: string, domains: string[]): boolean {
  const normalized = hostname.replace(/^www\./, '').toLowerCase();
  return domains.some((d) => {
    const domain = d.toLowerCase();
    return normalized === domain || normalized.endsWith(`.${domain}`);
  });
}
