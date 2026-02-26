/**
 * Autofill decision engine — produces fill/suggest decisions from form metadata.
 *
 * Combines field and form classification to decide whether to auto-fill,
 * show a suggestion dropdown, or do nothing. Card forms are never auto-filled
 * regardless of confidence.
 */

import type {
  FieldClassification,
  FormClassification,
  ClassificationResult,
  FormMetadata,
} from './classifier.js';
import { classifyForm, classifyField } from './classifier.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze a form and produce an autofill decision.
 *
 * Decision rules:
 * - Card forms → never auto-fill, suggest only if confidence > 0.5
 * - Confidence > 0.8 → auto-fill
 * - Confidence 0.5–0.8 → suggest (show dropdown, don't auto-fill)
 * - Confidence < 0.5 → neither auto-fill nor suggest
 */
export function analyzeFormForAutofill(form: FormMetadata): AutofillDecision {
  const formType = classifyForm(form);

  const fields = form.fields.map((f) => ({
    position: f.position,
    classification: classifyField(f, form.fields),
  }));

  const { classification, confidence } = formType;

  // Card forms: NEVER auto-fill — always suggest only
  if (classification === 'card') {
    const shouldSuggest = confidence > 0.5;
    return {
      formType,
      fields,
      shouldAutoFill: false,
      shouldSuggest,
      reason: shouldSuggest
        ? `Card form detected (confidence: ${confidence.toFixed(2)}) — suggesting only for security`
        : `Card form detected with low confidence (${confidence.toFixed(2)}) — no action`,
    };
  }

  // Unknown / low-confidence: do nothing
  if (confidence < 0.5) {
    return {
      formType,
      fields,
      shouldAutoFill: false,
      shouldSuggest: false,
      reason: `Form type "${classification}" confidence too low (${confidence.toFixed(2)}) — no action`,
    };
  }

  // Medium confidence: suggest only
  if (confidence <= 0.8) {
    return {
      formType,
      fields,
      shouldAutoFill: false,
      shouldSuggest: true,
      reason: `Form type "${classification}" detected (confidence: ${confidence.toFixed(2)}) — suggesting`,
    };
  }

  // High confidence: auto-fill
  return {
    formType,
    fields,
    shouldAutoFill: true,
    shouldSuggest: false,
    reason: `Form type "${classification}" detected with high confidence (${confidence.toFixed(2)}) — auto-filling`,
  };
}
