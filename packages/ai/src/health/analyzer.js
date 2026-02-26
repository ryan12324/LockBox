/**
 * Password health analyzer — client-side vault health analysis.
 *
 * Evaluates password strength (via zxcvbn), detects reuse (SHA-256 hash
 * comparison), and flags stale credentials. No network calls.
 */
import { evaluateStrength } from '@lockbox/generator';
/** Default age threshold in days before a password is considered old. */
const DEFAULT_AGE_THRESHOLD_DAYS = 90;
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/** SHA-256 hash a password, returning a lowercase hex string. */
async function hashPassword(password) {
    const data = new TextEncoder().encode(password);
    const buffer = await crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(buffer);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
}
/** Check whether a password exceeds the age threshold. */
function checkAge(updatedAt, thresholdDays) {
    const diffMs = Date.now() - new Date(updatedAt).getTime();
    const daysSinceChange = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return { isOld: daysSinceChange > thresholdDays, daysSinceChange };
}
/**
 * Build a map of SHA-256 password hash → list of item IDs that share it.
 * Used for O(n) reuse detection rather than O(n²) pairwise comparison.
 */
async function buildHashMap(items) {
    const map = new Map();
    for (const item of items) {
        const hash = await hashPassword(item.password);
        const ids = map.get(hash);
        if (ids) {
            ids.push(item.id);
        }
        else {
            map.set(hash, [item.id]);
        }
    }
    return map;
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Analyze a single vault item against all items in the vault.
 *
 * Returns a per-item health report including zxcvbn strength score and a
 * list of detected issues (weak, reused, old).
 */
export async function analyzeItem(item, allItems, options = {}) {
    const { ageThresholdDays = DEFAULT_AGE_THRESHOLD_DAYS } = options;
    const issues = [];
    // 1. Strength check
    const strength = evaluateStrength(item.password);
    if (strength.score < 3) {
        issues.push({ type: 'weak', score: strength.score });
    }
    // 2. Reuse check (hash-based)
    const hashMap = await buildHashMap(allItems);
    const itemHash = await hashPassword(item.password);
    const group = hashMap.get(itemHash) ?? [];
    const sharedWith = group.filter((id) => id !== item.id);
    if (sharedWith.length > 0) {
        issues.push({ type: 'reused', sharedWith });
    }
    // 3. Age check
    const { isOld, daysSinceChange } = checkAge(item.updatedAt, ageThresholdDays);
    if (isOld) {
        issues.push({ type: 'old', daysSinceChange });
    }
    return {
        itemId: item.id,
        score: strength.score,
        issues,
        lastChecked: new Date().toISOString(),
    };
}
/**
 * Compute aggregate health metrics for an entire vault.
 *
 * Returns counts of weak, reused, and old passwords plus an overall
 * score from 0–100 calculated as the average of:
 *   - percentage of strong passwords (score ≥ 3)
 *   - percentage of unique (non-reused) passwords
 *   - percentage of recent (non-old) passwords
 */
export async function analyzeVaultHealth(items, options = {}) {
    if (items.length === 0) {
        return {
            totalItems: 0,
            weak: 0,
            reused: 0,
            old: 0,
            breached: 0,
            strong: 0,
            overallScore: 100,
        };
    }
    const { ageThresholdDays = DEFAULT_AGE_THRESHOLD_DAYS } = options;
    const totalItems = items.length;
    // Pre-compute hash map once for O(n) reuse detection
    const hashMap = await buildHashMap(items);
    let weak = 0;
    let strong = 0;
    let old = 0;
    const reusedIds = new Set();
    for (const item of items) {
        // Strength
        const strength = evaluateStrength(item.password);
        if (strength.score >= 3) {
            strong++;
        }
        else {
            weak++;
        }
        // Reuse — any hash group with >1 member means all members are reused
        const hash = await hashPassword(item.password);
        const group = hashMap.get(hash) ?? [];
        if (group.length > 1) {
            reusedIds.add(item.id);
        }
        // Age
        const { isOld } = checkAge(item.updatedAt, ageThresholdDays);
        if (isOld) {
            old++;
        }
    }
    const reused = reusedIds.size;
    // Overall score: equal weight to strong%, unique%, recent%
    const strongPct = strong / totalItems;
    const uniquePct = (totalItems - reused) / totalItems;
    const recentPct = (totalItems - old) / totalItems;
    const overallScore = Math.round(((strongPct + uniquePct + recentPct) / 3) * 100);
    return {
        totalItems,
        weak,
        reused,
        old,
        breached: 0, // Breach checking is a separate module
        strong,
        overallScore,
    };
}
//# sourceMappingURL=analyzer.js.map