/**
 * Autofill engine for the content script.
 * Simulates native value changes and real input events for SPA framework compatibility.
 */

import { isEligibleField } from './form-detector.js';
import type {
  DetectedForm,
  DetectedIdentityForm,
  DetectedPasswordCreationForm,
  IdentityFieldType,
} from './form-detector.js';
import type { IdentityItem } from '@lockbox/types';
import {
  getCachedSiteIconUrls,
  recordSiteIconFailure,
  recordSiteIconSuccess,
} from '@lockbox/design';
import { iconifySvg } from './iconify.js';
import { INJECTED_BRAND_STYLES, lockboxBrandMarkup } from './injected-brand.js';

const INJECTED_THEME_STYLES = `
  :host {
    color-scheme: light;
    --aw-bg: oklch(0.972 0.009 278);
    --aw-bg-subtle: oklch(0.944 0.017 278);
    --aw-surface: oklch(0.986 0.006 278);
    --aw-surface-raised: oklch(0.995 0.004 278);
    --aw-line: oklch(0.86 0.022 278);
    --aw-line-strong: oklch(0.7 0.045 278);
    --aw-text: oklch(0.24 0.055 274);
    --aw-text-secondary: oklch(0.43 0.045 274);
    --aw-primary: oklch(0.5 0.24 282);
    --aw-primary-hover: oklch(0.44 0.23 282);
    --aw-primary-fg: oklch(0.985 0.006 278);
    --aw-danger: oklch(0.64 0.2 25);
    --aw-brand-surface: oklch(0.986 0.006 278);
    --aw-shadow: 0 8px 22px oklch(0.24 0.055 274 / 0.18);
  }
  .lockbox-brand {
    width: max-content;
    padding: 3px 5px;
    background: var(--aw-brand-surface);
    border-radius: 6px;
    forced-color-adjust: none;
  }
  @media (prefers-color-scheme: dark) {
    :host {
      color-scheme: dark;
      --aw-bg: oklch(0.18 0.04 274);
      --aw-bg-subtle: oklch(0.215 0.045 274);
      --aw-surface: oklch(0.235 0.045 274);
      --aw-surface-raised: oklch(0.27 0.045 274);
      --aw-line: oklch(0.34 0.045 274);
      --aw-line-strong: oklch(0.48 0.06 274);
      --aw-text: oklch(0.94 0.01 278);
      --aw-text-secondary: oklch(0.77 0.025 278);
      --aw-primary: oklch(0.72 0.2 282);
      --aw-primary-hover: oklch(0.77 0.18 282);
      --aw-primary-fg: oklch(0.16 0.04 274);
      --aw-danger: oklch(0.74 0.16 25);
      --aw-shadow: 0 8px 22px oklch(0.05 0.008 274 / 0.38);
    }
  }
  @media (forced-colors: active) {
    :host {
      --aw-bg: Canvas;
      --aw-bg-subtle: Canvas;
      --aw-surface: Canvas;
      --aw-surface-raised: Canvas;
      --aw-line: CanvasText;
      --aw-line-strong: CanvasText;
      --aw-text: CanvasText;
      --aw-text-secondary: CanvasText;
      --aw-primary: Highlight;
      --aw-primary-hover: Highlight;
      --aw-primary-fg: HighlightText;
    }
  }
`;

function removeExistingFloatingUi(ownerDocument: Document): void {
  ownerDocument
    .querySelectorAll<HTMLElement>(
      '[data-authwell-ui="login-menu"], [data-authwell-ui="identity-menu"], [data-authwell-ui="status-menu"], [data-authwell-ui="generation-menu"]'
    )
    .forEach((existing) => existing.remove());
}

