// @vitest-environment jsdom

/**
 * Tests for form-detector.ts
 * Uses jsdom environment (configured in vitest.config.ts)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { detectFieldType, detectForms, urlMatchesUri } from '../../lib/form-detector.js';

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

  it('returns unknown for unrecognized fields', () => {
    const input = makeInput({ type: 'text', name: 'first-name' });
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
