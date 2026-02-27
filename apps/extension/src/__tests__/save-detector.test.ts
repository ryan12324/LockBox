// @vitest-environment jsdom

/**
 * Tests for save-detector.ts
 * Tests credential extraction from form submissions and AJAX payloads.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractCredentials,
  extractCredentialsFromPayload,
  injectSaveBanner,
} from '../../lib/save-detector.js';

// ─── extractCredentials ────────────────────────────────────────────────────────

describe('extractCredentials', () => {
  it('extracts username and password from a login form', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <input type="text" name="username" value="testuser" />
      <input type="password" name="password" value="secret123" />
    `;
    document.body.appendChild(form);

    const creds = extractCredentials(form);
    expect(creds).not.toBeNull();
    expect(creds?.username).toBe('testuser');
    expect(creds?.password).toBe('secret123');

    document.body.removeChild(form);
  });

  it('extracts password with email field', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <input type="email" name="email" value="user@example.com" />
      <input type="password" name="password" value="mypass" />
    `;
    document.body.appendChild(form);

    const creds = extractCredentials(form);
    expect(creds).not.toBeNull();
    expect(creds?.username).toBe('user@example.com');
    expect(creds?.password).toBe('mypass');

    document.body.removeChild(form);
  });

  it('returns null when no password field exists', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <input type="text" name="search" value="query" />
    `;
    document.body.appendChild(form);

    const creds = extractCredentials(form);
    expect(creds).toBeNull();

    document.body.removeChild(form);
  });

  it('returns null when password field is empty', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <input type="text" name="username" value="user" />
      <input type="password" name="password" value="" />
    `;
    document.body.appendChild(form);

    const creds = extractCredentials(form);
    expect(creds).toBeNull();

    document.body.removeChild(form);
  });

  it('extracts password even without username field', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <input type="password" name="password" value="secret" />
    `;
    document.body.appendChild(form);

    const creds = extractCredentials(form);
    expect(creds).not.toBeNull();
    expect(creds?.username).toBe('');
    expect(creds?.password).toBe('secret');

    document.body.removeChild(form);
  });
});

// ─── extractCredentialsFromPayload ─────────────────────────────────────────────

describe('extractCredentialsFromPayload', () => {
  it('extracts credentials from JSON payload', () => {
    const body = JSON.stringify({ username: 'testuser', password: 'secret123' });
    const creds = extractCredentialsFromPayload('https://example.com/api/login', body);
    expect(creds).not.toBeNull();
    expect(creds?.username).toBe('testuser');
    expect(creds?.password).toBe('secret123');
  });

  it('extracts credentials from URL-encoded payload', () => {
    const body = 'username=testuser&password=secret123';
    const creds = extractCredentialsFromPayload('https://example.com/login', body);
    expect(creds).not.toBeNull();
    expect(creds?.username).toBe('testuser');
    expect(creds?.password).toBe('secret123');
  });

  it('extracts with email key as username', () => {
    const body = JSON.stringify({ email: 'user@example.com', password: 'mypass' });
    const creds = extractCredentialsFromPayload('https://example.com/api/auth', body);
    expect(creds).not.toBeNull();
    expect(creds?.username).toBe('user@example.com');
    expect(creds?.password).toBe('mypass');
  });

  it('returns null when no password key found', () => {
    const body = JSON.stringify({ username: 'user', data: 'something' });
    const creds = extractCredentialsFromPayload('https://example.com/api', body);
    expect(creds).toBeNull();
  });

  it('returns null for empty body', () => {
    const creds = extractCredentialsFromPayload('https://example.com', undefined);
    expect(creds).toBeNull();
  });

  it('returns null for non-parseable body', () => {
    const creds = extractCredentialsFromPayload('https://example.com', 'not-json-or-form');
    expect(creds).toBeNull();
  });

  it('handles case-insensitive password keys', () => {
    const body = JSON.stringify({ Username: 'user', Password: 'pass123' });
    // Keys are matched case-insensitively
    const creds = extractCredentialsFromPayload('https://example.com', body);
    expect(creds).not.toBeNull();
    expect(creds?.password).toBe('pass123');
  });

  it('extracts password when username key is missing', () => {
    const body = JSON.stringify({ password: 'secret' });
    const creds = extractCredentialsFromPayload('https://example.com', body);
    expect(creds).not.toBeNull();
    expect(creds?.password).toBe('secret');
    expect(creds?.username).toBe('');
  });
});

// ─── injectSaveBanner ──────────────────────────────────────────────────────────

describe('injectSaveBanner', () => {
  beforeEach(() => {
    // Clean up any existing banners
    const existing = document.getElementById('lockbox-save-banner');
    if (existing) existing.remove();
  });

  it('injects a save banner into the DOM', () => {
    const host = injectSaveBanner(
      'new',
      'example.com',
      () => {},
      () => {}
    );
    expect(host).toBeTruthy();
    expect(host.id).toBe('lockbox-save-banner');
    expect(document.getElementById('lockbox-save-banner')).toBeTruthy();
    host.remove();
  });

  it('injects an update banner with different message', () => {
    const host = injectSaveBanner(
      'update',
      'example.com',
      () => {},
      () => {}
    );
    expect(host).toBeTruthy();
    expect(host.id).toBe('lockbox-save-banner');
    host.remove();
  });

  it('removes existing banner before creating new one', () => {
    const host1 = injectSaveBanner(
      'new',
      'example.com',
      () => {},
      () => {}
    );
    const host2 = injectSaveBanner(
      'update',
      'example.com',
      () => {},
      () => {}
    );
    // Only one banner should exist
    const banners = document.querySelectorAll('#lockbox-save-banner');
    expect(banners.length).toBe(1);
    host1.remove();
    host2.remove();
  });
});
