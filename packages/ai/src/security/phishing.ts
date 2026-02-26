/**
 * Phishing detection engine — pure client-side URL analysis.
 *
 * Evaluates URLs for phishing indicators using heuristic checks:
 * homoglyph detection, typosquatting, suspicious TLDs, IP-based URLs,
 * keyword stuffing, and more. No network calls — all analysis is local.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of an individual phishing check. */
export interface PhishingCheck {
  /** Check identifier (e.g. 'homoglyph', 'typosquat', 'ip-url'). */
  name: string;
  /** Whether the URL passed this check (true = no issue found). */
  passed: boolean;
  /** Human-readable detail when the check fails. */
  detail?: string;
}

/** Result of a full phishing analysis on a URL. */
export interface PhishingResult {
  /** Whether the URL is considered safe (score < 0.5). */
  safe: boolean;
  /** Phishing risk score from 0 (definitely safe) to 1 (definitely phishing). */
  score: number;
  /** Human-readable reasons summarizing the analysis. */
  reasons: string[];
  /** Individual check results. */
  checks: PhishingCheck[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Map of Unicode confusable characters to their ASCII equivalents. */
const HOMOGLYPH_MAP: ReadonlyMap<string, string> = new Map([
  // Cyrillic → Latin
  ['\u0430', 'a'], // а → a
  ['\u0435', 'e'], // е → e
  ['\u043E', 'o'], // о → o
  ['\u0440', 'p'], // р → p
  ['\u0441', 'c'], // с → c
  ['\u0443', 'y'], // у → y
  ['\u0445', 'x'], // х → x
  ['\u043D', 'h'], // н → h
  ['\u0456', 'i'], // і → i
  ['\u0458', 'j'], // ј → j
  ['\u043A', 'k'], // к → k
  ['\u04BB', 'h'], // һ → h
  ['\u0455', 's'], // ѕ → s
  ['\u0442', 't'], // т → t (lowercase Cyrillic te can look like t)
  ['\u0432', 'v'], // в → v (Cyrillic ve)
  ['\u0437', 'z'], // з → z (Cyrillic ze — loosely)
  // Greek → Latin
  ['\u03BF', 'o'], // ο → o
  ['\u03B1', 'a'], // α → a (lowercase alpha)
  ['\u03B5', 'e'], // ε → e (lowercase epsilon)
  // Full-width → ASCII
  ['\uFF41', 'a'], // ａ → a
  ['\uFF4F', 'o'], // ｏ → o
  ['\uFF45', 'e'], // ｅ → e
]);

/** Built-in list of well-known legitimate domains for typosquat comparison. */
const DEFAULT_LEGITIMATE_DOMAINS: readonly string[] = [
  'google.com',
  'facebook.com',
  'amazon.com',
  'apple.com',
  'microsoft.com',
  'paypal.com',
  'netflix.com',
  'github.com',
  'linkedin.com',
  'twitter.com',
  'instagram.com',
  'bankofamerica.com',
  'chase.com',
  'wellsfargo.com',
  'citibank.com',
  'dropbox.com',
  'yahoo.com',
  'outlook.com',
  'icloud.com',
  'spotify.com',
  'steam.com',
  'twitch.tv',
  'reddit.com',
  'whatsapp.com',
  'telegram.org',
  'zoom.us',
  'slack.com',
  'stripe.com',
  'adobe.com',
  'ebay.com',
  'walmart.com',
  'target.com',
  'bestbuy.com',
  'usbank.com',
  'capitalone.com',
];

/** TLDs frequently abused in phishing campaigns. */
const SUSPICIOUS_TLDS: ReadonlySet<string> = new Set([
  '.tk',
  '.ml',
  '.ga',
  '.cf',
  '.gq',
  '.xyz',
  '.top',
  '.work',
  '.click',
  '.link',
  '.buzz',
]);

/** Keywords commonly found in phishing domains. */
const PHISHING_KEYWORDS: readonly RegExp[] = [
  /secure[-.]?login/i,
  /verify[-.]?account/i,
  /update[-.]?payment/i,
  /confirm[-.]?identity/i,
  /account[-.]?verify/i,
  /login[-.]?secure/i,
  /password[-.]?reset/i,
  /security[-.]?alert/i,
  /auth[-.]?verify/i,
  /signin[-.]?confirm/i,
];

/** Check weights for scoring. */
const WEIGHTS = {
  ipUrl: 0.7,
  homoglyph: 0.9,
  typosquatClose: 0.8,
  typosquatFar: 0.5,
  suspiciousTld: 0.3,
  excessiveSubdomains: 0.3,
  httpOnly: 0.2,
  keywordStuffing: 0.4,
  longUrl: 0.1,
} as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** IPv4 pattern: digits and dots only (e.g. 192.168.1.1). */
const IPV4_PATTERN = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** IPv6 pattern: brackets around hex groups. */
const IPV6_PATTERN = /^\[[\da-fA-F:]+\]$/;

/**
 * Safely parse a URL string. Returns null for invalid or un-parseable URLs.
 * Handles missing protocol by prepending https://.
 */
function safeParseUrl(raw: string): URL | null {
  if (!raw || typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'about:blank') return null;

  // Prepend https:// if no protocol
  const withProtocol = /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    return new URL(withProtocol);
  } catch {
    return null;
  }
}

/**
 * Extract the raw hostname from a URL string before URL constructor
 * punycode-encodes international characters. Needed for homoglyph detection.
 */
function extractRawHostname(raw: string): string {
  const trimmed = raw.trim();
  // Strip protocol
  const afterProtocol = trimmed.replace(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//, '');
  // Strip userinfo (user:pass@)
  const afterUserinfo = afterProtocol.replace(/^[^@]*@/, '');
  // Take hostname portion (before /, ?, #, or :port)
  const hostname = afterUserinfo.split(/[/:?#]/)[0];
  return hostname.toLowerCase();
}

/**
 * Compute Levenshtein distance between two strings.
 * Uses Wagner–Fischer dynamic-programming algorithm.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Single-row DP
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/**
 * Extract the registrable domain from a hostname.
 * e.g. "login.www.google.com" → "google.com"
 *
 * Simple heuristic: take the last two labels (or three for known ccTLDs).
 */
function extractDomain(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join('.');
}

/**
 * Check whether a hostname contains homoglyph (Unicode lookalike) characters.
 * Returns the normalised ASCII version and a flag indicating whether confusables
 * were found.
 */
function detectHomoglyphs(hostname: string): { normalised: string; hasConfusables: boolean } {
  let hasConfusables = false;
  let normalised = '';

  for (const ch of hostname) {
    const mapped = HOMOGLYPH_MAP.get(ch);
    if (mapped) {
      hasConfusables = true;
      normalised += mapped;
    } else {
      normalised += ch;
    }
  }

  return { normalised, hasConfusables };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Phishing detection engine — analyses URLs for phishing indicators.
 *
 * All checks are pure string analysis with no network calls.
 * Instantiate with an optional list of known legitimate domains; the built-in
 * list of 35+ popular domains is always included.
 */
export class PhishingDetector {
  /** Known legitimate domains for typosquat/homoglyph comparison. */
  private readonly legitimateDomains: string[];

  constructor(legitimateDomains?: string[]) {
    const extra = legitimateDomains ?? [];
    // Deduplicate: merge user-provided with defaults
    this.legitimateDomains = [...new Set([...DEFAULT_LEGITIMATE_DOMAINS, ...extra])];
  }

  /**
   * Analyse a URL for phishing indicators.
   *
   * Returns a result with an overall safety flag, a 0–1 score, human-readable
   * reasons, and individual check results.
   */
  analyzeUrl(url: string): PhishingResult {
    const checks: PhishingCheck[] = [];
    let totalWeight = 0;

    const parsed = safeParseUrl(url);
    if (!parsed) {
      // Unparseable URL — treat as unknown / safe-by-default
      return {
        safe: true,
        score: 0,
        reasons: ['URL could not be parsed — no analysis performed'],
        checks: [{ name: 'parse', passed: false, detail: 'Invalid or empty URL' }],
      };
    }

    const hostname = parsed.hostname.toLowerCase();
    const protocol = parsed.protocol;
    const fullUrl = parsed.href;

    // (a) IP-based URL detection
    const ipCheck = this.checkIpUrl(hostname);
    checks.push(ipCheck);
    if (!ipCheck.passed) totalWeight += WEIGHTS.ipUrl;

    // (b) Homoglyph detection — use raw hostname to preserve Unicode chars
    const rawHostname = extractRawHostname(url);
    const homoglyphCheck = this.checkHomoglyphs(rawHostname);
    checks.push(homoglyphCheck);
    if (!homoglyphCheck.passed) totalWeight += WEIGHTS.homoglyph;

    // (c) Typosquatting detection (skip if homoglyph already matched)
    const typosquatCheck = this.checkTyposquat(hostname, !homoglyphCheck.passed);
    checks.push(typosquatCheck);
    if (!typosquatCheck.passed) {
      // Weight depends on distance
      const dist = typosquatCheck.detail?.match(/distance (\d+)/);
      const distance = dist ? parseInt(dist[1], 10) : 2;
      totalWeight += distance <= 1 ? WEIGHTS.typosquatClose : WEIGHTS.typosquatFar;
    }

    // (d) Suspicious TLD check
    const tldCheck = this.checkSuspiciousTld(hostname);
    checks.push(tldCheck);
    if (!tldCheck.passed) totalWeight += WEIGHTS.suspiciousTld;

    // (e) Excessive subdomain check
    const subdomainCheck = this.checkExcessiveSubdomains(hostname);
    checks.push(subdomainCheck);
    if (!subdomainCheck.passed) totalWeight += WEIGHTS.excessiveSubdomains;

    // (f) HTTP-only check
    const httpCheck = this.checkHttpOnly(protocol);
    checks.push(httpCheck);
    if (!httpCheck.passed) totalWeight += WEIGHTS.httpOnly;

    // (g) Keyword stuffing check
    const keywordCheck = this.checkKeywordStuffing(hostname);
    checks.push(keywordCheck);
    if (!keywordCheck.passed) totalWeight += WEIGHTS.keywordStuffing;

    // (h) Long URL check
    const longUrlCheck = this.checkLongUrl(fullUrl);
    checks.push(longUrlCheck);
    if (!longUrlCheck.passed) totalWeight += WEIGHTS.longUrl;

    // Compute final score
    const score = Math.min(1.0, totalWeight);
    const safe = score < 0.5;

    // Build human-readable reasons from failed checks
    const reasons: string[] = checks
      .filter((c) => !c.passed && c.detail)
      .map((c) => c.detail as string);

    if (reasons.length === 0) {
      reasons.push('No phishing indicators detected');
    }

    return { safe, score, reasons, checks };
  }

  // -------------------------------------------------------------------------
  // Individual checks
  // -------------------------------------------------------------------------

  /** (a) Detect URLs using raw IP addresses instead of domain names. */
  private checkIpUrl(hostname: string): PhishingCheck {
    const isIp = IPV4_PATTERN.test(hostname) || IPV6_PATTERN.test(hostname);
    return {
      name: 'ip-url',
      passed: !isIp,
      detail: isIp ? `URL uses raw IP address: ${hostname}` : undefined,
    };
  }

  /**
   * (b) Detect Unicode homoglyph characters that mimic legitimate domains.
   * Normalises the hostname to ASCII and checks against known domains.
   */
  private checkHomoglyphs(hostname: string): PhishingCheck {
    const { normalised, hasConfusables } = detectHomoglyphs(hostname);

    if (!hasConfusables) {
      return { name: 'homoglyph', passed: true };
    }

    // Check if normalised hostname matches or contains a known domain
    const normDomain = extractDomain(normalised);
    const resembles = this.legitimateDomains.some(
      (d) => normDomain === d || normalised.includes(d.split('.')[0])
    );

    if (resembles) {
      return {
        name: 'homoglyph',
        passed: false,
        detail: `Hostname contains Unicode lookalike characters resembling a known domain (normalised: ${normalised})`,
      };
    }

    // Confusables found but doesn't resemble a known domain — still suspicious
    return {
      name: 'homoglyph',
      passed: false,
      detail: `Hostname contains Unicode confusable characters (normalised: ${normalised})`,
    };
  }

  /**
   * (c) Detect typosquatting via Levenshtein distance.
   * Compares the hostname's registrable domain against known domains.
   */
  private checkTyposquat(hostname: string, skipIfHomoglyph: boolean): PhishingCheck {
    if (skipIfHomoglyph) {
      return {
        name: 'typosquat',
        passed: true,
        detail: 'Skipped — homoglyph check already flagged',
      };
    }

    const domain = extractDomain(hostname);

    // If it exactly matches a known domain, it's safe
    if (this.legitimateDomains.includes(domain)) {
      return { name: 'typosquat', passed: true };
    }

    // Check Levenshtein distance against each known domain
    let closestDomain = '';
    let closestDistance = Infinity;

    for (const legit of this.legitimateDomains) {
      const dist = levenshtein(domain, legit);
      if (dist < closestDistance) {
        closestDistance = dist;
        closestDomain = legit;
      }
    }

    if (closestDistance >= 1 && closestDistance <= 2) {
      return {
        name: 'typosquat',
        passed: false,
        detail: `Domain "${domain}" is distance ${closestDistance} from "${closestDomain}" — possible typosquat`,
      };
    }

    return { name: 'typosquat', passed: true };
  }

  /** (d) Flag domains using TLDs commonly abused in phishing. */
  private checkSuspiciousTld(hostname: string): PhishingCheck {
    const dot = hostname.lastIndexOf('.');
    if (dot === -1) return { name: 'suspicious-tld', passed: true };

    const tld = hostname.slice(dot);
    const isSuspicious = SUSPICIOUS_TLDS.has(tld);

    return {
      name: 'suspicious-tld',
      passed: !isSuspicious,
      detail: isSuspicious ? `TLD "${tld}" is commonly used in phishing` : undefined,
    };
  }

  /** (e) Flag hostnames with more than 3 subdomain levels. */
  private checkExcessiveSubdomains(hostname: string): PhishingCheck {
    const levels = hostname.split('.').length;
    // a.b.c.d = 4 labels = 3 dots → more than 3 subdomain levels means >4 labels
    const excessive = levels > 4;

    return {
      name: 'excessive-subdomains',
      passed: !excessive,
      detail: excessive
        ? `Hostname has ${levels} levels — excessive subdomains may hide the real domain`
        : undefined,
    };
  }

  /** (f) Flag HTTP-only URLs (no TLS). */
  private checkHttpOnly(protocol: string): PhishingCheck {
    const isHttp = protocol === 'http:';
    return {
      name: 'http-only',
      passed: !isHttp,
      detail: isHttp ? 'URL uses HTTP instead of HTTPS — connection is not encrypted' : undefined,
    };
  }

  /** (g) Detect domains containing phishing-related keywords. */
  private checkKeywordStuffing(hostname: string): PhishingCheck {
    for (const pattern of PHISHING_KEYWORDS) {
      if (pattern.test(hostname)) {
        return {
          name: 'keyword-stuffing',
          passed: false,
          detail: `Hostname contains suspicious keyword pattern: ${pattern.source}`,
        };
      }
    }
    return { name: 'keyword-stuffing', passed: true };
  }

  /** (h) Flag extremely long URLs (>200 chars). */
  private checkLongUrl(fullUrl: string): PhishingCheck {
    const isLong = fullUrl.length > 200;
    return {
      name: 'long-url',
      passed: !isLong,
      detail: isLong
        ? `URL is ${fullUrl.length} characters long — unusually long URLs can obscure the destination`
        : undefined,
    };
  }
}
