/**
 * Form detection for the content script.
 * Scans DOM for login forms, identity forms, and identifies field types.
 */

import { resolveRpIdForOrigin } from './webauthn.js';

export interface DetectedForm {
  formElement: HTMLElement | null;
  usernameField: HTMLInputElement | null;
  passwordField: HTMLInputElement;
  submitButton: HTMLButtonElement | null;
  passwordPurpose: 'current' | 'new' | 'unknown';
}

const knownPasswordFields = new WeakSet<HTMLInputElement>();

export type FormSearchRoot = Document | Element | ShadowRoot;

function isShadowRoot(value: unknown): value is ShadowRoot {
  return typeof ShadowRoot !== 'undefined' && value instanceof ShadowRoot;
}

/** Query a document, element, and every reachable open shadow root. */
export function querySelectorAllDeep<T extends Element>(
  root: FormSearchRoot,
  selector: string
): T[] {
  const matches = new Set<T>();
  const visited = new Set<ParentNode>();

  const visit = (scope: ParentNode) => {
    if (visited.has(scope)) return;
    visited.add(scope);

    for (const match of scope.querySelectorAll<T>(selector)) matches.add(match);
    for (const element of scope.querySelectorAll<HTMLElement>('*')) {
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };

  visit(root);
  return Array.from(matches);
}

/** Return every reachable open shadow root so lifecycle observers can follow it. */
export function getOpenShadowRoots(root: FormSearchRoot): ShadowRoot[] {
  const roots: ShadowRoot[] = [];
  const visited = new Set<ParentNode>();

  const visit = (scope: ParentNode) => {
    if (visited.has(scope)) return;
    visited.add(scope);
    for (const element of scope.querySelectorAll<HTMLElement>('*')) {
      if (!element.shadowRoot) continue;
      roots.push(element.shadowRoot);
      visit(element.shadowRoot);
    }
  };

  visit(root);
  return roots;
}

function autocompleteTokens(input: HTMLInputElement): string[] {
  return (input.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}

function composedParent(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return isShadowRoot(root) ? root.host : null;
}

/** Reject fields that are disabled, read-only, or hidden by themselves or an ancestor. */
export function isEligibleField(input: HTMLInputElement): boolean {
  if (input.disabled || input.readOnly || input.hidden || input.type === 'hidden') return false;

  let current: Element | null = input;
  while (current) {
    if (
      current.hasAttribute('hidden') ||
      current.hasAttribute('inert') ||
      current.getAttribute('aria-hidden') === 'true'
    ) {
      return false;
    }

    const style = getComputedStyle(current);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse'
    ) {
      return false;
    }
    current = composedParent(current);
  }

  return true;
}

/** Distinguish login passwords from account-creation and rotation passwords. */
export function getPasswordPurpose(input: HTMLInputElement): 'current' | 'new' | 'unknown' {
  const tokens = autocompleteTokens(input);
  if (tokens.includes('current-password')) return 'current';
  if (tokens.includes('new-password')) return 'new';

  const hint = `${input.name} ${input.id} ${input.getAttribute('aria-label') ?? ''}`.toLowerCase();
  if (/\b(new|confirm|repeat|verify)[-_ ]?(password|pass|pwd)\b/.test(hint)) return 'new';
  if (/\b(current|existing|old)[-_ ]?(password|pass|pwd)\b/.test(hint)) return 'current';
  return 'unknown';
}

function isPasswordLikeField(input: HTMLInputElement): boolean {
  if (input.type === 'password') {
    knownPasswordFields.add(input);
    return true;
  }

  const tokens = autocompleteTokens(input);
  if (tokens.includes('current-password') || tokens.includes('new-password')) {
    knownPasswordFields.add(input);
    return true;
  }

  if (input.type !== 'text' && input.type !== 'search') return false;
  const hint = `${input.name} ${input.id} ${input.getAttribute('aria-label') ?? ''}`.toLowerCase();
  const hasPasswordHint = /(^|[-_ ])(password|passwd|passcode|pwd)([-_ ]|$)/.test(hint);
  const parent = input.parentElement;
  const siblingInputCount = parent?.querySelectorAll('input').length ?? 0;
  const hasRevealControl = Array.from(
    parent?.querySelectorAll<HTMLElement>('button, [role="button"]') ?? []
  ).some((control) => {
    const label = `${control.getAttribute('aria-label') ?? ''} ${control.title} ${control.textContent ?? ''}`;
    const describesReveal =
      /(show|hide|reveal).*(password|passcode)|(password|passcode).*(show|hide|reveal)/i.test(
        label
      );
    const explicitlyTargetsField =
      Boolean(input.id) && control.getAttribute('aria-controls') === input.id;
    const isAdjacent =
      control.previousElementSibling === input || control.nextElementSibling === input;
    return describesReveal && (siblingInputCount === 1 || explicitlyTargetsField || isAdjacent);
  });

  if (hasPasswordHint || hasRevealControl) {
    knownPasswordFields.add(input);
    return true;
  }
  return knownPasswordFields.has(input);
}

/** All recognized field types. */
export type FieldType =
  | 'username'
  | 'password'
  | 'otp'
  | 'email'
  | 'first-name'
  | 'last-name'
  | 'name'
  | 'phone'
  | 'address-line1'
  | 'address-line2'
  | 'city'
  | 'state'
  | 'postal-code'
  | 'country'
  | 'organization'
  | 'unknown';

/** Identity-specific field types. */
export type IdentityFieldType = Exclude<
  FieldType,
  'username' | 'password' | 'email' | 'otp' | 'unknown'
>;

/** All identity field types for iteration. */
const IDENTITY_FIELD_TYPES: ReadonlySet<string> = new Set<string>([
  'first-name',
  'last-name',
  'name',
  'phone',
  'address-line1',
  'address-line2',
  'city',
  'state',
  'postal-code',
  'country',
  'organization',
]);

/** Detect the semantic type of an input field. */
export function detectFieldType(input: HTMLInputElement): FieldType {
  const type = input.type?.toLowerCase();
  const name = (input.name ?? '').toLowerCase();
  const id = (input.id ?? '').toLowerCase();
  const autocompleteValues = autocompleteTokens(input);
  const placeholder = (input.placeholder ?? '').toLowerCase();
  const ariaLabel = (input.getAttribute('aria-label') ?? '').toLowerCase();

  // The autocomplete hint is the strongest OTP signal and is commonly used
  // on text, tel, and number inputs.
  if (autocompleteValues.includes('one-time-code')) return 'otp';

  if (
    type === 'password' ||
    autocompleteValues.includes('current-password') ||
    autocompleteValues.includes('new-password')
  ) {
    return 'password';
  }
  if (type === 'email') return 'email';
  if (type === 'tel') return 'phone';

  // Check autocomplete attribute first (most reliable signal)
  const autocompleteMap: Record<string, FieldType> = {
    'given-name': 'first-name',
    'family-name': 'last-name',
    name: 'name',
    tel: 'phone',
    'tel-national': 'phone',
    'street-address': 'address-line1',
    'address-line1': 'address-line1',
    'address-line2': 'address-line2',
    'address-level2': 'city',
    'address-level1': 'state',
    'postal-code': 'postal-code',
    'country-name': 'country',
    country: 'country',
    organization: 'organization',
    username: 'username',
    email: 'email',
  };

  for (const value of autocompleteValues) {
    if (autocompleteMap[value]) return autocompleteMap[value];
  }

  // Heuristic pattern matching on name/id/placeholder/aria-label
  const allText = `${name} ${id} ${placeholder} ${ariaLabel}`;

  const otpPatterns = [
    'one-time-code',
    'one time code',
    'verification-code',
    'verification code',
    'auth-code',
    'auth code',
    '2fa',
    'mfa',
    'totp',
    'otp',
  ];
  if (otpPatterns.some((pattern) => allText.includes(pattern))) return 'otp';

  // Identity field patterns (check before username to avoid false positives)
  const identityPatterns: Array<{ patterns: string[]; fieldType: FieldType }> = [
    {
      patterns: ['firstname', 'first-name', 'first_name', 'fname', 'given-name', 'givenname'],
      fieldType: 'first-name',
    },
    {
      patterns: [
        'lastname',
        'last-name',
        'last_name',
        'lname',
        'family-name',
        'familyname',
        'surname',
      ],
      fieldType: 'last-name',
    },
    { patterns: ['phone', 'tel', 'mobile', 'cell'], fieldType: 'phone' },
    {
      patterns: ['address-line2', 'address2', 'addr2', 'address_2', 'apt', 'suite', 'unit'],
      fieldType: 'address-line2',
    },
    {
      patterns: ['address', 'street', 'address-line1', 'address1', 'addr1', 'address_1'],
      fieldType: 'address-line1',
    },
    { patterns: ['city', 'locality', 'town'], fieldType: 'city' },
    { patterns: ['state', 'province', 'region'], fieldType: 'state' },
    {
      patterns: ['zip', 'postal', 'postcode', 'postalcode', 'postal-code', 'zipcode'],
      fieldType: 'postal-code',
    },
    { patterns: ['country'], fieldType: 'country' },
    { patterns: ['company', 'organization', 'org', 'employer'], fieldType: 'organization' },
  ];

  for (const { patterns, fieldType } of identityPatterns) {
    if (patterns.some((p) => allText.includes(p))) return fieldType;
  }

  // Login field patterns
  const emailPatterns = ['email', 'mail'];
  const usernamePatterns = ['username', 'user', 'login', 'account', 'userid', 'user_id'];

  if (emailPatterns.some((p) => allText.includes(p))) return 'email';
  if (usernamePatterns.some((p) => allText.includes(p))) return 'username';

  return 'unknown';
}

/** Find the submit button for a form. */
function findSubmitButton(container: HTMLElement): HTMLButtonElement | null {
  // Look for submit button within the form
  const submitBtn = container.querySelector<HTMLButtonElement>(
    'button[type="submit"], input[type="submit"]'
  );
  if (submitBtn) return submitBtn as HTMLButtonElement;

  // Look for buttons with common submit text
  const buttons = container.querySelectorAll<HTMLButtonElement>('button');
  for (const btn of buttons) {
    const text = btn.textContent?.toLowerCase() ?? '';
    if (
      text.includes('sign in') ||
      text.includes('log in') ||
      text.includes('login') ||
      text.includes('submit')
    ) {
      return btn;
    }
  }
  return null;
}

/** Find the username/email field adjacent to a password field. */
function findUsernameField(
  passwordField: HTMLInputElement,
  container: HTMLElement
): HTMLInputElement | null {
  // Limit candidates to text-like fields. Checkboxes and buttons otherwise
  // become "unknown" candidates and can steal the username association.
  const inputs = querySelectorAllDeep<HTMLInputElement>(container, 'input').filter((input) => {
    const type = input.getAttribute('type')?.toLowerCase() ?? 'text';
    return ['text', 'email', 'tel', 'search', 'url'].includes(type) && isEligibleField(input);
  });

  // Find inputs that look like username/email fields
  const candidates = inputs.filter((input) => {
    const fieldType = detectFieldType(input);
    return fieldType === 'username' || fieldType === 'email' || fieldType === 'unknown';
  });

  if (candidates.length === 0) return null;

  // Prefer the one closest to (and before) the password field in DOM order
  const allInputs = querySelectorAllDeep<HTMLInputElement>(container, 'input');
  const passwordIndex = allInputs.indexOf(passwordField);

  // Find the last candidate that appears before the password field
  let best: HTMLInputElement | null = null;
  for (const candidate of candidates) {
    const idx = allInputs.indexOf(candidate);
    if (idx < passwordIndex) {
      best = candidate;
    }
  }

  return best ?? candidates[0] ?? null;
}

/** Detect all login forms on a page or within a container. */
export function detectForms(root: FormSearchRoot): DetectedForm[] {
  const forms: DetectedForm[] = [];

  // Include password fields that a site's show-password control temporarily
  // changes to text while retaining password semantics.
  const passwordFields = querySelectorAllDeep<HTMLInputElement>(root, 'input').filter(
    (input) => isPasswordLikeField(input) && isEligibleField(input)
  );

  for (const passwordField of passwordFields) {
    // Find the containing form or nearest ancestor
    const passwordRoot = passwordField.getRootNode();
    const shadowHost = isShadowRoot(passwordRoot) ? passwordRoot.host : null;
    const formElement =
      passwordField.form ??
      passwordField.closest('form') ??
      shadowHost?.closest('form') ??
      shadowHost?.parentElement ??
      (passwordField.parentElement as HTMLElement | null);

    const container = formElement ?? (root instanceof Document ? root.body : (root as HTMLElement));

    const usernameField = findUsernameField(passwordField, container as HTMLElement);
    const submitButton = findSubmitButton(container as HTMLElement);

    forms.push({
      formElement: formElement as HTMLElement | null,
      usernameField,
      passwordField,
      submitButton,
      passwordPurpose: getPasswordPurpose(passwordField),
    });
  }

  return forms;
}

/** Detect visible one-time-code fields, including form-less verification steps. */
export function detectOtpFields(root: FormSearchRoot): HTMLInputElement[] {
  return querySelectorAllDeep<HTMLInputElement>(root, 'input').filter(
    (input) => isEligibleField(input) && detectFieldType(input) === 'otp'
  );
}

/**
 * Detect username-only sign-in steps without confusing account-creation,
 * verification-code, or identity forms for a password-login step.
 */
export function detectStandaloneUsernameFields(root: FormSearchRoot): HTMLInputElement[] {
  const loginUsernames = new Set(
    detectForms(root).flatMap((form) => (form.usernameField ? [form.usernameField] : []))
  );
  const identityFields = new Set(
    detectIdentityForms(root).flatMap((form) => Object.values(form.fields))
  );
  const otpFields = new Set(detectOtpFields(root));

  return querySelectorAllDeep<HTMLInputElement>(root, 'input').filter((input) => {
    if (!isEligibleField(input) || loginUsernames.has(input) || identityFields.has(input)) {
      return false;
    }
    const fieldType = detectFieldType(input);
    if (fieldType !== 'username' && fieldType !== 'email') return false;

    const container = input.form ?? input.closest('form') ?? input.parentElement;
    if (!container) return false;
    return !querySelectorAllDeep<HTMLInputElement>(container, 'input').some((candidate) =>
      otpFields.has(candidate)
    );
  });
}

/** Check if a URL domain matches a vault item URI. */
export function urlMatchesUri(pageUrl: string, itemUri: string): boolean {
  try {
    const page = new URL(pageUrl);
    const item = new URL(itemUri);
    const pageHost = page.hostname.toLowerCase().replace(/^www\./, '');
    const itemHost = item.hostname.toLowerCase().replace(/^www\./, '');
    const pageIsLoopback =
      pageHost === 'localhost' || pageHost === '127.0.0.1' || pageHost === '[::1]';
    const itemIsLoopback =
      itemHost === 'localhost' || itemHost === '127.0.0.1' || itemHost === '[::1]';

    if (page.protocol !== 'https:' && !(page.protocol === 'http:' && pageIsLoopback)) return false;
    if (item.protocol !== 'https:' && !(item.protocol === 'http:' && itemIsLoopback)) return false;
    if (page.protocol !== item.protocol) return false;
    if (pageHost === itemHost) return true;
    if (!pageHost.endsWith(`.${itemHost}`)) return false;

    // Do not treat a registry boundary (including private suffixes such as
    // github.io) as a credential-sharing parent domain.
    return resolveRpIdForOrigin(page.origin, itemHost) === itemHost;
  } catch {
    return false;
  }
}

// ─── Identity form detection ──────────────────────────────────────────────────

/** A detected identity form with typed field mappings. */
export interface DetectedIdentityForm {
  formElement: HTMLElement | null;
  fields: Partial<Record<IdentityFieldType | 'email', HTMLInputElement>>;
}

/** Check if a field type is an identity-related type. */
export function isIdentityFieldType(fieldType: FieldType): fieldType is IdentityFieldType {
  return IDENTITY_FIELD_TYPES.has(fieldType);
}

/**
 * Check if a form element has 2+ identity-type fields,
 * qualifying it as an identity form.
 */
export function isIdentityForm(container: HTMLElement): boolean {
  const inputs = querySelectorAllDeep<HTMLInputElement>(container, 'input').filter(isEligibleField);
  let identityFieldCount = 0;
  for (const input of inputs) {
    const ft = detectFieldType(input);
    if (isIdentityFieldType(ft)) {
      identityFieldCount++;
      if (identityFieldCount >= 2) return true;
    }
  }
  return false;
}

/** Detect all identity forms on a page or within a container. */
export function detectIdentityForms(root: FormSearchRoot): DetectedIdentityForm[] {
  const results: DetectedIdentityForm[] = [];

  // Check explicit <form> elements
  const formElements = querySelectorAllDeep<HTMLFormElement>(root, 'form');

  // Also check the root body for form-less inputs
  const containers: HTMLElement[] = [...formElements];
  if (root instanceof Document && root.body) {
    containers.push(root.body);
  } else if (root instanceof HTMLElement) {
    containers.push(root);
  }

  const processedForms = new Set<HTMLElement>();

  for (const container of containers) {
    if (processedForms.has(container)) continue;

    if (!isIdentityForm(container)) continue;

    processedForms.add(container);

    const inputs = querySelectorAllDeep<HTMLInputElement>(container, 'input').filter(
      isEligibleField
    );

    const fields: DetectedIdentityForm['fields'] = {};

    for (const input of inputs) {
      const ft = detectFieldType(input);
      if (isIdentityFieldType(ft) || ft === 'email') {
        const key = ft as IdentityFieldType | 'email';
        if (!fields[key]) {
          fields[key] = input;
        }
      }
    }

    results.push({
      formElement: container === root ? null : container,
      fields,
    });
  }

  return results;
}
