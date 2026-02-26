/** Where the detected rules originated. */
export type RuleSource = 'html-attributes' | 'visible-text' | 'defaults';
/** Detected password rules from a form / page. */
export interface PasswordRules {
    /** Minimum length (default: 16). */
    minLength: number;
    /** Maximum length (default: 128). */
    maxLength: number;
    /** Require at least one uppercase letter. */
    requireUppercase: boolean;
    /** Require at least one lowercase letter. */
    requireLowercase: boolean;
    /** Require at least one digit. */
    requireDigit: boolean;
    /** Require at least one special character. */
    requireSpecial: boolean;
    /** If restricted, the set of allowed special characters. */
    allowedSpecialChars?: string;
    /** Characters explicitly disallowed. */
    forbiddenChars?: string;
    /** Where the rules came from. */
    source: RuleSource;
}
/**
 * Serializable form-field metadata for rule detection.
 * Mirrors the shape a browser extension would extract from the DOM.
 */
export interface PasswordFieldMetadata {
    /** HTML `minlength` attribute. */
    minLength?: number;
    /** HTML `maxlength` attribute. */
    maxLength?: number;
    /** HTML `pattern` attribute (regex). */
    pattern?: string;
    /** HTML `title` attribute (often contains requirements text). */
    title?: string;
    /** `aria-describedby` text content. */
    ariaDescription?: string;
    /** Visible text near the password field (requirement bullets, labels). */
    nearbyText?: string;
}
/**
 * Detect password rules from form field metadata.
 *
 * Parses HTML attributes, pattern regex, title text, and nearby visible text
 * to determine what the site requires.
 */
export declare function detectPasswordRules(field: PasswordFieldMetadata): PasswordRules;
/**
 * Generate a password that satisfies the given rules.
 *
 * Falls back to `generatePassword()` from `random.ts` if generation fails
 * after several attempts.
 */
export declare function generateCompliant(rules: PasswordRules): string;
/**
 * Convenience: detect rules from field metadata AND generate a compliant
 * password in one call.
 */
export declare function smartGenerate(field: PasswordFieldMetadata): {
    password: string;
    rules: PasswordRules;
};
//# sourceMappingURL=smart.d.ts.map