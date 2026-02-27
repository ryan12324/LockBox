/**
 * Form detection for the content script.
 * Scans DOM for login forms, identity forms, and identifies field types.
 */

export interface DetectedForm {
  formElement: HTMLElement | null;
  usernameField: HTMLInputElement | null;
  passwordField: HTMLInputElement;
  submitButton: HTMLButtonElement | null;
}

/** All recognized field types. */
export type FieldType =
  | 'username'
  | 'password'
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
export type IdentityFieldType = Exclude<FieldType, 'username' | 'password' | 'email' | 'unknown'>;

/** All identity field types for iteration. */
const IDENTITY_FIELD_TYPES: ReadonlySet<string> = new Set<string>([
  'first-name', 'last-name', 'name', 'phone',
  'address-line1', 'address-line2', 'city', 'state',
  'postal-code', 'country', 'organization',
]);

/** Detect the semantic type of an input field. */
export function detectFieldType(
  input: HTMLInputElement,
): FieldType {
  const type = input.type?.toLowerCase();
  const name = (input.name ?? '').toLowerCase();
  const id = (input.id ?? '').toLowerCase();
  const autocomplete = (input.autocomplete ?? '').toLowerCase();
  const placeholder = (input.placeholder ?? '').toLowerCase();
  const ariaLabel = (input.getAttribute('aria-label') ?? '').toLowerCase();

  if (type === 'password') return 'password';
  if (type === 'email') return 'email';
  if (type === 'tel') return 'phone';

  // Check autocomplete attribute first (most reliable signal)
  const autocompleteMap: Record<string, FieldType> = {
    'given-name': 'first-name',
    'family-name': 'last-name',
    'name': 'name',
    'tel': 'phone',
    'tel-national': 'phone',
    'street-address': 'address-line1',
    'address-line1': 'address-line1',
    'address-line2': 'address-line2',
    'address-level2': 'city',
    'address-level1': 'state',
    'postal-code': 'postal-code',
    'country-name': 'country',
    'country': 'country',
    'organization': 'organization',
    'username': 'username',
    'email': 'email',
  };

  if (autocomplete && autocompleteMap[autocomplete]) {
    return autocompleteMap[autocomplete];
  }

  // Heuristic pattern matching on name/id/placeholder/aria-label
  const allText = `${name} ${id} ${placeholder} ${ariaLabel}`;

  // Identity field patterns (check before username to avoid false positives)
  const identityPatterns: Array<{ patterns: string[]; fieldType: FieldType }> = [
    { patterns: ['firstname', 'first-name', 'first_name', 'fname', 'given-name', 'givenname'], fieldType: 'first-name' },
    { patterns: ['lastname', 'last-name', 'last_name', 'lname', 'family-name', 'familyname', 'surname'], fieldType: 'last-name' },
    { patterns: ['phone', 'tel', 'mobile', 'cell'], fieldType: 'phone' },
    { patterns: ['address-line2', 'address2', 'addr2', 'address_2', 'apt', 'suite', 'unit'], fieldType: 'address-line2' },
    { patterns: ['address', 'street', 'address-line1', 'address1', 'addr1', 'address_1'], fieldType: 'address-line1' },
    { patterns: ['city', 'locality', 'town'], fieldType: 'city' },
    { patterns: ['state', 'province', 'region'], fieldType: 'state' },
    { patterns: ['zip', 'postal', 'postcode', 'postalcode', 'postal-code', 'zipcode'], fieldType: 'postal-code' },
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
    'button[type="submit"], input[type="submit"]',
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
  container: HTMLElement,
): HTMLInputElement | null {
  // Get all text/email inputs in the container
  const inputs = Array.from(
    container.querySelectorAll<HTMLInputElement>('input:not([type="password"]):not([type="hidden"])'),
  );

  // Find inputs that look like username/email fields
  const candidates = inputs.filter((input) => {
    const fieldType = detectFieldType(input);
    return fieldType === 'username' || fieldType === 'email' || fieldType === 'unknown';
  });

  if (candidates.length === 0) return null;

  // Prefer the one closest to (and before) the password field in DOM order
  const allInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input'));
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
export function detectForms(root: Document | Element): DetectedForm[] {
  const forms: DetectedForm[] = [];

  // Find all password fields
  const passwordFields = Array.from(
    root.querySelectorAll<HTMLInputElement>('input[type="password"]'),
  );

  for (const passwordField of passwordFields) {
    // Skip hidden fields
    if (passwordField.offsetParent === null && passwordField.type !== 'password') continue;

    // Find the containing form or nearest ancestor
    const formElement =
      passwordField.closest('form') ??
      (passwordField.parentElement as HTMLElement | null);

    const container = formElement ?? (root instanceof Document ? root.body : root as HTMLElement);

    const usernameField = findUsernameField(passwordField, container as HTMLElement);
    const submitButton = findSubmitButton(container as HTMLElement);

    forms.push({
      formElement: formElement as HTMLElement | null,
      usernameField,
      passwordField,
      submitButton,
    });
  }

  return forms;
}

/** Check if a URL domain matches a vault item URI. */
export function urlMatchesUri(pageUrl: string, itemUri: string): boolean {
  try {
    const pageHost = new URL(pageUrl).hostname.replace(/^www\./, '');
    const itemHost = new URL(itemUri).hostname.replace(/^www\./, '');
    return pageHost === itemHost || pageHost.endsWith(`.${itemHost}`) || itemHost.endsWith(`.${pageHost}`);
  } catch {
    // If URI is not a valid URL, do a simple string match
    return pageUrl.includes(itemUri) || itemUri.includes(new URL(pageUrl).hostname);
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
  const inputs = Array.from(
    container.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]):not([type="password"]):not([type="submit"])'),
  );
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
export function detectIdentityForms(root: Document | Element): DetectedIdentityForm[] {
  const results: DetectedIdentityForm[] = [];

  // Check explicit <form> elements
  const formElements = Array.from(root.querySelectorAll<HTMLFormElement>('form'));

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

    const inputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]):not([type="password"]):not([type="submit"])'),
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
