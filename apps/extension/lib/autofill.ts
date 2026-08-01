/**
 * Autofill engine for the content script.
 * Simulates real user events for SPA framework compatibility.
 * React/Vue/Angular require the full click→focus→input→change sequence.
 */

import type { DetectedForm, DetectedIdentityForm, IdentityFieldType } from './form-detector.js';
import type { IdentityItem } from '@lockbox/types';
import { iconifySvg } from './iconify.js';
import { INJECTED_BRAND_STYLES, lockboxBrandMarkup } from './injected-brand.js';
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
 * Create a lock icon overlay for an input field.
 * Uses position:fixed to avoid stacking-context issues with the input.
 * Shadow DOM isolates styles from the page.
 */
export function createLockIconOverlay(field: HTMLInputElement, onClick: () => void): HTMLElement {
  const host = document.createElement('div');
  host.className = 'lockbox-lock-overlay';

  // Position the icon inside the right edge of the input using fixed positioning.
  // This avoids stacking context / overflow:hidden issues with the parent.
  const positionIcon = () => {
    const rect = field.getBoundingClientRect();
    const size = 24;
    host.style.cssText = `
      position: fixed;
      left: ${rect.right - size - 6}px;
      top: ${rect.top + (rect.height - size) / 2}px;
      width: ${size}px;
      height: ${size}px;
      z-index: 2147483647;
      cursor: pointer;
      pointer-events: auto;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
  };

  positionIcon();

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host { display: flex; align-items: center; justify-content: center; }
    button {
      all: unset;
      cursor: pointer;
      line-height: 1;
      opacity: 0.5;
      transition: opacity 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }
    button svg { display: block; color: #6B5640; }
    button:hover { opacity: 1; }
    button:focus-visible { opacity: 1; outline: 2px solid #8B7355; outline-offset: 2px; border-radius: 4px; }
  `;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = 'Autofill with Lockbox';
  btn.setAttribute('aria-label', 'Autofill with Lockbox');
  btn.innerHTML = iconifySvg('lock', { size: 16 });

  shadow.appendChild(style);
  shadow.appendChild(btn);

  // Handle click on the shadow button
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });

  // Fallback: also handle click on the host itself
  host.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });

  // Reposition on scroll and resize
  const reposition = () => positionIcon();
  window.addEventListener('scroll', reposition, { passive: true });
  window.addEventListener('resize', reposition, { passive: true });

  // Remove listeners when the host is removed from the DOM
  const observer = new MutationObserver(() => {
    if (!host.isConnected) {
      window.removeEventListener('scroll', reposition);
      window.removeEventListener('resize', reposition);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.body.appendChild(host);

  return host;
}

/**
 * Create an autofill suggestion dropdown using Shadow DOM.
 */
export function createSuggestionDropdown(
  anchorField: HTMLInputElement,
  items: Array<{ id: string; name: string; username: string }>,
  onSelect: (item: { id: string; name: string; username: string }) => void
): HTMLElement {
  const host = document.createElement('div');

  const rect = anchorField.getBoundingClientRect();
  host.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.bottom + 2}px;
    z-index: 2147483647;
    min-width: ${rect.width}px;
  `;

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
     <style>
       ${INJECTED_BRAND_STYLES}
       .dropdown {
         background: #FDFCFA;
         border: 1px solid #DDD6CC;
         border-radius: 10px;
         box-shadow: 0 4px 12px rgba(0,0,0,0.15);
         overflow: hidden;
         font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         font-size: 13px;
       }
       .header {
         min-height: 34px;
         padding: 7px 12px;
         display: flex;
         align-items: center;
         background: #EAE6DF;
         border-bottom: 1px solid #DDD6CC;
       }
       .header .lockbox-brand__logo { width: 84px; }
       .item {
         width: 100%;
         padding: 8px 12px;
         cursor: pointer;
         display: flex;
         flex-direction: column;
         gap: 2px;
         background: transparent;
         border: 0;
         border-bottom: 1px solid #DDD6CC;
         font: inherit;
         text-align: left;
       }
       .item:last-child { border-bottom: none; }
       .item:hover { background: rgba(196,168,130,0.1); }
       .item:focus-visible { outline: 2px solid #8B7355; outline-offset: -2px; }
       .item-name { font-weight: 500; color: #2C2825; }
       .item-username { color: #7A7168; font-size: 12px; }
    </style>
    <div class="dropdown">
      <div class="header">${lockboxBrandMarkup()}</div>
    </div>
  `;

  const dropdown = shadow.querySelector('.dropdown')!;
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'item';

    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = item.name;
    const username = document.createElement('span');
    username.className = 'item-username';
    username.textContent = item.username;
    button.append(name, username);
    button.addEventListener('click', () => {
      onSelect(item);
      host.remove();
    });
    dropdown.appendChild(button);
  }

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

// ─── Identity autofill ──────────────────────────────────────────────────────────────

/** Map identity item properties to form field types. */
const IDENTITY_FIELD_MAP: Record<IdentityFieldType | 'email', keyof IdentityItem | undefined> = {
  'first-name': 'firstName',
  'last-name': 'lastName',
  name: 'firstName', // fallback: use firstName for generic name fields
  phone: 'phone',
  'address-line1': 'address1',
  'address-line2': 'address2',
  city: 'city',
  state: 'state',
  'postal-code': 'postalCode',
  country: 'country',
  organization: 'company',
  email: 'email',
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
  onSelect: (item: { id: string; name: string; detail: string }) => void
): HTMLElement {
  const host = document.createElement('div');

  const rect = anchorField.getBoundingClientRect();
  host.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.bottom + 2}px;
    z-index: 2147483647;
    min-width: ${rect.width}px;
  `;

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
     <style>
       ${INJECTED_BRAND_STYLES}
       .dropdown {
         background: #FDFCFA;
         border: 1px solid #DDD6CC;
         border-radius: 10px;
         box-shadow: 0 4px 12px rgba(0,0,0,0.15);
         overflow: hidden;
         font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         font-size: 13px;
       }
       .header {
         min-height: 34px;
         padding: 7px 12px;
         display: flex;
         align-items: center;
         background: #EAE6DF;
         border-bottom: 1px solid #DDD6CC;
       }
       .header .lockbox-brand__logo { width: 84px; }
       .item {
         width: 100%;
         padding: 8px 12px;
         cursor: pointer;
         display: flex;
         flex-direction: column;
         gap: 2px;
         background: transparent;
         border: 0;
         border-bottom: 1px solid #DDD6CC;
         font: inherit;
         text-align: left;
       }
       .item:last-child { border-bottom: none; }
       .item:hover { background: rgba(196,168,130,0.1); }
       .item:focus-visible { outline: 2px solid #8B7355; outline-offset: -2px; }
       .item-name { font-weight: 500; color: #2C2825; }
       .item-detail { color: #7A7168; font-size: 12px; }
     </style>
     <div class="dropdown">
       <div class="header">${lockboxBrandMarkup()}</div>
    </div>
  `;

  const dropdown = shadow.querySelector('.dropdown')!;
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'item';

    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = item.name;
    const detail = document.createElement('span');
    detail.className = 'item-detail';
    detail.textContent = item.detail;
    button.append(name, detail);
    button.addEventListener('click', () => {
      onSelect(item);
      host.remove();
    });
    dropdown.appendChild(button);
  }

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