function positionFloatingHost(
  host: HTMLElement,
  anchorField: HTMLInputElement,
  minimumWidth = 240
): void {
  if (!anchorField.isConnected || !isEligibleField(anchorField)) {
    host.remove();
    return;
  }

  const view = anchorField.ownerDocument.defaultView ?? window;
  const rect = anchorField.getBoundingClientRect();
  const viewportWidth = view.innerWidth || anchorField.ownerDocument.documentElement.clientWidth;
  const viewportHeight = view.innerHeight || anchorField.ownerDocument.documentElement.clientHeight;
  const gutter = 8;
  const width = Math.min(
    Math.max(rect.width, minimumWidth),
    Math.max(0, viewportWidth - gutter * 2)
  );

  host.style.width = `${width}px`;
  host.style.maxWidth = `calc(100vw - ${gutter * 2}px)`;
  host.style.maxHeight = `calc(100vh - ${gutter * 2}px)`;
  const measuredHeight = host.getBoundingClientRect().height;
  const estimatedHeight = measuredHeight || 220;
  const roomBelow = viewportHeight - rect.bottom - gutter;
  const placeAbove = roomBelow < estimatedHeight && rect.top > roomBelow;
  const top = placeAbove
    ? Math.max(gutter, rect.top - estimatedHeight - 2)
    : Math.min(rect.bottom + 2, Math.max(gutter, viewportHeight - estimatedHeight - gutter));
  const left = Math.min(
    Math.max(rect.left, gutter),
    Math.max(gutter, viewportWidth - width - gutter)
  );

  host.style.position = 'fixed';
  host.style.left = `${left}px`;
  host.style.top = `${top}px`;
  host.style.zIndex = '2147483647';
}

function installFloatingLifecycle(
  host: HTMLElement,
  anchorField: HTMLInputElement,
  shadow: ShadowRoot,
  focusSelector: string
): void {
  const ownerDocument = anchorField.ownerDocument;
  const view = ownerDocument.defaultView ?? window;
  const originalRemove = host.remove.bind(host);
  let removed = false;
  let positionFrame: number | null = null;

  const reposition = () => {
    if (removed || positionFrame !== null) return;
    const update = () => {
      positionFrame = null;
      if (!removed) positionFloatingHost(host, anchorField);
    };
    positionFrame =
      typeof view.requestAnimationFrame === 'function'
        ? view.requestAnimationFrame(update)
        : view.setTimeout(update, 16);
  };
  const close = (restoreFocus = false) => {
    if (removed) return;
    removed = true;
    ownerDocument.removeEventListener('pointerdown', outsideHandler, true);
    ownerDocument.removeEventListener('focusin', focusHandler, true);
    view.removeEventListener('resize', reposition);
    view.removeEventListener('scroll', reposition, true);
    resizeObserver?.disconnect();
    mutationObserver.disconnect();
    if (positionFrame !== null) {
      if (typeof view.cancelAnimationFrame === 'function') view.cancelAnimationFrame(positionFrame);
      else view.clearTimeout(positionFrame);
      positionFrame = null;
    }
    originalRemove();
    if (restoreFocus && anchorField.isConnected) anchorField.focus({ preventScroll: true });
  };

  const outsideHandler = (event: Event) => {
    const target = event.target;
    if (target instanceof Node && !host.contains(target) && target !== anchorField) close();
  };
  const focusHandler = (event: FocusEvent) => {
    const target = event.target;
    if (target instanceof Node && !host.contains(target) && target !== anchorField) close();
  };
  const resizeObserver =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reposition);
  const mutationObserver = new MutationObserver((records) => {
    if (records.every((record) => record.target === host || host.contains(record.target))) return;
    if (!host.isConnected || !anchorField.isConnected || !isEligibleField(anchorField)) close();
    else reposition();
  });

  host.remove = () => close();
  ownerDocument.addEventListener('pointerdown', outsideHandler, true);
  ownerDocument.addEventListener('focusin', focusHandler, true);
  view.addEventListener('resize', reposition, { passive: true });
  view.addEventListener('scroll', reposition, { capture: true, passive: true });
  resizeObserver?.observe(anchorField);
  resizeObserver?.observe(host);
  if (ownerDocument.body) {
    mutationObserver.observe(ownerDocument.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-hidden', 'class', 'disabled', 'hidden', 'inert', 'readonly', 'style'],
    });
  }

  shadow.addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent)) return;
    const controls = Array.from(shadow.querySelectorAll<HTMLElement>(focusSelector));
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (controls.length === 0 || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const currentIndex = controls.indexOf(shadow.activeElement as HTMLElement);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? controls.length - 1
          : event.key === 'ArrowUp'
            ? (currentIndex - 1 + controls.length) % controls.length
            : (currentIndex + 1) % controls.length;
    controls[nextIndex]?.focus();
  });

  queueMicrotask(() => {
    if (!removed) shadow.querySelector<HTMLElement>(focusSelector)?.focus();
  });
}
/**
 * Simulate filling a single input field with SPA-compatible events.
 * This sequence is required for React/Vue/Angular to detect the value change.
 */
