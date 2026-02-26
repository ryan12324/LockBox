// @vitest-environment jsdom

/**
 * Tests for autofill.ts
 * Uses jsdom environment (configured in vitest.config.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { simulateFill, fillForm } from '../../lib/autofill.js';
import type { DetectedForm } from '../../lib/form-detector.js';

// ─── simulateFill ─────────────────────────────────────────────────────────────

describe('simulateFill', () => {
  let input: HTMLInputElement;
  const events: string[] = [];

  beforeEach(() => {
    events.length = 0;
    input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);

    // Track dispatched events
    ['click', 'focus', 'input', 'change', 'blur'].forEach((eventName) => {
      input.addEventListener(eventName, () => events.push(eventName));
    });
  });

  it('sets the field value', () => {
    simulateFill(input, 'testuser');
    expect(input.value).toBe('testuser');
  });

  it('dispatches click event', () => {
    simulateFill(input, 'testuser');
    expect(events).toContain('click');
  });

  it('dispatches focus event', () => {
    simulateFill(input, 'testuser');
    expect(events).toContain('focus');
  });

  it('dispatches input event', () => {
    simulateFill(input, 'testuser');
    expect(events).toContain('input');
  });

  it('dispatches change event', () => {
    simulateFill(input, 'testuser');
    expect(events).toContain('change');
  });

  it('dispatches blur event', () => {
    simulateFill(input, 'testuser');
    expect(events).toContain('blur');
  });

  it('dispatches events in correct order (click before input)', () => {
    simulateFill(input, 'testuser');
    const clickIdx = events.indexOf('click');
    const inputIdx = events.lastIndexOf('input');
    expect(clickIdx).toBeLessThan(inputIdx);
  });

  it('clears existing value before setting new one', () => {
    input.value = 'old-value';
    simulateFill(input, 'new-value');
    expect(input.value).toBe('new-value');
  });

  it('works with password fields', () => {
    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    document.body.appendChild(passwordInput);

    simulateFill(passwordInput, 'secret123');
    expect(passwordInput.value).toBe('secret123');
  });

  it('works with empty string value', () => {
    input.value = 'existing';
    simulateFill(input, '');
    expect(input.value).toBe('');
  });
});

// ─── fillForm ─────────────────────────────────────────────────────────────────

describe('fillForm', () => {
  it('fills both username and password fields', () => {
    const usernameField = document.createElement('input');
    usernameField.type = 'text';
    const passwordField = document.createElement('input');
    passwordField.type = 'password';

    const form: DetectedForm = {
      formElement: null,
      usernameField,
      passwordField,
      submitButton: null,
    };

    fillForm(form, 'user@example.com', 'mypassword');

    expect(usernameField.value).toBe('user@example.com');
    expect(passwordField.value).toBe('mypassword');
  });

  it('fills only password when usernameField is null', () => {
    const passwordField = document.createElement('input');
    passwordField.type = 'password';

    const form: DetectedForm = {
      formElement: null,
      usernameField: null,
      passwordField,
      submitButton: null,
    };

    // Should not throw
    expect(() => fillForm(form, 'user@example.com', 'mypassword')).not.toThrow();
    expect(passwordField.value).toBe('mypassword');
  });

  it('dispatches events on both fields', () => {
    const usernameField = document.createElement('input');
    usernameField.type = 'text';
    const passwordField = document.createElement('input');
    passwordField.type = 'password';

    const usernameEvents: string[] = [];
    const passwordEvents: string[] = [];

    usernameField.addEventListener('input', () => usernameEvents.push('input'));
    passwordField.addEventListener('input', () => passwordEvents.push('input'));

    const form: DetectedForm = {
      formElement: null,
      usernameField,
      passwordField,
      submitButton: null,
    };

    fillForm(form, 'user@example.com', 'mypassword');

    expect(usernameEvents).toContain('input');
    expect(passwordEvents).toContain('input');
  });
});