/** Status type for the lock icon dropdown. */
export type StatusDropdownType = 'locked' | 'no-matches' | 'error';

/** Action a user can take from the status dropdown. */
export interface StatusDropdownAction {
  label: string;
  onClick: () => void;
}

/**
 * Create a status dropdown anchored to a field.
 * Shows messages like "Vault locked" or "No matching logins" with action buttons.
 * Uses Shadow DOM for style isolation.
 */
export function createStatusDropdown(
  anchorField: HTMLInputElement,
  type: StatusDropdownType,
  actions: StatusDropdownAction[]
): HTMLElement {
  // Remove any existing status dropdown
  document.getElementById('lockbox-status-dropdown')?.remove();

  const host = document.createElement('div');
  host.id = 'lockbox-status-dropdown';

  const rect = anchorField.getBoundingClientRect();
  host.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.bottom + 2}px;
    z-index: 2147483647;
    min-width: ${Math.max(rect.width, 240)}px;
  `;

  const shadow = host.attachShadow({ mode: 'open' });

  const iconMap: Record<StatusDropdownType, Parameters<typeof iconifySvg>[0]> = {
    locked: 'lock',
    'no-matches': 'search',
    error: 'alert-triangle',
  };

  const titleMap: Record<StatusDropdownType, string> = {
    locked: 'Vault is locked',
    'no-matches': 'No matching logins',
    error: 'Something went wrong',
  };

  const descMap: Record<StatusDropdownType, string> = {
    locked: 'Unlock Lockbox to autofill this form.',
    'no-matches': 'No saved credentials match this site.',
    error: 'Could not connect to Lockbox.',
  };

  const icon = iconMap[type];
  const title = titleMap[type];
  const desc = descMap[type];

  const style = document.createElement('style');
  style.textContent = `
     ${INJECTED_BRAND_STYLES}
     .dropdown {
       background: #FDFCFA;
       border: 1px solid #DDD6CC;
       border-radius: 10px;
       box-shadow: 0 4px 12px rgba(0,0,0,0.15);
       overflow: hidden;
       font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
       font-size: 13px;
     }
     .header {
       min-height: 34px;
       padding: 7px 12px;
       display: flex;
       align-items: center;
       background: #EAE6DF;
       border-bottom: 1px solid #DDD6CC;
     }
     .header .lockbox-brand__logo { width: 84px; }
     .body {
       padding: 12px;
       display: flex;
       align-items: flex-start;
       gap: 10px;
     }
     .icon { font-size: 20px; line-height: 1; flex-shrink: 0; }
     .text { flex: 1; min-width: 0; }
     .title { font-weight: 600; color: #2C2825; margin-bottom: 2px; }
     .desc { color: #7A7168; font-size: 12px; line-height: 1.4; }
     .actions {
       padding: 8px 12px;
       border-top: 1px solid #DDD6CC;
       display: flex;
       gap: 8px;
       justify-content: flex-end;
     }
     .btn {
       padding: 5px 12px;
       border-radius: 10px;
       font-size: 12px;
       font-weight: 500;
       cursor: pointer;
       border: 1px solid #DDD6CC;
       background: #FDFCFA;
       color: #7A7168;
       transition: background 0.15s;
     }
     .btn:hover { background: #EAE6DF; }
     .btn-primary {
       background: #8B7355;
       color: white;
       border-color: #8B7355;
     }
     .btn-primary:hover { background: #7A6348; }
   `;

  const dropdown = document.createElement('div');
  dropdown.className = 'dropdown';

  const headerEl = document.createElement('div');
  headerEl.className = 'header';
  headerEl.innerHTML = lockboxBrandMarkup();
  dropdown.appendChild(headerEl);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'body';
  bodyEl.innerHTML = `
    <span class="icon">${iconifySvg(icon, { size: 20 })}</span>
    <div class="text">
      <div class="title">${title}</div>
      <div class="desc">${desc}</div>
    </div>
  `;
  dropdown.appendChild(bodyEl);

  if (actions.length > 0) {
    const actionsEl = document.createElement('div');
    actionsEl.className = 'actions';

    actions.forEach((action, i) => {
      const btn = document.createElement('button');
      btn.className = i === actions.length - 1 ? 'btn btn-primary' : 'btn';
      btn.textContent = action.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        host.remove();
        action.onClick();
      });
      actionsEl.appendChild(btn);
    });

    dropdown.appendChild(actionsEl);
  }

  shadow.appendChild(style);
  shadow.appendChild(dropdown);
  document.body.appendChild(host);

  // Close on outside click
  const closeHandler = (e: MouseEvent) => {
    if (!host.contains(e.target as Node)) {
      host.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);

  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    if (host.parentElement) host.remove();
  }, 10_000);

  return host;
}
