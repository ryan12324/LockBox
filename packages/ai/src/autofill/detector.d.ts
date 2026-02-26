/**
 * Autofill decision engine — produces fill/suggest decisions from form metadata.
 *
 * Combines field and form classification to decide whether to auto-fill,
 * show a suggestion dropdown, or do nothing. Card forms are never auto-filled
 * regardless of confidence.
 */
import type { FieldClassification, FormClassification, ClassificationResult, FormMetadata } from './classifier.js';
/** The complete autofill decision for a single form. */
export interface AutofillDecision {
    /** Overall form classification with confidence and reasons. */
    formType: ClassificationResult<FormClassification>;
    /** Per-field classification results keyed by DOM position. */
    fields: Array<{
        position: number;
        classification: ClassificationResult<FieldClassification>;
    }>;
    /** True if confidence > 0.8 and form type is not `card`. */
    shouldAutoFill: boolean;
    /** True if confidence is between 0.5 and 0.8 (or `card` with confidence > 0.5). */
    shouldSuggest: boolean;
    /** Human-readable explanation of the decision. */
    reason: string;
}
/**
 * Analyze a form and produce an autofill decision.
 *
 * Decision rules:
 * - Card forms → never auto-fill, suggest only if confidence > 0.5
 * - Confidence > 0.8 → auto-fill
 * - Confidence 0.5–0.8 → suggest (show dropdown, don't auto-fill)
 * - Confidence < 0.5 → neither auto-fill nor suggest
 */
export declare function analyzeFormForAutofill(form: FormMetadata): AutofillDecision;
//# sourceMappingURL=detector.d.ts.map