export function simulateFill(field: HTMLInputElement, value: string): boolean {
  if (!field.isConnected || !isEligibleField(field)) return false;

  const view = field.ownerDocument.defaultView;
  const inputPrototype = view?.HTMLInputElement?.prototype ?? HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(inputPrototype, 'value')?.set;

  field.focus({ preventScroll: true });

  if (valueSetter) valueSetter.call(field, value);
  else field.value = value;

  const InputEventConstructor = view?.InputEvent;
  const EventConstructor = view?.Event ?? Event;
  const inputEvent = InputEventConstructor
    ? new InputEventConstructor('input', {
        bubbles: true,
        composed: true,
        data: value,
        inputType: 'insertReplacementText',
      })
    : new EventConstructor('input', { bubbles: true, composed: true });

  field.dispatchEvent(inputEvent);
  field.dispatchEvent(new EventConstructor('change', { bubbles: true, composed: true }));
  return true;
}

/**
 * Fill a detected login form with username and password.
 */
export function fillForm(form: DetectedForm, username: string, password: string): boolean {
  if (!form.passwordField.isConnected) return false;
  if (form.usernameField) {
    simulateFill(form.usernameField, username);
  }
  return simulateFill(form.passwordField, password);
}

/** Fill the primary and every confirmation field with the same new password. */
export function fillPasswordCreationForm(
  form: DetectedPasswordCreationForm,
  password: string
): boolean {
  if (
    form.passwordFields.length === 0 ||
    form.passwordFields.some((field) => !field.isConnected || !isEligibleField(field))
  ) {
    return false;
  }
  return form.passwordFields.every((field) => simulateFill(field, password));
}

export interface LockIconOverlayHandle {
  host: HTMLElement;
  field: HTMLInputElement;
  setAction: (action: FieldControlAction) => void;
  reposition: () => void;
  destroy: () => void;
}

export type FieldControlAction = 'autofill' | 'generate';

function getFieldAccessibleName(field: HTMLInputElement): string {
  const explicitLabel = field.labels?.[0]?.textContent?.trim();
  const ariaLabel = field.getAttribute('aria-label')?.trim();
  const placeholder = field.placeholder.trim();
  return explicitLabel || ariaLabel || placeholder || 'this field';
}

function findEndAddonInset(field: HTMLInputElement, rect: DOMRect): number {
  const container = field.parentElement;
  if (!container || rect.width <= 0 || rect.height <= 0) return 0;

  const direction = (field.ownerDocument.defaultView ?? window).getComputedStyle(field).direction;
  let inset = 0;
  const controls = container.querySelectorAll<HTMLElement>(
    'button, [role="button"], input[type="button"], input[type="checkbox"]'
  );

  for (const control of controls) {
    const label = `${control.getAttribute('aria-label') ?? ''} ${control.title} ${control.textContent ?? ''}`;
    if (!/(show|hide|reveal|visibility|password|passcode|eye)/i.test(label)) continue;

    const controlRect = control.getBoundingClientRect();
    const overlapsVertically = controlRect.bottom > rect.top && controlRect.top < rect.bottom;
    const overlapsField = controlRect.right > rect.left && controlRect.left < rect.right;
    if (!overlapsVertically || !overlapsField) continue;

    const candidate =
      direction === 'rtl' ? controlRect.right - rect.left + 6 : rect.right - controlRect.left + 6;
    inset = Math.max(inset, candidate);
  }

  return inset;
}

