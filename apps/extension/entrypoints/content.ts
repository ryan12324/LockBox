/**
 * Content script for Lockbox extension.
 * Detects login forms and provides autofill functionality.
 *
 * Uses Shadow DOM for all injected UI to avoid CSS conflicts.
 * Proxies crypto operations through the background service worker.
 */

import { detectForms, urlMatchesUri } from '../lib/form-detector.js';
import { fillForm, createLockIconOverlay, createSuggestionDropdown } from '../lib/autofill.js';
import type { VaultItem, LoginItem } from '@lockbox/types';

// Track injected overlays to avoid duplicates
const injectedFields = new WeakSet<HTMLInputElement>();

/** Send a message to the background service worker. */
async function sendMessage<T>(message: object): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

/** Get vault items matching the current page URL. */
async function getMatchingItems(): Promise<VaultItem[]> {
  const result = await sendMessage<{ items: VaultItem[] }>({
    type: 'get-matches',
    url: window.location.href,
  });
  return result.items ?? [];
}

/** Handle autofill for a detected form. */
async function handleAutofill(
  passwordField: HTMLInputElement,
  usernameField: HTMLInputElement | null,
): Promise<void> {
  const items = await getMatchingItems();

  if (items.length === 0) {
    // No matches — show a "no matches" tooltip briefly
    return;
  }

  const loginItems = items.filter((i): i is LoginItem => i.type === 'login');

  if (loginItems.length === 1) {
    // Single match — fill immediately
    fillForm(
      { formElement: null, usernameField, passwordField, submitButton: null },
      loginItems[0].username,
      loginItems[0].password,
    );
  } else {
    // Multiple matches — show dropdown
    createSuggestionDropdown(
      passwordField,
      loginItems.map((i) => ({ id: i.id, name: i.name, username: i.username })),
      (selected) => {
        const item = loginItems.find((i) => i.id === selected.id);
        if (item) {
          fillForm(
            { formElement: null, usernameField, passwordField, submitButton: null },
            item.username,
            item.password,
          );
        }
      },
    );
  }
}

/** Inject lock icon overlays into detected password fields. */
function injectOverlays(): void {
  const forms = detectForms(document);

  for (const form of forms) {
    const { passwordField, usernameField } = form;

    if (injectedFields.has(passwordField)) continue;
    injectedFields.add(passwordField);

    createLockIconOverlay(passwordField, () => {
      handleAutofill(passwordField, usernameField).catch(console.error);
    });
  }
}

/** WXT content script export. */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    // Initial scan
    injectOverlays();

    // Watch for dynamically added forms (SPA navigation)
    const observer = new MutationObserver(() => {
      injectOverlays();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Track user activity for auto-lock
    const activityEvents = ['click', 'keydown', 'mousemove'];
    let activityThrottle: ReturnType<typeof setTimeout> | null = null;

    const reportActivity = () => {
      if (activityThrottle) return;
      activityThrottle = setTimeout(() => {
        activityThrottle = null;
        chrome.runtime.sendMessage({ type: 'activity' }).catch(() => {});
      }, 5000);
    };

    activityEvents.forEach((event) => {
      document.addEventListener(event, reportActivity, { passive: true });
    });
  },
});
