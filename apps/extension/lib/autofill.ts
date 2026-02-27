/**
 * Autofill engine for the content script.
 * Simulates real user events for SPA framework compatibility.
 * React/Vue/Angular require the full click→focus→input→change sequence.
 */

import type { DetectedForm, DetectedIdentityForm, IdentityFieldType } from './form-detector.js';
import type { IdentityItem } from '@lockbox/types';
/**
 * Simulate filling a single input field with SPA-compatible events.
 * This sequence is required for React/Vue/Angular to detect the value change.
 */
export function simulateFill(field: HTMLInputElement, value: string): void {
  // 1. Click to focus
  field.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  // 2. Focus
  field.focus();
  field.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

  // 3. Clear existing value
  field.value = '';
  field.dispatchEvent(new Event('input', { bubbles: true }));

  // 4. Set new value
  field.value = value;

  // 5. Dispatch input event (React/Vue listen to this)
  field.dispatchEvent(new Event('input', { bubbles: true }));

  // 6. Dispatch change event
  field.dispatchEvent(new Event('change', { bubbles: true }));

  // 7. Blur
  field.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

/**
 * Fill a detected login form with username and password.
 */
export function fillForm(form: DetectedForm, username: string, password: string): void {
  if (form.usernameField) {
    simulateFill(form.usernameField, username);
  }
  simulateFill(form.passwordField, password);
}

/**
 * Create a lock icon overlay for a password field.
 * Uses Shadow DOM to isolate styles from the page.
 */
export function createLockIconOverlay(
  passwordField: HTMLInputElement,
  onClick: () => void,
): HTMLElement {
  // Create a wrapper using Shadow DOM for style isolation
  const host = document.createElement('span');
  host.style.cssText = `
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 2147483647;
    cursor: pointer;
    pointer-events: all;
  `;

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      button {
        background: none;
        border: none;
        cursor: pointer;
        padding: 2px;
        opacity: 0.6;
        transition: opacity 0.2s;
        font-size: 14px;
        line-height: 1;
      }
      button:hover { opacity: 1; }
    </style>
    <button title="Autofill with Lockbox">🔐</button>
  `;

  shadow.querySelector('button')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });

  // Position relative to the password field
  const fieldParent = passwordField.parentElement;
  if (fieldParent) {
    const parentStyle = window.getComputedStyle(fieldParent);
    if (parentStyle.position === 'static') {
      fieldParent.style.position = 'relative';
    }
    fieldParent.appendChild(host);
  }

  return host;
}

/**
 * Create an autofill suggestion dropdown using Shadow DOM.
 */
export function createSuggestionDropdown(
  anchorField: HTMLInputElement,
  items: Array<{ id: string; name: string; username: string }>,
  onSelect: (item: { id: string; name: string; username: string }) => void,
): HTMLElement {
  const host = document.createElement('div');

  const rect = anchorField.getBoundingClientRect();
  host.style.cssText = `
    position: fixed;
    left: ${rect.left + window.scrollX}px;
    top: ${rect.bottom + window.scrollY + 2}px;
    z-index: 2147483647;
    min-width: ${rect.width}px;
  `;

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      .dropdown {
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
      }
      .header {
        padding: 6px 12px;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        font-size: 11px;
        color: #64748b;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .item {
        padding: 8px 12px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 2px;
        border-bottom: 1px solid #f1f5f9;
      }
      .item:last-child { border-bottom: none; }
      .item:hover { background: #f0f9ff; }
      .item-name { font-weight: 500; color: #1e293b; }
      .item-username { color: #64748b; font-size: 12px; }
    </style>
    <div class="dropdown">
      <div class="header">🔐 Lockbox</div>
      ${items
        .map(
          (item) => `
        <div class="item" data-id="${item.id}">
          <span class="item-name">${escapeHtml(item.name)}</span>
          <span class="item-username">${escapeHtml(item.username)}</span>
        </div>
      `,
        )
        .join('')}
    </div>
  `;

  shadow.querySelectorAll('.item').forEach((el, i) => {
    el.addEventListener('click', () => {
      onSelect(items[i]);
      host.remove();
    });
  });

  document.body.appendChild(host);

  // Close on outside click
  const closeHandler = (e: MouseEvent) => {
    if (!host.contains(e.target as Node)) {
      host.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);

  return host;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Identity autofill ──────────────────────────────────────────────────────────────

/** Map identity item properties to form field types. */
const IDENTITY_FIELD_MAP: Record<IdentityFieldType | 'email', keyof IdentityItem | undefined> = {
  'first-name': 'firstName',
  'last-name': 'lastName',
  'name': 'firstName', // fallback: use firstName for generic name fields
  'phone': 'phone',
  'address-line1': 'address1',
  'address-line2': 'address2',
  'city': 'city',
  'state': 'state',
  'postal-code': 'postalCode',
  'country': 'country',
  'organization': 'company',
  'email': 'email',
};

/**
 * Fill a detected identity form with data from an IdentityItem.
 * Uses the same simulateFill pattern for SPA compatibility.
 */
export function fillIdentityForm(form: DetectedIdentityForm, identityItem: IdentityItem): void {
  for (const [fieldType, inputEl] of Object.entries(form.fields)) {
    if (!inputEl) continue;

    const key = fieldType as IdentityFieldType | 'email';
    const itemProp = IDENTITY_FIELD_MAP[key];
    if (!itemProp) continue;

    let value = identityItem[itemProp] as string | undefined;

    // For generic 'name' field, combine first + last
    if (key === 'name' && identityItem.firstName) {
      value = [identityItem.firstName, identityItem.lastName].filter(Boolean).join(' ');
    }

    if (value) {
      simulateFill(inputEl, value);
    }
  }
}

/**
 * Create an identity suggestion dropdown using Shadow DOM.
 * Similar to login dropdown but shows identity items.
 */
export function createIdentitySuggestionDropdown(
  anchorField: HTMLInputElement,
  items: Array<{ id: string; name: string; detail: string }>,
  onSelect: (item: { id: string; name: string; detail: string }) => void,
): HTMLElement {
  const host = document.createElement('div');

  const rect = anchorField.getBoundingClientRect();
  host.style.cssText = `
    position: fixed;
    left: ${rect.left + window.scrollX}px;
    top: ${rect.bottom + window.scrollY + 2}px;
    z-index: 2147483647;
    min-width: ${rect.width}px;
  `;

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      .dropdown {
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
      }
      .header {
        padding: 6px 12px;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        font-size: 11px;
        color: #64748b;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .item {
        padding: 8px 12px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 2px;
        border-bottom: 1px solid #f1f5f9;
      }
      .item:last-child { border-bottom: none; }
      .item:hover { background: #f0f9ff; }
      .item-name { font-weight: 500; color: #1e293b; }
      .item-detail { color: #64748b; font-size: 12px; }
    </style>
    <div class="dropdown">
      <div class="header">🆔 Lockbox Identity</div>
      ${items
        .map(
          (item) => `
        <div class="item" data-id="${item.id}">
          <span class="item-name">${escapeHtml(item.name)}</span>
          <span class="item-detail">${escapeHtml(item.detail)}</span>
        </div>
      `,
        )
        .join('')}
    </div>
  `;

  shadow.querySelectorAll('.item').forEach((el, i) => {
    el.addEventListener('click', () => {
      onSelect(items[i]);
      host.remove();
    });
  });

  document.body.appendChild(host);

  // Close on outside click
  const closeHandler = (e: MouseEvent) => {
    if (!host.contains(e.target as Node)) {
      host.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);

  return host;
}
