/**
 * Form and field classification engine — heuristic-based.
 *
 * Classifies individual input fields and entire forms from serializable
 * metadata (no DOM dependency). Confidence scores indicate signal strength:
 *   - autocomplete attribute = 0.95
 *   - type attribute = 0.90
 *   - name/id exact match = 0.85
 *   - placeholder/label match = 0.70
 *   - heuristic/context match = 0.60
 *   - unknown = 0.10
 */
/** Serializable metadata for a form element. */
export interface FormMetadata {
    id?: string;
    action?: string;
    method?: string;
    fields: FieldMetadata[];
    /** Text of submit-like buttons inside the form. */
    buttonLabels: string[];
    /** Nearby heading or label text for additional context. */
    surroundingText?: string;
}
/** Serializable metadata for an input field. */
export interface FieldMetadata {
    /** The input `type` attribute (e.g. "text", "password", "email"). */
    type: string;
    name: string;
    id: string;
    autocomplete: string;
    placeholder: string;
    ariaLabel: string;
    /** Text of the associated `<label>` element. */
    label: string;
    /** Full `className` string — used for pattern matching. */
    className: string;
    maxLength?: number;
    /** The input `pattern` attribute. */
    pattern?: string;
    isRequired: boolean;
    isVisible: boolean;
    /** DOM order index within the form. */
    position: number;
}
/** Possible classifications for a single input field. */
export type FieldClassification = 'username' | 'email' | 'password' | 'new-password' | 'confirm-password' | 'cc-number' | 'cc-name' | 'cc-expiry' | 'cc-cvc' | 'address-line1' | 'address-line2' | 'city' | 'state' | 'zip' | 'country' | 'phone' | 'name' | 'first-name' | 'last-name' | 'otp' | 'search' | 'unknown';
/** Possible classifications for an entire form. */
export type FormClassification = 'login' | 'signup' | 'card' | 'address' | 'search' | 'otp' | 'unknown';
/** A classification result with confidence score and human-readable reasons. */
export interface ClassificationResult<T> {
    classification: T;
    /** Confidence from 0 to 1. */
    confidence: number;
    /** Human-readable reasons for the classification. */
    reasons: string[];
}
/**
 * Classify a single input field based on its metadata.
 *
 * Checks signals in priority order: type → autocomplete → name/id patterns →
 * placeholder/label patterns → maxLength heuristics → unknown.
 */
export declare function classifyField(field: FieldMetadata, siblingFields?: FieldMetadata[]): ClassificationResult<FieldClassification>;
/**
 * Classify an entire form based on its field metadata.
 *
 * Classifies each field individually, then determines the overall form type
 * from the combination of field classifications and button labels.
 */
export declare function classifyForm(form: FormMetadata): ClassificationResult<FormClassification>;
//# sourceMappingURL=classifier.d.ts.map