/**
 * Create a lock icon overlay for an input field.
 * Uses position:fixed to avoid stacking-context issues with the input.
 * Shadow DOM isolates styles from the page.
 */
export function createLockIconOverlay(
  field: HTMLInputElement,
  onClick: () => void,
  initialAction: FieldControlAction = 'autofill'
): LockIconOverlayHandle {
  const ownerDocument = field.ownerDocument;
  const view = ownerDocument.defaultView ?? window;
  const host = ownerDocument.createElement('div');
  host.className = 'lockbox-lock-overlay';
  host.dataset.authwellUi = 'field-control';

  const size = 44;
  const positionIcon = () => {
    if (!field.isConnected || !isEligibleField(field)) {
      host.style.display = 'none';
      btn.tabIndex = -1;
      return;
    }

    const rect = field.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      host.style.display = 'none';
      btn.tabIndex = -1;
      return;
    }

    const direction = view.getComputedStyle(field).direction;
    const addonInset = findEndAddonInset(field, rect);
    const viewportWidth = view.innerWidth || ownerDocument.documentElement.clientWidth;
    const viewportHeight = view.innerHeight || ownerDocument.documentElement.clientHeight;
    let left =
      direction === 'rtl' ? rect.left + 4 + addonInset : rect.right - size - 4 - addonInset;

    if (left < rect.left || left + size > rect.right) {
      const outsideEnd = direction === 'rtl' ? rect.left - size - 4 : rect.right + 4;
      const outsideStart = direction === 'rtl' ? rect.right + 4 : rect.left - size - 4;
      left = outsideEnd >= 4 && outsideEnd + size <= viewportWidth - 4 ? outsideEnd : outsideStart;
    }

    left = Math.min(Math.max(left, 4), Math.max(4, viewportWidth - size - 4));
    const top = Math.min(
      Math.max(rect.top + (rect.height - size) / 2, 4),
      Math.max(4, viewportHeight - size - 4)
    );

    const outsideViewport =
      rect.bottom < 0 || rect.top > viewportHeight || rect.right < 0 || rect.left > viewportWidth;
    host.style.display = outsideViewport ? 'none' : 'flex';
    btn.tabIndex = outsideViewport ? -1 : 0;
    host.style.cssText = `
      position: fixed;
      left: ${left}px;
      top: ${top}px;
      width: ${size}px;
      height: ${size}px;
      z-index: 2147483646;
      cursor: pointer;
      pointer-events: auto;
      display: ${outsideViewport ? 'none' : 'flex'};
      align-items: center;
      justify-content: center;
    `;
  };

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = ownerDocument.createElement('style');
  style.textContent = `
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      color-scheme: light;
      --aw-control: oklch(0.986 0.006 278 / 0.96);
      --aw-line: oklch(0.78 0.035 278);
      --aw-ink: oklch(0.43 0.045 274);
      --aw-focus: oklch(0.62 0.24 282);
      --aw-shadow: 0 2px 8px oklch(0.24 0.055 274 / 0.18);
    }
    button {
      all: unset;
      box-sizing: border-box;
      cursor: pointer;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      color: var(--aw-ink);
      background: var(--aw-control);
      border: 1px solid var(--aw-line);
      border-radius: 10px;
      box-shadow: var(--aw-shadow);
      opacity: 0.9;
      transition: opacity 160ms cubic-bezier(0.22, 1, 0.36, 1), background 160ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    button svg { display: block; color: currentColor; }
    button:hover, button:active { opacity: 1; }
    button:focus-visible { opacity: 1; outline: 3px solid var(--aw-focus); outline-offset: 2px; }
    @media (prefers-color-scheme: dark) {
      :host {
        color-scheme: dark;
        --aw-control: oklch(0.235 0.045 274 / 0.97);
        --aw-line: oklch(0.48 0.06 274);
        --aw-ink: oklch(0.94 0.01 278);
        --aw-focus: oklch(0.72 0.2 282);
        --aw-shadow: 0 2px 8px oklch(0.05 0.008 274 / 0.34);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      button { transition-duration: 0.01ms; }
    }
    @media (forced-colors: active) {
      button { color: ButtonText; background: ButtonFace; border-color: ButtonText; }
    }
  `;

  const btn = ownerDocument.createElement('button');
  btn.type = 'button';
  btn.innerHTML = iconifySvg('lock', { size: 18 });
  const setAction = (action: FieldControlAction) => {
    if (action === 'generate') {
      btn.title = 'Generate a password with Authwell';
      btn.setAttribute(
        'aria-label',
        `Generate a password for ${getFieldAccessibleName(field)} with Authwell`
      );
    } else {
      btn.title = 'Autofill with Authwell';
      btn.setAttribute('aria-label', `Autofill ${getFieldAccessibleName(field)} with Authwell`);
    }
  };
  setAction(initialAction);

  shadow.appendChild(style);
  shadow.appendChild(btn);

  // Handle click on the shadow button
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });

  ownerDocument.body.appendChild(host);
  positionIcon();

  return {
    host,
    field,
    setAction,
    reposition: positionIcon,
    destroy: () => host.remove(),
  };
}

