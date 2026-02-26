/**
 * Form detection for the content script.
 * Scans DOM for login forms and identifies username/password fields.
 */

export interface DetectedForm {
  formElement: HTMLElement | null;
  usernameField: HTMLInputElement | null;
  passwordField: HTMLInputElement;
  submitButton: HTMLButtonElement | null;
}

/** Detect the semantic type of an input field. */
export function detectFieldType(
  input: HTMLInputElement,
): 'username' | 'password' | 'email' | 'unknown' {
  const type = input.type?.toLowerCase();
  const name = (input.name ?? '').toLowerCase();
  const id = (input.id ?? '').toLowerCase();
  const autocomplete = (input.autocomplete ?? '').toLowerCase();
  const placeholder = (input.placeholder ?? '').toLowerCase();
  const ariaLabel = (input.getAttribute('aria-label') ?? '').toLowerCase();

  if (type === 'password') return 'password';
  if (type === 'email') return 'email';

  const usernamePatterns = ['username', 'user', 'login', 'email', 'account', 'userid', 'user_id'];
  const emailPatterns = ['email', 'mail'];

  const allText = `${name} ${id} ${autocomplete} ${placeholder} ${ariaLabel}`;

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
