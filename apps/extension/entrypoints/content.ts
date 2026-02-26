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

/** Inject a phishing warning banner using Shadow DOM. */
function injectPhishingWarning(message: { url: string; score: number; reasons: string[] }): void {
  // Prevent duplicate banners
  if (document.getElementById('lockbox-phishing-warning')) return;

  const host = document.createElement('div');
  host.id = 'lockbox-phishing-warning';
  host.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;';

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    .banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
      color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      box-shadow: 0 2px 12px rgba(0,0,0,0.3);
    }
    .info {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 0;
    }
    .icon { font-size: 18px; flex-shrink: 0; }
    .text strong { display: block; margin-bottom: 2px; font-size: 14px; }
    .text span { opacity: 0.9; font-size: 12px; }
    .dismiss {
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      color: #fff;
      padding: 6px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      flex-shrink: 0;
      margin-left: 12px;
    }
    .dismiss:hover { background: rgba(255,255,255,0.3); }
  `;

  const banner = document.createElement('div');
  banner.className = 'banner';

  const reasonText = message.reasons.length > 0 ? message.reasons[0] : 'Suspicious URL detected';
  const scorePercent = Math.round(message.score * 100);

  banner.innerHTML = `
    <div class="info">
      <span class="icon">⚠️</span>
      <div class="text">
        <strong>Lockbox: Potential phishing site (${scorePercent}% risk)</strong>
        <span>${reasonText}</span>
      </div>
    </div>
  `;

  const btn = document.createElement('button');
  btn.className = 'dismiss';
  btn.textContent = 'Dismiss';
  btn.addEventListener('click', () => host.remove());
  banner.appendChild(btn);

  shadow.appendChild(style);
  shadow.appendChild(banner);
  document.body.prepend(host);
}


/** WXT content script export. */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    // Initial scan
    injectOverlays();

    // Listen for phishing warnings from background
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'phishing-warning') {
        injectPhishingWarning(message);
      } else if (message.type === 'get-password-field-metadata') {
        // Extract metadata from the first password field on the page
        const pwField = document.querySelector('input[type="password"]') as HTMLInputElement | null;
        if (pwField) {
          // Gather nearby text (labels, descriptions) for rule detection
          const label = pwField.closest('label')?.textContent?.trim()
            ?? document.querySelector(`label[for="${pwField.id}"]`)?.textContent?.trim()
            ?? '';
          const describedBy = pwField.getAttribute('aria-describedby');
          let ariaDesc = '';
          if (describedBy) {
            const descEl = document.getElementById(describedBy);
            if (descEl) ariaDesc = descEl.textContent?.trim() ?? '';
          }
          // Look for nearby requirement text (sibling/parent elements)
          const parent = pwField.closest('div, fieldset, form');
          const nearbyText = parent?.textContent?.slice(0, 500)?.trim() ?? '';
          sendResponse({
            minLength: pwField.minLength > 0 ? pwField.minLength : undefined,
            maxLength: pwField.maxLength > 0 ? pwField.maxLength : undefined,
            pattern: pwField.pattern || undefined,
            title: pwField.title || undefined,
            ariaDescription: ariaDesc || undefined,
            nearbyText: `${label} ${nearbyText}`.trim() || undefined,
          });
        } else {
          sendResponse(null);
        }
        return true; // async response
      }
    });

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