/**
 * Create an autofill suggestion dropdown using Shadow DOM.
 */
export function createSuggestionDropdown(
  anchorField: HTMLInputElement,
  items: Array<{ id: string; name: string; username: string; uris?: string[] }>,
  onSelect: (item: { id: string; name: string; username: string; uris?: string[] }) => void
): HTMLElement {
  const ownerDocument = anchorField.ownerDocument;
  removeExistingFloatingUi(ownerDocument);
  const host = ownerDocument.createElement('div');
  host.dataset.authwellUi = 'login-menu';

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
     <style>
       ${INJECTED_THEME_STYLES}
       ${INJECTED_BRAND_STYLES}
       .dropdown {
         max-height: min(360px, calc(100vh - 16px));
         overflow: auto;
         background: var(--aw-surface);
         border: 1px solid var(--aw-line);
         border-radius: 10px;
         box-shadow: var(--aw-shadow);
         font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         font-size: 13px;
       }
       .header {
         min-height: 34px;
         padding: 7px 12px;
         display: flex;
         align-items: center;
         background: var(--aw-bg-subtle);
         border-bottom: 1px solid var(--aw-line);
       }
       .header .lockbox-brand__logo { width: 84px; }
       .item {
         width: 100%;
         padding: 8px 12px;
         cursor: pointer;
         display: grid;
         grid-template-columns: 30px minmax(0, 1fr);
         align-items: center;
         gap: 9px;
         background: transparent;
         border: 0;
         color: var(--aw-text);
         border-bottom: 1px solid var(--aw-line);
         font: inherit;
         text-align: left;
       }
       .item:last-child { border-bottom: none; }
       .item:hover, .item:focus-visible { background: var(--aw-bg-subtle); }
       .item:focus-visible { outline: 3px solid var(--aw-primary); outline-offset: -3px; }
       .item-icon {
         width: 28px;
         height: 28px;
         position: relative;
         display: inline-flex;
         align-items: center;
         justify-content: center;
         color: var(--aw-primary);
         background: var(--aw-bg-subtle);
         border: 1px solid var(--aw-line);
         border-radius: 7px;
         overflow: hidden;
       }
       .item-icon img {
         position: absolute;
         inset: 0;
         width: 100%;
         height: 100%;
         object-fit: cover;
         border-radius: inherit;
         opacity: 0;
       }
       .item-icon[data-loaded="true"] img { opacity: 1; }
       .item-icon[data-loaded="true"] svg { visibility: hidden; }
       .item-copy { min-width: 0; display: grid; gap: 2px; }
       .item-name { font-weight: 500; color: var(--aw-text); }
       .item-name, .item-username { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
       .item-username { color: var(--aw-text-secondary); font-size: 12px; }
     </style>
    <div class="dropdown" role="menu" aria-label="Authwell saved logins">
      <div class="header">${lockboxBrandMarkup()}</div>
    </div>
  `;

  const dropdown = shadow.querySelector('.dropdown')!;
  for (const item of items) {
    const button = ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'item';
    button.setAttribute('role', 'menuitem');

    const name = ownerDocument.createElement('span');
    name.className = 'item-name';
    name.textContent = item.name;
    const username = ownerDocument.createElement('span');
    username.className = 'item-username';
    username.textContent = item.username;
    const icon = ownerDocument.createElement('span');
    icon.className = 'item-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = iconifySvg('world', { size: 16 });
    const siteIconUrls = getCachedSiteIconUrls(item.uris);
    if (siteIconUrls.length > 0) {
      const image = ownerDocument.createElement('img');
      image.alt = '';
      image.width = 28;
      image.height = 28;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      let candidateIndex = 0;
      image.src = siteIconUrls[candidateIndex];
      image.addEventListener('load', () => {
        recordSiteIconSuccess(siteIconUrls[candidateIndex]);
        icon.dataset.loaded = 'true';
      });
      image.addEventListener('error', () => {
        recordSiteIconFailure(siteIconUrls[candidateIndex]);
        delete icon.dataset.loaded;
        candidateIndex++;
        if (candidateIndex < siteIconUrls.length) image.src = siteIconUrls[candidateIndex];
        else image.remove();
      });
      icon.appendChild(image);
    }
    const copy = ownerDocument.createElement('span');
    copy.className = 'item-copy';
    copy.append(name, username);
    button.append(icon, copy);
    button.addEventListener('click', () => {
      onSelect(item);
      host.remove();
    });
    dropdown.appendChild(button);
  }

  ownerDocument.body.appendChild(host);
  positionFloatingHost(host, anchorField);
  installFloatingLifecycle(host, anchorField, shadow, '.item');

  return host;
}

export interface GeneratedPasswordSuggestion {
  id: string;
  label: string;
  description: string;
  password: string;
}

/** Show generated choices without exposing their plaintext in the page DOM. */
export function createGeneratedPasswordDropdown(
  anchorField: HTMLInputElement,
  items: GeneratedPasswordSuggestion[],
  onSelect: (item: GeneratedPasswordSuggestion) => void
): HTMLElement {
  const ownerDocument = anchorField.ownerDocument;
  removeExistingFloatingUi(ownerDocument);
  const host = ownerDocument.createElement('div');
  host.dataset.authwellUi = 'generation-menu';

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      ${INJECTED_THEME_STYLES}
      ${INJECTED_BRAND_STYLES}
      .dropdown {
        overflow: hidden;
        background: var(--aw-surface);
        border: 1px solid var(--aw-line);
        border-radius: 10px;
        box-shadow: var(--aw-shadow);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
      }
      .header {
        min-height: 34px;
        padding: 7px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        background: var(--aw-bg-subtle);
        border-bottom: 1px solid var(--aw-line);
      }
      .header .lockbox-brand__logo { width: 84px; }
      .header-copy { color: var(--aw-text-secondary); font-size: 12px; }
      .item {
        width: 100%;
        padding: 10px 12px;
        cursor: pointer;
        display: grid;
        grid-template-columns: 30px minmax(0, 1fr);
        align-items: center;
        gap: 9px;
        color: var(--aw-text);
        background: transparent;
        border: 0;
        border-bottom: 1px solid var(--aw-line);
        font: inherit;
        text-align: left;
      }
      .item:hover, .item:focus-visible { background: var(--aw-bg-subtle); }
      .item:focus-visible { outline: 3px solid var(--aw-primary); outline-offset: -3px; }
      .item-icon {
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--aw-primary);
        background: var(--aw-bg-subtle);
        border: 1px solid var(--aw-line);
        border-radius: 7px;
      }
      .item-copy { min-width: 0; display: grid; gap: 2px; }
      .item-label { color: var(--aw-text); font-weight: 600; }
      .item-description { color: var(--aw-text-secondary); font-size: 12px; }
      .note { margin: 0; padding: 9px 12px; color: var(--aw-text-secondary); font-size: 11px; }
    </style>
    <div class="dropdown" role="menu" aria-label="Authwell generated password choices">
      <div class="header">
        ${lockboxBrandMarkup()}
        <span class="header-copy">Create a password</span>
      </div>
      <div class="items"></div>
      <p class="note">Authwell fills both password fields and offers to save after signup.</p>
    </div>
  `;

  const container = shadow.querySelector<HTMLElement>('.items')!;
  for (const item of items) {
    const button = ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'item';
    button.dataset.generationChoice = item.id;
    button.setAttribute('role', 'menuitem');

    const icon = ownerDocument.createElement('span');
    icon.className = 'item-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = iconifySvg('key', { size: 16 });
    const copy = ownerDocument.createElement('span');
    copy.className = 'item-copy';
    const label = ownerDocument.createElement('span');
    label.className = 'item-label';
    label.textContent = item.label;
    const description = ownerDocument.createElement('span');
    description.className = 'item-description';
    description.textContent = item.description;
    copy.append(label, description);
    button.append(icon, copy);
    button.addEventListener('click', () => {
      onSelect(item);
      host.remove();
    });
    container.appendChild(button);
  }

  ownerDocument.body.appendChild(host);
  positionFloatingHost(host, anchorField, 280);
  installFloatingLifecycle(host, anchorField, shadow, '.item');
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
  const ownerDocument = anchorField.ownerDocument;
  removeExistingFloatingUi(ownerDocument);
  const host = ownerDocument.createElement('div');
  host.dataset.authwellUi = 'identity-menu';

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
     <style>
       ${INJECTED_THEME_STYLES}
       ${INJECTED_BRAND_STYLES}
       .dropdown {
         max-height: min(360px, calc(100vh - 16px));
         overflow: auto;
         background: var(--aw-surface);
         border: 1px solid var(--aw-line);
         border-radius: 10px;
         box-shadow: var(--aw-shadow);
         font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         font-size: 13px;
       }
       .header {
         min-height: 34px;
         padding: 7px 12px;
         display: flex;
         align-items: center;
         background: var(--aw-bg-subtle);
         border-bottom: 1px solid var(--aw-line);
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
         color: var(--aw-text);
         border-bottom: 1px solid var(--aw-line);
         font: inherit;
         text-align: left;
       }
       .item:last-child { border-bottom: none; }
       .item:hover, .item:focus-visible { background: var(--aw-bg-subtle); }
       .item:focus-visible { outline: 3px solid var(--aw-primary); outline-offset: -3px; }
       .item-name { font-weight: 500; color: var(--aw-text); }
       .item-detail { color: var(--aw-text-secondary); font-size: 12px; }
     </style>
     <div class="dropdown" role="menu" aria-label="Authwell identities">
       <div class="header">${lockboxBrandMarkup()}</div>
    </div>
  `;

  const dropdown = shadow.querySelector('.dropdown')!;
  for (const item of items) {
    const button = ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'item';
    button.setAttribute('role', 'menuitem');

    const name = ownerDocument.createElement('span');
    name.className = 'item-name';
    name.textContent = item.name;
    const detail = ownerDocument.createElement('span');
    detail.className = 'item-detail';
    detail.textContent = item.detail;
    button.append(name, detail);
    button.addEventListener('click', () => {
      onSelect(item);
      host.remove();
    });
    dropdown.appendChild(button);
  }

  ownerDocument.body.appendChild(host);
  positionFloatingHost(host, anchorField);
  installFloatingLifecycle(host, anchorField, shadow, '.item');

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
  const ownerDocument = anchorField.ownerDocument;
  removeExistingFloatingUi(ownerDocument);

  const host = ownerDocument.createElement('div');
  host.id = 'lockbox-status-dropdown';
  host.dataset.authwellUi = 'status-menu';

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
    locked: 'Unlock Authwell to autofill this form.',
    'no-matches': 'No saved credentials match this site.',
    error: 'Could not connect to Authwell.',
  };

  const icon = iconMap[type];
  const title = titleMap[type];
  const desc = descMap[type];

  const style = ownerDocument.createElement('style');
  style.textContent = `
     ${INJECTED_THEME_STYLES}
     ${INJECTED_BRAND_STYLES}
     .dropdown {
       background: var(--aw-surface);
       border: 1px solid var(--aw-line);
       border-radius: 10px;
       box-shadow: var(--aw-shadow);
       overflow: hidden;
       font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
       font-size: 13px;
     }
     .header {
       min-height: 34px;
       padding: 7px 12px;
       display: flex;
       align-items: center;
       background: var(--aw-bg-subtle);
       border-bottom: 1px solid var(--aw-line);
     }
     .header .lockbox-brand__logo { width: 84px; }
     .body {
       padding: 12px;
       display: flex;
       align-items: flex-start;
       gap: 10px;
     }
     .icon { color: var(--aw-primary); font-size: 20px; line-height: 1; flex-shrink: 0; }
     .text { flex: 1; min-width: 0; }
     .title { font-weight: 600; color: var(--aw-text); margin-bottom: 2px; }
     .desc { color: var(--aw-text-secondary); font-size: 12px; line-height: 1.4; }
     .actions {
       padding: 8px 12px;
       border-top: 1px solid var(--aw-line);
       display: flex;
       gap: 8px;
       justify-content: flex-end;
     }
     .btn {
       min-height: 36px;
       padding: 7px 12px;
       border-radius: 10px;
       font-size: 12px;
       font-weight: 500;
       cursor: pointer;
       border: 1px solid var(--aw-line);
       background: var(--aw-surface);
       color: var(--aw-text-secondary);
       transition: background 160ms cubic-bezier(0.22, 1, 0.36, 1);
     }
     .btn:hover { background: var(--aw-bg-subtle); }
     .btn:focus-visible { outline: 3px solid var(--aw-primary); outline-offset: 2px; }
     .btn-primary {
       background: var(--aw-primary);
       color: var(--aw-primary-fg);
       border-color: var(--aw-primary);
     }
     .btn-primary:hover { background: var(--aw-primary-hover); }
     @media (pointer: coarse) { .btn { min-height: 44px; } }
     @media (prefers-reduced-motion: reduce) { .btn { transition-duration: 0.01ms; } }
   `;

  const dropdown = ownerDocument.createElement('div');
  dropdown.className = 'dropdown';
  dropdown.setAttribute('role', actions.length > 0 ? 'dialog' : 'status');
  dropdown.setAttribute('aria-label', title);
  if (actions.length === 0) dropdown.setAttribute('aria-live', 'polite');

  const headerEl = ownerDocument.createElement('div');
  headerEl.className = 'header';
  headerEl.innerHTML = lockboxBrandMarkup();
  dropdown.appendChild(headerEl);

  const bodyEl = ownerDocument.createElement('div');
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
    const actionsEl = ownerDocument.createElement('div');
    actionsEl.className = 'actions';

    actions.forEach((action, i) => {
      const btn = ownerDocument.createElement('button');
      btn.type = 'button';
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
  ownerDocument.body.appendChild(host);
  positionFloatingHost(host, anchorField);
  installFloatingLifecycle(host, anchorField, shadow, '.btn');

  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    if (host.parentElement) host.remove();
  }, 10_000);

  return host;
}
