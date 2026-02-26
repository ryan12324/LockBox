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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
export type FieldClassification =
  | 'username'
  | 'email'
  | 'password'
  | 'new-password'
  | 'confirm-password'
  | 'cc-number'
  | 'cc-name'
  | 'cc-expiry'
  | 'cc-cvc'
  | 'address-line1'
  | 'address-line2'
  | 'city'
  | 'state'
  | 'zip'
  | 'country'
  | 'phone'
  | 'name'
  | 'first-name'
  | 'last-name'
  | 'otp'
  | 'search'
  | 'unknown';

/** Possible classifications for an entire form. */
export type FormClassification =
  | 'login'
  | 'signup'
  | 'card'
  | 'address'
  | 'search'
  | 'otp'
  | 'unknown';

/** A classification result with confidence score and human-readable reasons. */
export interface ClassificationResult<T> {
  classification: T;
  /** Confidence from 0 to 1. */
  confidence: number;
  /** Human-readable reasons for the classification. */
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Confidence tiers
// ---------------------------------------------------------------------------

const CONFIDENCE_AUTOCOMPLETE = 0.95;
const CONFIDENCE_TYPE = 0.9;
const CONFIDENCE_NAME_ID = 0.85;
const CONFIDENCE_PLACEHOLDER_LABEL = 0.7;
const CONFIDENCE_HEURISTIC = 0.6;
const CONFIDENCE_UNKNOWN = 0.1;

// ---------------------------------------------------------------------------
// Autocomplete → FieldClassification mapping
// ---------------------------------------------------------------------------

const AUTOCOMPLETE_MAP: Record<string, FieldClassification> = {
  username: 'username',
  email: 'email',
  'current-password': 'password',
  'new-password': 'new-password',
  'cc-number': 'cc-number',
  'cc-name': 'cc-name',
  'cc-exp': 'cc-expiry',
  'cc-exp-month': 'cc-expiry',
  'cc-exp-year': 'cc-expiry',
  'cc-csc': 'cc-cvc',
  'cc-type': 'cc-name',
  'address-line1': 'address-line1',
  'street-address': 'address-line1',
  'address-line2': 'address-line2',
  'address-level2': 'city',
  'address-level1': 'state',
  'postal-code': 'zip',
  country: 'country',
  'country-name': 'country',
  tel: 'phone',
  'tel-national': 'phone',
  name: 'name',
  'given-name': 'first-name',
  'family-name': 'last-name',
  'one-time-code': 'otp',
};

// ---------------------------------------------------------------------------
// Pattern → FieldClassification rules (checked in priority order)
// ---------------------------------------------------------------------------

interface PatternRule {
  pattern: RegExp;
  classification: FieldClassification;
}

const PATTERN_RULES: PatternRule[] = [
  { pattern: /otp|one.?time|verification.?code|verify.?code/i, classification: 'otp' },
  { pattern: /cvv|cvc|security.?code/i, classification: 'cc-cvc' },
  { pattern: /expir|exp.?date|mm.?yy/i, classification: 'cc-expiry' },
  { pattern: /name.?on.?card|cardholder/i, classification: 'cc-name' },
  { pattern: /card.?number|cc.?num/i, classification: 'cc-number' },
  { pattern: /e.?mail/i, classification: 'email' },
  { pattern: /zip|postal/i, classification: 'zip' },
  { pattern: /city/i, classification: 'city' },
  { pattern: /state|province|region/i, classification: 'state' },
  { pattern: /country/i, classification: 'country' },
  { pattern: /address.?2|apt|suite|unit/i, classification: 'address-line2' },
  { pattern: /address|street|addr/i, classification: 'address-line1' },
  { pattern: /first.?name|fname|given/i, classification: 'first-name' },
  { pattern: /last.?name|lname|family|surname/i, classification: 'last-name' },
  { pattern: /^name$|full.?name|display.?name/i, classification: 'name' },
  { pattern: /phone|tel(?:ephone)?|mobile/i, classification: 'phone' },
  { pattern: /user(?:name)?|login|log.?in/i, classification: 'username' },
  { pattern: /search|query|^q$/i, classification: 'search' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Combine all text signals from a field into a single string for matching. */
function fieldTextSignals(field: FieldMetadata): string {
  return [field.name, field.id, field.placeholder, field.ariaLabel, field.label, field.className]
    .filter(Boolean)
    .join(' ');
}

/** Check whether a password field looks like a "new-password" or "confirm" field. */
function isNewPasswordSignal(field: FieldMetadata): boolean {
  const text = fieldTextSignals(field).toLowerCase();
  return /new|confirm|register|signup|sign.?up|create|repeat|retype/i.test(text);
}

/**
 * Try matching patterns against name/id first (high confidence),
 * then placeholder/label (lower confidence).
 */
function matchPatterns(
  field: FieldMetadata
): { classification: FieldClassification; confidence: number; reason: string } | null {
  const nameId = `${field.name} ${field.id}`;
  const placeholderLabel = `${field.placeholder} ${field.ariaLabel} ${field.label}`;

  // Check name/id first (higher confidence)
  for (const rule of PATTERN_RULES) {
    if (rule.pattern.test(nameId)) {
      return {
        classification: rule.classification,
        confidence: CONFIDENCE_NAME_ID,
        reason: `name/id matches pattern ${rule.pattern}`,
      };
    }
  }

  // Check placeholder/label (lower confidence)
  for (const rule of PATTERN_RULES) {
    if (rule.pattern.test(placeholderLabel)) {
      return {
        classification: rule.classification,
        confidence: CONFIDENCE_PLACEHOLDER_LABEL,
        reason: `placeholder/label matches pattern ${rule.pattern}`,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API — Field classification
// ---------------------------------------------------------------------------

/**
 * Classify a single input field based on its metadata.
 *
 * Checks signals in priority order: type → autocomplete → name/id patterns →
 * placeholder/label patterns → maxLength heuristics → unknown.
 */
export function classifyField(
  field: FieldMetadata,
  siblingFields?: FieldMetadata[]
): ClassificationResult<FieldClassification> {
  // 1. Password type — check for new-password / confirm-password context
  if (field.type === 'password') {
    // autocomplete="new-password" is the strongest signal
    if (field.autocomplete === 'new-password') {
      return {
        classification: 'new-password',
        confidence: CONFIDENCE_AUTOCOMPLETE,
        reasons: ['autocomplete="new-password"'],
      };
    }

    // autocomplete="current-password"
    if (field.autocomplete === 'current-password') {
      return {
        classification: 'password',
        confidence: CONFIDENCE_AUTOCOMPLETE,
        reasons: ['autocomplete="current-password"'],
      };
    }

    // Name/id signals for new/confirm
    if (isNewPasswordSignal(field)) {
      const text = fieldTextSignals(field).toLowerCase();
      const isConfirm = /confirm|repeat|retype|re.?enter/i.test(text);
      return {
        classification: isConfirm ? 'confirm-password' : 'new-password',
        confidence: CONFIDENCE_NAME_ID,
        reasons: [
          isConfirm ? 'name/id indicates password confirmation' : 'name/id indicates new password',
        ],
      };
    }

    // Multiple password fields → second+ are confirm-password
    if (siblingFields) {
      const passwordFields = siblingFields.filter((f) => f.type === 'password');
      if (passwordFields.length >= 2) {
        const idx = passwordFields.findIndex((f) => f.position === field.position);
        if (idx > 0) {
          return {
            classification: 'confirm-password',
            confidence: CONFIDENCE_HEURISTIC,
            reasons: ['second password field in form — likely confirmation'],
          };
        }
      }
    }

    // Default password
    return {
      classification: 'password',
      confidence: CONFIDENCE_TYPE,
      reasons: ['type="password"'],
    };
  }

  // 2. Autocomplete attribute (strongest non-password signal)
  if (field.autocomplete) {
    const ac = field.autocomplete.toLowerCase().trim();
    const mapped = AUTOCOMPLETE_MAP[ac];
    if (mapped) {
      return {
        classification: mapped,
        confidence: CONFIDENCE_AUTOCOMPLETE,
        reasons: [`autocomplete="${ac}"`],
      };
    }
  }

  // 3. Input type shortcuts
  if (field.type === 'email') {
    return {
      classification: 'email',
      confidence: CONFIDENCE_TYPE,
      reasons: ['type="email"'],
    };
  }
  if (field.type === 'tel') {
    return {
      classification: 'phone',
      confidence: CONFIDENCE_TYPE,
      reasons: ['type="tel"'],
    };
  }
  if (field.type === 'search') {
    return {
      classification: 'search',
      confidence: CONFIDENCE_TYPE,
      reasons: ['type="search"'],
    };
  }

  // 4. Name/id and placeholder/label pattern matching
  const patternMatch = matchPatterns(field);
  if (patternMatch) {
    return {
      classification: patternMatch.classification,
      confidence: patternMatch.confidence,
      reasons: [patternMatch.reason],
    };
  }

  // 5. maxLength heuristics
  if (
    field.maxLength !== undefined &&
    field.maxLength > 0 &&
    field.maxLength <= 6 &&
    (field.type === 'text' || field.type === 'number')
  ) {
    // Could be OTP
    if (field.pattern && /\d/.test(field.pattern)) {
      return {
        classification: 'otp',
        confidence: CONFIDENCE_HEURISTIC,
        reasons: [`maxLength=${field.maxLength} with numeric pattern — likely OTP`],
      };
    }

    // Could be CVC if near credit card fields
    if (field.maxLength <= 4 && siblingFields) {
      const hasCCField = siblingFields.some((f) => {
        const sibling = classifyField(f);
        return sibling.classification === 'cc-number' || sibling.classification === 'cc-expiry';
      });
      if (hasCCField) {
        return {
          classification: 'cc-cvc',
          confidence: CONFIDENCE_HEURISTIC,
          reasons: [`maxLength=${field.maxLength} near credit card fields — likely CVC`],
        };
      }
    }
  }

  // 6. Unknown
  return {
    classification: 'unknown',
    confidence: CONFIDENCE_UNKNOWN,
    reasons: ['no matching signals found'],
  };
}

// ---------------------------------------------------------------------------
// Public API — Form classification
// ---------------------------------------------------------------------------

/**
 * Classify an entire form based on its field metadata.
 *
 * Classifies each field individually, then determines the overall form type
 * from the combination of field classifications and button labels.
 */
export function classifyForm(form: FormMetadata): ClassificationResult<FormClassification> {
  const fieldResults = form.fields.map((f) => classifyField(f, form.fields));
  const classSet = new Set(fieldResults.map((r) => r.classification));

  const reasons: string[] = [];

  // Helper: check for field presence
  const has = (...types: FieldClassification[]): boolean => types.some((t) => classSet.has(t));

  // Check button labels for signup signals
  const buttonText = form.buttonLabels.join(' ').toLowerCase();
  const signupButtonSignal = /sign.?up|register|create.?account|join|get.?started/i.test(
    buttonText
  );
  const loginButtonSignal = /sign.?in|log.?in|login|enter/i.test(buttonText);

  // Check surrounding text for additional signals
  const surroundingLower = (form.surroundingText ?? '').toLowerCase();
  const signupSurroundingSignal = /sign.?up|register|create.?account|join/i.test(surroundingLower);
  const loginSurroundingSignal = /sign.?in|log.?in|login|welcome.?back/i.test(surroundingLower);

  // --- OTP ---
  if (has('otp') && form.fields.length <= 2) {
    reasons.push('contains OTP field');
    return { classification: 'otp', confidence: 0.85, reasons };
  }

  // --- Search ---
  if (has('search') && form.fields.length <= 2) {
    reasons.push('contains search field');
    return { classification: 'search', confidence: 0.9, reasons };
  }

  // --- Card ---
  if (has('cc-number') && (has('cc-cvc') || has('cc-expiry'))) {
    reasons.push('contains credit card number + CVC/expiry fields');
    return { classification: 'card', confidence: 0.9, reasons };
  }
  if (has('cc-number')) {
    reasons.push('contains credit card number field');
    return { classification: 'card', confidence: 0.75, reasons };
  }

  // --- Signup ---
  if (
    has('password', 'new-password', 'confirm-password') &&
    has('new-password', 'confirm-password')
  ) {
    reasons.push('contains new-password or confirm-password field');
    if (signupButtonSignal) reasons.push('submit button text suggests signup');
    return { classification: 'signup', confidence: 0.9, reasons };
  }
  if (has('password') && signupButtonSignal) {
    reasons.push('contains password field with signup button');
    return { classification: 'signup', confidence: 0.8, reasons };
  }
  if (has('password') && signupSurroundingSignal) {
    reasons.push('contains password field with signup context text');
    return { classification: 'signup', confidence: 0.75, reasons };
  }

  // --- Login ---
  if (has('password') && has('username', 'email')) {
    reasons.push('contains password + username/email fields');
    if (loginButtonSignal) reasons.push('submit button text suggests login');
    return { classification: 'login', confidence: 0.9, reasons };
  }
  if (has('password')) {
    reasons.push('contains password field');
    if (loginButtonSignal) reasons.push('submit button text suggests login');
    if (loginSurroundingSignal) reasons.push('surrounding text suggests login');
    const confidence = loginButtonSignal || loginSurroundingSignal ? 0.8 : 0.7;
    return { classification: 'login', confidence, reasons };
  }

  // --- Address ---
  if (has('address-line1') && (has('city') || has('zip') || has('state'))) {
    reasons.push('contains address fields (street + city/zip/state)');
    return { classification: 'address', confidence: 0.85, reasons };
  }
  if (has('address-line1')) {
    reasons.push('contains address field');
    return { classification: 'address', confidence: 0.65, reasons };
  }

  // --- Unknown ---
  reasons.push('no strong form-level signals found');
  return { classification: 'unknown', confidence: CONFIDENCE_UNKNOWN, reasons };
}
