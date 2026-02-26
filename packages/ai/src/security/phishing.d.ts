/**
 * Phishing detection engine — pure client-side URL analysis.
 *
 * Evaluates URLs for phishing indicators using heuristic checks:
 * homoglyph detection, typosquatting, suspicious TLDs, IP-based URLs,
 * keyword stuffing, and more. No network calls — all analysis is local.
 */
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
/**
 * Phishing detection engine — analyses URLs for phishing indicators.
 *
 * All checks are pure string analysis with no network calls.
 * Instantiate with an optional list of known legitimate domains; the built-in
 * list of 35+ popular domains is always included.
 */
export declare class PhishingDetector {
    /** Known legitimate domains for typosquat/homoglyph comparison. */
    private readonly legitimateDomains;
    constructor(legitimateDomains?: string[]);
    /**
     * Analyse a URL for phishing indicators.
     *
     * Returns a result with an overall safety flag, a 0–1 score, human-readable
     * reasons, and individual check results.
     */
    analyzeUrl(url: string): PhishingResult;
    /** (a) Detect URLs using raw IP addresses instead of domain names. */
    private checkIpUrl;
    /**
     * (b) Detect Unicode homoglyph characters that mimic legitimate domains.
     * Normalises the hostname to ASCII and checks against known domains.
     */
    private checkHomoglyphs;
    /**
     * (c) Detect typosquatting via Levenshtein distance.
     * Compares the hostname's registrable domain against known domains.
     */
    private checkTyposquat;
    /** (d) Flag domains using TLDs commonly abused in phishing. */
    private checkSuspiciousTld;
    /** (e) Flag hostnames with more than 3 subdomain levels. */
    private checkExcessiveSubdomains;
    /** (f) Flag HTTP-only URLs (no TLS). */
    private checkHttpOnly;
    /** (g) Detect domains containing phishing-related keywords. */
    private checkKeywordStuffing;
    /** (h) Flag extremely long URLs (>200 chars). */
    private checkLongUrl;
}
//# sourceMappingURL=phishing.d.ts.map