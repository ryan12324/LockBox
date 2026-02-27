// @vitest-environment jsdom

/**
 * Tests for form-detector.ts
 * Uses jsdom environment (configured in vitest.config.ts)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { detectFieldType, detectForms, urlMatchesUri, detectIdentityForms, isIdentityForm, isIdentityFieldType } from '../../lib/form-detector.js';

// ─── detectFieldType ──────────────────────────────────────────────────────────

describe('detectFieldType', () => {
  function makeInput(attrs: Partial<HTMLInputElement> & { 'aria-label'?: string } = {}): HTMLInputElement {
    const input = document.createElement('input');
    if (attrs.type) input.type = attrs.type;
    if (attrs.name) input.name = attrs.name;
    if (attrs.id) input.id = attrs.id;
    if (attrs.autocomplete) input.autocomplete = attrs.autocomplete;
    if (attrs.placeholder) input.placeholder = attrs.placeholder;
    if (attrs['aria-label']) input.setAttribute('aria-label', attrs['aria-label']);
    return input;
  }

  it('detects password fields by type', () => {
    const input = makeInput({ type: 'password' });
    expect(detectFieldType(input)).toBe('password');
  });

  it('detects email fields by type', () => {
    const input = makeInput({ type: 'email' });
    expect(detectFieldType(input)).toBe('email');
  });

  it('detects username fields by name attribute', () => {
    const input = makeInput({ type: 'text', name: 'username' });
    expect(detectFieldType(input)).toBe('username');
  });

  it('detects username fields by id attribute', () => {
    const input = makeInput({ type: 'text', id: 'user-login' });
    expect(detectFieldType(input)).toBe('username');
  });

  it('detects email fields by name attribute', () => {
    const input = makeInput({ type: 'text', name: 'email' });
    expect(detectFieldType(input)).toBe('email');
  });

  it('detects email fields by placeholder', () => {
    const input = makeInput({ type: 'text', placeholder: 'Enter your email' });
    expect(detectFieldType(input)).toBe('email');
  });

  it('detects username fields by autocomplete', () => {
    const input = makeInput({ type: 'text', autocomplete: 'username' });
    expect(detectFieldType(input)).toBe('username');
  });

  it('detects username fields by aria-label', () => {
    const input = makeInput({ type: 'text', 'aria-label': 'Username' });
    expect(detectFieldType(input)).toBe('username');
  });

  it('detects first-name fields by name attribute', () => {
    const input = makeInput({ type: 'text', name: 'first-name' });
    expect(detectFieldType(input)).toBe('first-name');
  });

  it('returns unknown for truly unrecognized fields', () => {
    const input = makeInput({ type: 'text', name: 'foobar-widget' });
    expect(detectFieldType(input)).toBe('unknown');
  });

  it('returns unknown for text input with no hints', () => {
    const input = makeInput({ type: 'text' });
    expect(detectFieldType(input)).toBe('unknown');
  });
});

// ─── detectForms ─────────────────────────────────────────────────────────────

describe('detectForms', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  function cleanup() {
    document.body.removeChild(container);
  }

  it('detects a simple login form with username and password', () => {
    container.innerHTML = `
      <form>
        <input type="text" name="username" />
        <input type="password" name="password" />
        <button type="submit">Sign In</button>
      </form>
    `;

    const forms = detectForms(container);
    expect(forms).toHaveLength(1);
    expect(forms[0].passwordField).toBeTruthy();
    expect(forms[0].usernameField).toBeTruthy();
    expect(forms[0].submitButton).toBeTruthy();
    cleanup();
  });

  it('detects a form with email field instead of username', () => {
    container.innerHTML = `
      <form>
        <input type="email" name="email" />
        <input type="password" name="password" />
        <button type="submit">Log In</button>
      </form>
    `;

    const forms = detectForms(container);
    expect(forms).toHaveLength(1);
    expect(forms[0].usernameField).toBeTruthy();
    expect(forms[0].usernameField?.type).toBe('email');
    cleanup();
  });

  it('returns empty array when no password fields exist', () => {
    container.innerHTML = `
      <form>
        <input type="text" name="search" />
        <button type="submit">Search</button>
      </form>
    `;

    const forms = detectForms(container);
    expect(forms).toHaveLength(0);
    cleanup();
  });

  it('detects multiple forms on a page', () => {
    container.innerHTML = `
      <form id="login">
        <input type="text" name="username" />
        <input type="password" name="password" />
      </form>
      <form id="change-password">
        <input type="password" name="current" />
        <input type="password" name="new" />
      </form>
    `;

    const forms = detectForms(container);
    expect(forms.length).toBeGreaterThanOrEqual(2);
    cleanup();
  });

  it('detects form without explicit form element', () => {
    container.innerHTML = `
      <div>
        <input type="text" name="username" />
        <input type="password" name="password" />
        <button>Login</button>
      </div>
    `;

    const forms = detectForms(container);
    expect(forms).toHaveLength(1);
    expect(forms[0].formElement).toBeTruthy();
    cleanup();
  });

  it('finds submit button with "sign in" text', () => {
    container.innerHTML = `
      <form>
        <input type="text" name="username" />
        <input type="password" />
        <button>Sign In</button>
      </form>
    `;

    const forms = detectForms(container);
    expect(forms[0].submitButton).toBeTruthy();
    expect(forms[0].submitButton?.textContent?.toLowerCase()).toContain('sign in');
    cleanup();
  });

  it('returns null submitButton when no button found', () => {
    container.innerHTML = `
      <form>
        <input type="text" name="username" />
        <input type="password" />
      </form>
    `;

    const forms = detectForms(container);
    expect(forms[0].submitButton).toBeNull();
    cleanup();
  });
});

// ─── urlMatchesUri ────────────────────────────────────────────────────────────

describe('urlMatchesUri', () => {
  it('matches exact hostname', () => {
    expect(urlMatchesUri('https://example.com/login', 'https://example.com')).toBe(true);
  });

  it('matches www vs non-www', () => {
    expect(urlMatchesUri('https://www.example.com/login', 'https://example.com')).toBe(true);
    expect(urlMatchesUri('https://example.com/login', 'https://www.example.com')).toBe(true);
  });

  it('matches subdomain to parent domain', () => {
    expect(urlMatchesUri('https://app.example.com', 'https://example.com')).toBe(true);
  });

  it('does not match different domains', () => {
    expect(urlMatchesUri('https://evil.com/login', 'https://example.com')).toBe(false);
  });

  it('does not match partial domain names', () => {
    expect(urlMatchesUri('https://notexample.com', 'https://example.com')).toBe(false);
  });

  it('handles invalid URIs gracefully', () => {
    // Should not throw
    expect(() => urlMatchesUri('https://example.com', 'not-a-url')).not.toThrow();
  });
});

// ─── Identity field detection ──────────────────────────────────────────────────

describe('detectFieldType (identity fields)', () => {
  function makeInput(attrs: Partial<HTMLInputElement> & { 'aria-label'?: string } = {}): HTMLInputElement {
    const input = document.createElement('input');
    if (attrs.type) input.type = attrs.type;
    if (attrs.name) input.name = attrs.name;
    if (attrs.id) input.id = attrs.id;
    if (attrs.autocomplete) input.autocomplete = attrs.autocomplete;
    if (attrs.placeholder) input.placeholder = attrs.placeholder;
    if (attrs['aria-label']) input.setAttribute('aria-label', attrs['aria-label']);
    return input;
  }

  it('detects first-name via autocomplete=given-name', () => {
    const input = makeInput({ type: 'text', autocomplete: 'given-name' });
    expect(detectFieldType(input)).toBe('first-name');
  });

  it('detects last-name via autocomplete=family-name', () => {
    const input = makeInput({ type: 'text', autocomplete: 'family-name' });
    expect(detectFieldType(input)).toBe('last-name');
  });

  it('detects phone via type=tel', () => {
    const input = makeInput({ type: 'tel' });
    expect(detectFieldType(input)).toBe('phone');
  });

  it('detects phone via name attribute', () => {
    const input = makeInput({ type: 'text', name: 'phone' });
    expect(detectFieldType(input)).toBe('phone');
  });

  it('detects address-line1 via autocomplete', () => {
    const input = makeInput({ type: 'text', autocomplete: 'address-line1' });
    expect(detectFieldType(input)).toBe('address-line1');
  });

  it('detects address-line1 via name=street', () => {
    const input = makeInput({ type: 'text', name: 'street' });
    expect(detectFieldType(input)).toBe('address-line1');
  });

  it('detects address-line2 via name=apt', () => {
    const input = makeInput({ type: 'text', name: 'apt' });
    expect(detectFieldType(input)).toBe('address-line2');
  });

  it('detects city via autocomplete=address-level2', () => {
    const input = makeInput({ type: 'text', autocomplete: 'address-level2' });
    expect(detectFieldType(input)).toBe('city');
  });

  it('detects city via name=city', () => {
    const input = makeInput({ type: 'text', name: 'city' });
    expect(detectFieldType(input)).toBe('city');
  });

  it('detects state via autocomplete=address-level1', () => {
    const input = makeInput({ type: 'text', autocomplete: 'address-level1' });
    expect(detectFieldType(input)).toBe('state');
  });

  it('detects state via name=state', () => {
    const input = makeInput({ type: 'text', name: 'state' });
    expect(detectFieldType(input)).toBe('state');
  });

  it('detects postal-code via autocomplete', () => {
    const input = makeInput({ type: 'text', autocomplete: 'postal-code' });
    expect(detectFieldType(input)).toBe('postal-code');
  });

  it('detects postal-code via name=zip', () => {
    const input = makeInput({ type: 'text', name: 'zip' });
    expect(detectFieldType(input)).toBe('postal-code');
  });

  it('detects country via autocomplete=country-name', () => {
    const input = makeInput({ type: 'text', autocomplete: 'country-name' });
    expect(detectFieldType(input)).toBe('country');
  });

  it('detects organization via name=company', () => {
    const input = makeInput({ type: 'text', name: 'company' });
    expect(detectFieldType(input)).toBe('organization');
  });

  it('detects organization via autocomplete=organization', () => {
    const input = makeInput({ type: 'text', autocomplete: 'organization' });
    expect(detectFieldType(input)).toBe('organization');
  });

  it('detects last-name via name=surname', () => {
    const input = makeInput({ type: 'text', name: 'surname' });
    expect(detectFieldType(input)).toBe('last-name');
  });

  it('detects phone via placeholder', () => {
    const input = makeInput({ type: 'text', placeholder: 'Enter your mobile number' });
    expect(detectFieldType(input)).toBe('phone');
  });
});

// ─── isIdentityFieldType ─────────────────────────────────────────────────────

describe('isIdentityFieldType', () => {
  it('returns true for identity field types', () => {
    expect(isIdentityFieldType('first-name')).toBe(true);
    expect(isIdentityFieldType('last-name')).toBe(true);
    expect(isIdentityFieldType('phone')).toBe(true);
    expect(isIdentityFieldType('city')).toBe(true);
    expect(isIdentityFieldType('state')).toBe(true);
    expect(isIdentityFieldType('postal-code')).toBe(true);
    expect(isIdentityFieldType('country')).toBe(true);
    expect(isIdentityFieldType('organization')).toBe(true);
    expect(isIdentityFieldType('address-line1')).toBe(true);
    expect(isIdentityFieldType('address-line2')).toBe(true);
  });

  it('returns false for non-identity field types', () => {
    expect(isIdentityFieldType('username')).toBe(false);
    expect(isIdentityFieldType('password')).toBe(false);
    expect(isIdentityFieldType('email')).toBe(false);
    expect(isIdentityFieldType('unknown')).toBe(false);
  });
});

// ─── isIdentityForm ─────────────────────────────────────────────────────────

describe('isIdentityForm', () => {
  it('returns true when form has 2+ identity fields', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <input type="text" name="first-name" />
      <input type="text" name="last-name" />
      <input type="email" name="email" />
    `;
    expect(isIdentityForm(form)).toBe(true);
  });

  it('returns true for address forms', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <input type="text" name="street" />
      <input type="text" name="city" />
      <input type="text" name="state" />
      <input type="text" name="zip" />
    `;
    expect(isIdentityForm(form)).toBe(true);
  });

  it('returns false when form has fewer than 2 identity fields', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <input type="text" name="first-name" />
      <input type="text" name="foobar" />
    `;
    expect(isIdentityForm(form)).toBe(false);
  });

  it('returns false for login forms', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <input type="text" name="username" />
      <input type="password" name="password" />
    `;
    expect(isIdentityForm(form)).toBe(false);
  });

  it('returns false for empty forms', () => {
    const form = document.createElement('form');
    expect(isIdentityForm(form)).toBe(false);
  });
});

// ─── detectIdentityForms ─────────────────────────────────────────────────────

describe('detectIdentityForms', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  function cleanup() {
    document.body.removeChild(container);
  }

  it('detects a form with identity fields', () => {
    container.innerHTML = `
      <form>
        <input type="text" autocomplete="given-name" />
        <input type="text" autocomplete="family-name" />
        <input type="tel" name="phone" />
      </form>
    `;
    const forms = detectIdentityForms(container);
    expect(forms.length).toBeGreaterThanOrEqual(1);
    const f = forms[0];
    expect(f.fields['first-name']).toBeTruthy();
    expect(f.fields['last-name']).toBeTruthy();
    expect(f.fields['phone']).toBeTruthy();
    cleanup();
  });

  it('does not detect a login-only form as identity', () => {
    container.innerHTML = `
      <form>
        <input type="text" name="username" />
        <input type="password" name="password" />
      </form>
    `;
    const forms = detectIdentityForms(container);
    expect(forms).toHaveLength(0);
    cleanup();
  });

  it('detects address form with multiple address fields', () => {
    container.innerHTML = `
      <form>
        <input type="text" name="address" />
        <input type="text" name="city" />
        <input type="text" name="state" />
        <input type="text" name="zip" />
      </form>
    `;
    const forms = detectIdentityForms(container);
    expect(forms.length).toBeGreaterThanOrEqual(1);
    const f = forms[0];
    expect(f.fields['address-line1']).toBeTruthy();
    expect(f.fields['city']).toBeTruthy();
    expect(f.fields['state']).toBeTruthy();
    expect(f.fields['postal-code']).toBeTruthy();
    cleanup();
  });

  it('returns empty when no identity forms present', () => {
    container.innerHTML = `
      <form>
        <input type="text" name="search" />
        <button type="submit">Go</button>
      </form>
    `;
    const forms = detectIdentityForms(container);
    expect(forms).toHaveLength(0);
    cleanup();
  });
});
