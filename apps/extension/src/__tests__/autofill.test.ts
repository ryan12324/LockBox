// @vitest-environment jsdom

/**
 * Tests for autofill.ts
 * Uses jsdom environment (configured in vitest.config.ts)
 */

import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearSiteIconCache } from '@lockbox/design';
import {
  createLockIconOverlay,
  createSuggestionDropdown,
  simulateFill,
  fillForm,
  fillPasswordCreationForm,
  createGeneratedPasswordDropdown,
} from '../../lib/autofill.js';
import type { DetectedForm, DetectedPasswordCreationForm } from '../../lib/form-detector.js';

// ─── simulateFill ─────────────────────────────────────────────────────────────

describe('simulateFill', () => {
  let input: HTMLInputElement;
  const events: string[] = [];

  beforeEach(() => {
    document.body.replaceChildren();
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

  it('does not synthesize a click', () => {
    simulateFill(input, 'testuser');
    expect(events).not.toContain('click');
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

  it('keeps focus instead of synthesizing a blur', () => {
    simulateFill(input, 'testuser');
    expect(events).not.toContain('blur');
    expect(document.activeElement).toBe(input);
  });

  it('dispatches focus before input and change', () => {
    simulateFill(input, 'testuser');
    const focusIdx = events.indexOf('focus');
    const inputIdx = events.lastIndexOf('input');
    const changeIdx = events.lastIndexOf('change');
    expect(focusIdx).toBeLessThan(inputIdx);
    expect(inputIdx).toBeLessThan(changeIdx);
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

  it('rejects detached, disabled, and read-only fields', () => {
    const detached = document.createElement('input');
    expect(simulateFill(detached, 'value')).toBe(false);

    input.disabled = true;
    expect(simulateFill(input, 'disabled')).toBe(false);
    input.disabled = false;
    input.readOnly = true;
    expect(simulateFill(input, 'read-only')).toBe(false);
  });

  it('updates a React-controlled field and survives a rerender', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let observedValue = '';

    function ControlledField() {
      const [value, setValue] = useState('');
      observedValue = value;
      return createElement('input', {
        value,
        onChange: (event) => setValue(event.currentTarget.value),
      });
    }

    const root = createRoot(container);
    await act(async () => root.render(createElement(ControlledField)));
    const controlledInput = container.querySelector('input')!;

    await act(async () => {
      expect(simulateFill(controlledInput, 'react-user')).toBe(true);
    });

    expect(observedValue).toBe('react-user');
    await act(async () => root.render(createElement(ControlledField)));
    expect(controlledInput.value).toBe('react-user');
    await act(async () => root.unmount());
  });
});

// ─── fillForm ─────────────────────────────────────────────────────────────────

describe('fillForm', () => {
  it('fills both username and password fields', () => {
    const formElement = document.createElement('form');
    const usernameField = document.createElement('input');
    usernameField.type = 'text';
    const passwordField = document.createElement('input');
    passwordField.type = 'password';
    formElement.append(usernameField, passwordField);
    document.body.appendChild(formElement);

    const form: DetectedForm = {
      formElement,
      usernameField,
      passwordField,
      submitButton: null,
      passwordPurpose: 'current',
    };

    expect(fillForm(form, 'user@example.com', 'mypassword')).toBe(true);

    expect(usernameField.value).toBe('user@example.com');
    expect(passwordField.value).toBe('mypassword');
  });

  it('fills only password when usernameField is null', () => {
    const passwordField = document.createElement('input');
    passwordField.type = 'password';
    document.body.appendChild(passwordField);

    const form: DetectedForm = {
      formElement: null,
      usernameField: null,
      passwordField,
      submitButton: null,
      passwordPurpose: 'current',
    };

    // Should not throw
    expect(() => fillForm(form, 'user@example.com', 'mypassword')).not.toThrow();
    expect(passwordField.value).toBe('mypassword');
  });

  it('dispatches events on both fields', () => {
    const formElement = document.createElement('form');
    const usernameField = document.createElement('input');
    usernameField.type = 'text';
    const passwordField = document.createElement('input');
    passwordField.type = 'password';
    formElement.append(usernameField, passwordField);
    document.body.appendChild(formElement);

    const usernameEvents: string[] = [];
    const passwordEvents: string[] = [];

    usernameField.addEventListener('input', () => usernameEvents.push('input'));
    passwordField.addEventListener('input', () => passwordEvents.push('input'));

    const form: DetectedForm = {
      formElement,
      usernameField,
      passwordField,
      submitButton: null,
      passwordPurpose: 'current',
    };

    fillForm(form, 'user@example.com', 'mypassword');

    expect(usernameEvents).toContain('input');
    expect(passwordEvents).toContain('input');
  });
});

describe('fillPasswordCreationForm', () => {
  it('fills the new and confirmation fields with one generated password', () => {
    const formElement = document.createElement('form');
    const currentPassword = document.createElement('input');
    currentPassword.type = 'password';
    currentPassword.value = 'existing-password';
    const newPassword = document.createElement('input');
    newPassword.type = 'password';
    const confirmation = document.createElement('input');
    confirmation.type = 'password';
    formElement.append(currentPassword, newPassword, confirmation);
    document.body.appendChild(formElement);

    const form: DetectedPasswordCreationForm = {
      formElement,
      usernameField: null,
      passwordFields: [newPassword, confirmation],
    };
    expect(fillPasswordCreationForm(form, 'Generated-4827!')).toBe(true);
    expect(newPassword.value).toBe('Generated-4827!');
    expect(confirmation.value).toBe('Generated-4827!');
    expect(currentPassword.value).toBe('existing-password');
  });

  it('does not partially fill when a confirmation field is unavailable', () => {
    const formElement = document.createElement('form');
    const newPassword = document.createElement('input');
    const detachedConfirmation = document.createElement('input');
    formElement.appendChild(newPassword);
    document.body.appendChild(formElement);

    expect(
      fillPasswordCreationForm(
        {
          formElement,
          usernameField: null,
          passwordFields: [newPassword, detachedConfirmation],
        },
        'Generated-4827!'
      )
    ).toBe(false);
    expect(newPassword.value).toBe('');
  });
});

describe('createGeneratedPasswordDropdown', () => {
  it('keeps generated plaintext out of the injected DOM until selection', () => {
    const field = document.createElement('input');
    field.getBoundingClientRect = () => ({
      x: 20,
      y: 40,
      left: 20,
      top: 40,
      right: 220,
      bottom: 72,
      width: 200,
      height: 32,
      toJSON: () => ({}),
    });
    document.body.appendChild(field);
    const onSelect = vi.fn();
    const password = 'Secret-generated-4827!';
    const host = createGeneratedPasswordDropdown(
      field,
      [{ id: 'strong', label: 'Use strong', description: '20 characters', password }],
      onSelect
    );

    expect(host.shadowRoot?.textContent).not.toContain(password);
    host.shadowRoot?.querySelector<HTMLButtonElement>('[data-generation-choice="strong"]')?.click();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ password }));
  });
});

// ─── createSuggestionDropdown ────────────────────────────────────────────────

describe('createSuggestionDropdown', () => {
  beforeEach(() => {
    clearSiteIconCache();
    document.body.replaceChildren();
  });

  it('reuses a successful candidate and suppresses both candidates after they fail', () => {
    const field = document.createElement('input');
    field.getBoundingClientRect = () => ({
      x: 20,
      y: 40,
      left: 20,
      top: 40,
      right: 220,
      bottom: 72,
      width: 200,
      height: 32,
      toJSON: () => ({}),
    });
    document.body.appendChild(field);

    const host = createSuggestionDropdown(
      field,
      [
        {
          id: 'entry-1',
          name: 'Example',
          username: 'user@example.com',
          uris: ['https://example.com/login'],
        },
      ],
      () => undefined
    );
    const icon = host.shadowRoot!.querySelector<HTMLElement>('.item-icon')!;
    const image = icon.querySelector<HTMLImageElement>('img')!;

    expect(image.src).toBe('https://example.com/apple-touch-icon.png');
    image.dispatchEvent(new Event('error'));
    expect(image.src).toBe('https://example.com/favicon.ico');
    expect(icon.dataset.loaded).toBeUndefined();

    image.dispatchEvent(new Event('load'));
    expect(icon.dataset.loaded).toBe('true');
    host.remove();

    const cachedHost = createSuggestionDropdown(
      field,
      [
        {
          id: 'entry-1',
          name: 'Example',
          username: 'user@example.com',
          uris: ['https://example.com/login'],
        },
      ],
      () => undefined
    );
    const cachedIcon = cachedHost.shadowRoot!.querySelector<HTMLElement>('.item-icon')!;
    const cachedImage = cachedIcon.querySelector<HTMLImageElement>('img')!;
    expect(cachedImage.src).toBe('https://example.com/favicon.ico');

    cachedImage.dispatchEvent(new Event('error'));
    expect(cachedIcon.querySelector('img')).toBeNull();
    cachedHost.remove();

    const failedHost = createSuggestionDropdown(
      field,
      [
        {
          id: 'entry-1',
          name: 'Example',
          username: 'user@example.com',
          uris: ['https://example.com/login'],
        },
      ],
      () => undefined
    );
    const failedIcon = failedHost.shadowRoot!.querySelector<HTMLElement>('.item-icon')!;
    expect(failedIcon.querySelector('img')).toBeNull();
    expect(failedIcon.querySelector('svg')).not.toBeNull();
  });

  it('supports arrow-key navigation and Escape focus restoration', async () => {
    const field = document.createElement('input');
    field.getBoundingClientRect = () => ({
      x: 20,
      y: 40,
      left: 20,
      top: 40,
      right: 220,
      bottom: 84,
      width: 200,
      height: 44,
      toJSON: () => ({}),
    });
    document.body.appendChild(field);

    const host = createSuggestionDropdown(
      field,
      [
        { id: 'one', name: 'First', username: 'first@example.com' },
        { id: 'two', name: 'Second', username: 'second@example.com' },
      ],
      () => undefined
    );
    const buttons = host.shadowRoot!.querySelectorAll<HTMLButtonElement>('.item');
    await Promise.resolve();
    expect(host.shadowRoot!.activeElement).toBe(buttons[0]);

    buttons[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true })
    );
    expect(host.shadowRoot!.activeElement).toBe(buttons[1]);

    buttons[1].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true })
    );
    expect(host.isConnected).toBe(false);
    expect(document.activeElement).toBe(field);
  });

  it('closes when an SPA removes its anchor field', async () => {
    const field = document.createElement('input');
    field.getBoundingClientRect = () => ({
      x: 20,
      y: 40,
      left: 20,
      top: 40,
      right: 220,
      bottom: 84,
      width: 200,
      height: 44,
      toJSON: () => ({}),
    });
    document.body.appendChild(field);
    const host = createSuggestionDropdown(
      field,
      [{ id: 'one', name: 'First', username: 'first@example.com' }],
      () => undefined
    );

    field.remove();
    await Promise.resolve();
    expect(host.isConnected).toBe(false);
  });
});

describe('createLockIconOverlay', () => {
  beforeEach(() => document.body.replaceChildren());

  it('moves inward so it does not cover a show-password add-on', () => {
    const wrapper = document.createElement('div');
    const field = document.createElement('input');
    field.type = 'password';
    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.setAttribute('aria-label', 'Show password');
    wrapper.append(field, reveal);
    document.body.appendChild(wrapper);

    field.getBoundingClientRect = () => ({
      x: 100,
      y: 40,
      left: 100,
      top: 40,
      right: 300,
      bottom: 84,
      width: 200,
      height: 44,
      toJSON: () => ({}),
    });
    reveal.getBoundingClientRect = () => ({
      x: 260,
      y: 44,
      left: 260,
      top: 44,
      right: 296,
      bottom: 80,
      width: 36,
      height: 36,
      toJSON: () => ({}),
    });

    const overlay = createLockIconOverlay(field, () => undefined);
    expect(Number.parseFloat(overlay.host.style.left)).toBeLessThanOrEqual(206);
    overlay.destroy();
  });
});
