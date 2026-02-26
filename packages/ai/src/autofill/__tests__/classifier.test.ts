import { describe, it, expect } from 'vitest';
import type { FieldMetadata, FormMetadata } from '../classifier.js';
import { classifyField, classifyForm } from '../classifier.js';
import { analyzeFormForAutofill } from '../detector.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a FieldMetadata with sensible defaults. */
function makeField(overrides: Partial<FieldMetadata> & { position: number }): FieldMetadata {
  return {
    type: 'text',
    name: '',
    id: '',
    autocomplete: '',
    placeholder: '',
    ariaLabel: '',
    label: '',
    className: '',
    isRequired: false,
    isVisible: true,
    ...overrides,
  };
}

/** Build a FormMetadata with sensible defaults. */
function makeForm(overrides: Partial<FormMetadata> & { fields: FieldMetadata[] }): FormMetadata {
  return {
    buttonLabels: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Field classification tests
// ---------------------------------------------------------------------------

describe('classifyField', () => {
  it('classifies type="password" as password with high confidence', () => {
    const field = makeField({ type: 'password', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('password');
    expect(result.confidence).toBe(0.9);
  });

  it('classifies autocomplete="new-password" as new-password', () => {
    const field = makeField({
      type: 'password',
      autocomplete: 'new-password',
      position: 0,
    });
    const result = classifyField(field);
    expect(result.classification).toBe('new-password');
    expect(result.confidence).toBe(0.95);
  });

  it('classifies autocomplete="current-password" as password', () => {
    const field = makeField({
      type: 'password',
      autocomplete: 'current-password',
      position: 0,
    });
    const result = classifyField(field);
    expect(result.classification).toBe('password');
    expect(result.confidence).toBe(0.95);
  });

  it('classifies password field with name="confirm_password" as confirm-password', () => {
    const field = makeField({
      type: 'password',
      name: 'confirm_password',
      position: 1,
    });
    const result = classifyField(field);
    expect(result.classification).toBe('confirm-password');
    expect(result.confidence).toBe(0.85);
  });

  it('classifies password field with name="new_password" as new-password', () => {
    const field = makeField({
      type: 'password',
      name: 'new_password',
      position: 0,
    });
    const result = classifyField(field);
    expect(result.classification).toBe('new-password');
    expect(result.confidence).toBe(0.85);
  });

  it('classifies second password field as confirm-password via sibling context', () => {
    const fields = [
      makeField({ type: 'password', name: 'password', position: 0 }),
      makeField({ type: 'password', name: 'password2', position: 1 }),
    ];
    const result = classifyField(fields[1], fields);
    // The name "password2" doesn't match new/confirm patterns exactly,
    // so it falls through to the sibling heuristic
    expect(result.classification).toBe('confirm-password');
  });

  it('classifies type="email" as email', () => {
    const field = makeField({ type: 'email', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('email');
    expect(result.confidence).toBe(0.9);
  });

  it('classifies type="tel" as phone', () => {
    const field = makeField({ type: 'tel', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('phone');
    expect(result.confidence).toBe(0.9);
  });

  it('classifies type="search" as search', () => {
    const field = makeField({ type: 'search', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('search');
    expect(result.confidence).toBe(0.9);
  });

  it('classifies autocomplete="username" as username', () => {
    const field = makeField({ autocomplete: 'username', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('username');
    expect(result.confidence).toBe(0.95);
  });

  it('classifies autocomplete="email" as email', () => {
    const field = makeField({ autocomplete: 'email', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('email');
    expect(result.confidence).toBe(0.95);
  });

  it('classifies autocomplete="cc-number" as cc-number', () => {
    const field = makeField({ autocomplete: 'cc-number', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('cc-number');
    expect(result.confidence).toBe(0.95);
  });

  it('classifies autocomplete="postal-code" as zip', () => {
    const field = makeField({ autocomplete: 'postal-code', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('zip');
    expect(result.confidence).toBe(0.95);
  });

  it('classifies autocomplete="given-name" as first-name', () => {
    const field = makeField({ autocomplete: 'given-name', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('first-name');
    expect(result.confidence).toBe(0.95);
  });

  it('classifies autocomplete="one-time-code" as otp', () => {
    const field = makeField({ autocomplete: 'one-time-code', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('otp');
    expect(result.confidence).toBe(0.95);
  });

  it('classifies name="username" via pattern matching', () => {
    const field = makeField({ name: 'username', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('username');
    expect(result.confidence).toBe(0.85);
  });

  it('classifies name="email_address" via pattern matching', () => {
    const field = makeField({ name: 'email_address', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('email');
    expect(result.confidence).toBe(0.85);
  });

  it('classifies id="cardNumber" via pattern matching', () => {
    const field = makeField({ id: 'cardNumber', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('cc-number');
    expect(result.confidence).toBe(0.85);
  });

  it('classifies placeholder="Enter your CVV" via pattern matching', () => {
    const field = makeField({ placeholder: 'Enter your CVV', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('cc-cvc');
    expect(result.confidence).toBe(0.7);
  });

  it('classifies label="Street Address" via pattern matching', () => {
    const field = makeField({ label: 'Street Address', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('address-line1');
    expect(result.confidence).toBe(0.7);
  });

  it('classifies name="zipcode" as zip', () => {
    const field = makeField({ name: 'zipcode', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('zip');
    expect(result.confidence).toBe(0.85);
  });

  it('classifies name="first_name" as first-name', () => {
    const field = makeField({ name: 'first_name', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('first-name');
    expect(result.confidence).toBe(0.85);
  });

  it('classifies name="lastName" as last-name', () => {
    const field = makeField({ name: 'lastName', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('last-name');
    expect(result.confidence).toBe(0.85);
  });

  it('classifies short numeric field as OTP with pattern hint', () => {
    const field = makeField({
      type: 'text',
      maxLength: 6,
      pattern: '[0-9]*',
      position: 0,
    });
    const result = classifyField(field);
    expect(result.classification).toBe('otp');
    expect(result.confidence).toBe(0.6);
  });

  it('returns unknown for an ambiguous field', () => {
    const field = makeField({ name: 'data', id: 'field1', type: 'text', position: 0 });
    const result = classifyField(field);
    expect(result.classification).toBe('unknown');
    expect(result.confidence).toBe(0.1);
  });

  it('confidence: autocomplete > type > name/id > placeholder/label', () => {
    const acField = makeField({ autocomplete: 'email', position: 0 });
    const typeField = makeField({ type: 'email', position: 0 });
    const nameField = makeField({ name: 'email_address', position: 0 });
    const placeholderField = makeField({ placeholder: 'Enter email', position: 0 });

    expect(classifyField(acField).confidence).toBeGreaterThan(classifyField(typeField).confidence);
    expect(classifyField(typeField).confidence).toBeGreaterThan(
      classifyField(nameField).confidence
    );
    expect(classifyField(nameField).confidence).toBeGreaterThan(
      classifyField(placeholderField).confidence
    );
  });
});

// ---------------------------------------------------------------------------
// Form classification tests
// ---------------------------------------------------------------------------

describe('classifyForm', () => {
  it('classifies simple login (email + password) with high confidence', () => {
    const form = makeForm({
      fields: [
        makeField({ type: 'email', name: 'email', position: 0 }),
        makeField({ type: 'password', name: 'password', position: 1 }),
      ],
      buttonLabels: ['Sign In'],
    });
    const result = classifyForm(form);
    expect(result.classification).toBe('login');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('classifies login with username field', () => {
    const form = makeForm({
      fields: [
        makeField({ name: 'username', position: 0 }),
        makeField({ type: 'password', name: 'password', position: 1 }),
      ],
      buttonLabels: ['Log In'],
    });
    const result = classifyForm(form);
    expect(result.classification).toBe('login');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('classifies login with autocomplete attributes as very high confidence', () => {
    const form = makeForm({
      fields: [
        makeField({ autocomplete: 'username', position: 0 }),
        makeField({ type: 'password', autocomplete: 'current-password', position: 1 }),
      ],
      buttonLabels: ['Sign In'],
    });
    const result = classifyForm(form);
    expect(result.classification).toBe('login');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('classifies password-only form as login', () => {
    const form = makeForm({
      fields: [makeField({ type: 'password', position: 0 })],
      buttonLabels: ['Sign In'],
    });
    const result = classifyForm(form);
    expect(result.classification).toBe('login');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('classifies signup form (email + new-password + confirm-password)', () => {
    const form = makeForm({
      fields: [
        makeField({ type: 'email', name: 'email', position: 0 }),
        makeField({
          type: 'password',
          name: 'password',
          autocomplete: 'new-password',
          position: 1,
        }),
        makeField({
          type: 'password',
          name: 'confirm_password',
          position: 2,
        }),
      ],
      buttonLabels: ['Create Account'],
    });
    const result = classifyForm(form);
    expect(result.classification).toBe('signup');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('classifies signup with name fields', () => {
    const form = makeForm({
      fields: [
        makeField({ name: 'first_name', position: 0 }),
        makeField({ name: 'last_name', position: 1 }),
        makeField({ type: 'email', name: 'email', position: 2 }),
        makeField({
          type: 'password',
          autocomplete: 'new-password',
          position: 3,
        }),
      ],
      buttonLabels: ['Register'],
    });
    const result = classifyForm(form);
    expect(result.classification).toBe('signup');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('disambiguates signup from login by new-password signal', () => {
    const loginForm = makeForm({
      fields: [
        makeField({ type: 'email', position: 0 }),
        makeField({ type: 'password', autocomplete: 'current-password', position: 1 }),
      ],
      buttonLabels: ['Log In'],
    });
    const signupForm = makeForm({
      fields: [
        makeField({ type: 'email', position: 0 }),
        makeField({ type: 'password', autocomplete: 'new-password', position: 1 }),
      ],
      buttonLabels: ['Sign Up'],
    });
    expect(classifyForm(loginForm).classification).toBe('login');
    expect(classifyForm(signupForm).classification).toBe('signup');
  });

  it('classifies full credit card form', () => {
    const form = makeForm({
      fields: [
        makeField({ autocomplete: 'cc-name', position: 0 }),
        makeField({ autocomplete: 'cc-number', position: 1 }),
        makeField({ autocomplete: 'cc-exp', position: 2 }),
        makeField({ autocomplete: 'cc-csc', position: 3 }),
      ],
      buttonLabels: ['Pay Now'],
    });
    const result = classifyForm(form);
    expect(result.classification).toBe('card');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('classifies partial card form (number + CVV only)', () => {
    const form = makeForm({
      fields: [
        makeField({ autocomplete: 'cc-number', position: 0 }),
        makeField({ name: 'cvv', position: 1 }),
      ],
      buttonLabels: ['Submit Payment'],
    });
    const result = classifyForm(form);
    expect(result.classification).toBe('card');
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('classifies full address form', () => {
    const form = makeForm({
      fields: [
        makeField({ name: 'address', label: 'Street Address', position: 0 }),
        makeField({ name: 'city', position: 1 }),
        makeField({ name: 'state', position: 2 }),
        makeField({ name: 'zipcode', position: 3 }),
      ],
      buttonLabels: ['Save Address'],
    });
    const result = classifyForm(form);
    expect(result.classification).toBe('address');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('classifies empty form as unknown with low confidence', () => {
    const form = makeForm({ fields: [], buttonLabels: [] });
    const result = classifyForm(form);
    expect(result.classification).toBe('unknown');
    expect(result.confidence).toBeLessThanOrEqual(0.1);
  });

  it('classifies search form', () => {
    const form = makeForm({
      fields: [makeField({ type: 'search', name: 'q', position: 0 })],
      buttonLabels: ['Search'],
    });
    const result = classifyForm(form);
    expect(result.classification).toBe('search');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('classifies OTP form (single 6-digit input)', () => {
    const form = makeForm({
      fields: [
        makeField({
          autocomplete: 'one-time-code',
          maxLength: 6,
          position: 0,
        }),
      ],
      buttonLabels: ['Verify'],
    });
    const result = classifyForm(form);
    expect(result.classification).toBe('otp');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });
});

// ---------------------------------------------------------------------------
// Detector / autofill decision tests
// ---------------------------------------------------------------------------

describe('analyzeFormForAutofill', () => {
  it('recommends auto-fill for high-confidence login form', () => {
    const form = makeForm({
      fields: [
        makeField({ type: 'email', autocomplete: 'email', position: 0 }),
        makeField({
          type: 'password',
          autocomplete: 'current-password',
          position: 1,
        }),
      ],
      buttonLabels: ['Sign In'],
    });
    const decision = analyzeFormForAutofill(form);
    expect(decision.shouldAutoFill).toBe(true);
    expect(decision.shouldSuggest).toBe(false);
    expect(decision.formType.classification).toBe('login');
    expect(decision.fields).toHaveLength(2);
  });

  it('recommends suggest for medium-confidence login form', () => {
    const form = makeForm({
      fields: [makeField({ type: 'password', position: 0 })],
      buttonLabels: [],
    });
    const decision = analyzeFormForAutofill(form);
    expect(decision.formType.classification).toBe('login');
    expect(decision.shouldAutoFill).toBe(false);
    expect(decision.shouldSuggest).toBe(true);
  });

  it('never auto-fills card forms regardless of confidence', () => {
    const form = makeForm({
      fields: [
        makeField({ autocomplete: 'cc-number', position: 0 }),
        makeField({ autocomplete: 'cc-exp', position: 1 }),
        makeField({ autocomplete: 'cc-csc', position: 2 }),
      ],
      buttonLabels: ['Pay'],
    });
    const decision = analyzeFormForAutofill(form);
    expect(decision.formType.classification).toBe('card');
    expect(decision.shouldAutoFill).toBe(false);
    expect(decision.shouldSuggest).toBe(true);
  });

  it('recommends nothing for unknown forms', () => {
    const form = makeForm({
      fields: [makeField({ name: 'data', type: 'text', position: 0 })],
      buttonLabels: [],
    });
    const decision = analyzeFormForAutofill(form);
    expect(decision.shouldAutoFill).toBe(false);
    expect(decision.shouldSuggest).toBe(false);
  });

  it('includes per-field classification results', () => {
    const form = makeForm({
      fields: [
        makeField({ type: 'email', name: 'email', position: 0 }),
        makeField({ type: 'password', name: 'password', position: 1 }),
      ],
      buttonLabels: ['Login'],
    });
    const decision = analyzeFormForAutofill(form);
    expect(decision.fields).toHaveLength(2);
    expect(decision.fields[0].classification.classification).toBe('email');
    expect(decision.fields[1].classification.classification).toBe('password');
    expect(decision.fields[0].position).toBe(0);
    expect(decision.fields[1].position).toBe(1);
  });

  it('provides a human-readable reason string', () => {
    const form = makeForm({
      fields: [
        makeField({ type: 'email', autocomplete: 'email', position: 0 }),
        makeField({
          type: 'password',
          autocomplete: 'current-password',
          position: 1,
        }),
      ],
      buttonLabels: ['Sign In'],
    });
    const decision = analyzeFormForAutofill(form);
    expect(decision.reason).toBeTruthy();
    expect(typeof decision.reason).toBe('string');
    expect(decision.reason.length).toBeGreaterThan(0);
  });
});
