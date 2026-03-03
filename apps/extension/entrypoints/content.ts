/**
 * Content script for Lockbox extension.
 * Detects login forms and identity forms, provides autofill functionality,
 * and monitors form submissions for save/update prompts.
 *
 * Uses Shadow DOM for all injected UI to avoid CSS conflicts.
 * Proxies crypto operations through the background service worker.
 */

import { detectForms, detectIdentityForms } from '../lib/form-detector.js';
import {
  fillForm,
  fillIdentityForm,
  createLockIconOverlay,
  createSuggestionDropdown,
  createIdentitySuggestionDropdown,
  createStatusDropdown,
} from '../lib/autofill.js';
import { initSaveDetector } from '../lib/save-detector.js';
import type { VaultItem, LoginItem, IdentityItem } from '@lockbox/types';

// Track injected overlays to avoid duplicates
const injectedFields = new WeakSet<HTMLInputElement>();

/** Send a message to the background service worker. */
async function sendMessage<T>(message: object): Promise<T> {
  if (!chrome.runtime?.id) throw new Error('Extension context invalidated');
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

/** Check whether the vault is currently unlocked. */
async function isVaultUnlocked(): Promise<boolean> {
  try {
    const result = await sendMessage<{ unlocked: boolean }>({ type: 'is-unlocked' });
    return result.unlocked;
  } catch {
    return false;
  }
}

/** Open the extension popup (best-effort — chrome.action.openPopup is not always available). */
function openExtensionPopup(): void {
  // Content scripts cannot open the popup directly, but we can send a message
  // to the background to open the popup via chrome.action.openPopup().
  // As a fallback on browsers that don't support it, we do nothing — the user
  // can click the toolbar icon.
  sendMessage({ type: 'open-popup' }).catch(() => {});
}

/** Get vault items matching the current page URL. */
async function getMatchingItems(): Promise<VaultItem[]> {
  const result = await sendMessage<{ items: VaultItem[] }>({
    type: 'get-matches',
    url: window.location.href,
  });
  return result.items ?? [];
}

/** Get all identity items from the vault. */
async function getIdentityItems(): Promise<IdentityItem[]> {
  const result = await sendMessage<{ items: VaultItem[]; locked: boolean }>({
    type: 'get-vault',
  });
  if (result.locked) return [];
  return (result.items ?? []).filter((i): i is IdentityItem => i.type === 'identity');
}

/** Handle autofill for a detected form. */
async function handleAutofill(
  passwordField: HTMLInputElement,
  usernameField: HTMLInputElement | null
): Promise<void> {
  // 1. Check if vault is unlocked
  const unlocked = await isVaultUnlocked();
  if (!unlocked) {
    createStatusDropdown(passwordField, 'locked', [
      { label: 'Open Lockbox', onClick: () => openExtensionPopup() },
    ]);
    return;
  }

  // 2. Get matching items
  let items: VaultItem[];
  try {
    items = await getMatchingItems();
  } catch {
    createStatusDropdown(passwordField, 'error', [
      {
        label: 'Retry',
        onClick: () => {
          handleAutofill(passwordField, usernameField).catch(() => {});
        },
      },
    ]);
    return;
  }

  // 3. No matches — show status dropdown
  if (items.length === 0) {
    createStatusDropdown(passwordField, 'no-matches', [
      { label: 'Open Lockbox', onClick: () => openExtensionPopup() },
    ]);
    return;
  }

  // 4. Filter to login items
  const loginItems = items.filter((i): i is LoginItem => i.type === 'login');

  if (loginItems.length === 0) {
    createStatusDropdown(passwordField, 'no-matches', [
      { label: 'Open Lockbox', onClick: () => openExtensionPopup() },
    ]);
    return;
  }

  let filledItem: LoginItem | null = null;

  if (loginItems.length === 1) {
    // Single match — fill immediately
    fillForm(
      { formElement: null, usernameField, passwordField, submitButton: null },
      loginItems[0].username,
      loginItems[0].password
    );
    filledItem = loginItems[0];
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
            item.password
          );
          // Check 2FA after dropdown selection
          checkTwoFaAfterAutofill(item).catch(() => {});
        }
      }
    );
  }

  // After single-match autofill, check 2FA support
  if (filledItem) {
    checkTwoFaAfterAutofill(filledItem).catch(() => {});
  }
}

/** Handle autofill for a detected identity form. */
async function handleIdentityAutofill(
  identityForm: import('../lib/form-detector.js').DetectedIdentityForm
): Promise<void> {
  const firstField = Object.values(identityForm.fields)[0];
  if (!firstField) return;

  // Check if vault is unlocked
  const unlocked = await isVaultUnlocked();
  if (!unlocked) {
    createStatusDropdown(firstField, 'locked', [
      { label: 'Open Lockbox', onClick: () => openExtensionPopup() },
    ]);
    return;
  }

  let identityItems: IdentityItem[];
  try {
    identityItems = await getIdentityItems();
  } catch {
    createStatusDropdown(firstField, 'error', [
      {
        label: 'Retry',
        onClick: () => {
          handleIdentityAutofill(identityForm).catch(() => {});
        },
      },
    ]);
    return;
  }

  if (identityItems.length === 0) {
    createStatusDropdown(firstField, 'no-matches', [
      { label: 'Open Lockbox', onClick: () => openExtensionPopup() },
    ]);
    return;
  }

  if (identityItems.length === 1) {
    // Single identity — fill immediately
    fillIdentityForm(identityForm, identityItems[0]);
  } else {
    // Multiple identities — show dropdown
    createIdentitySuggestionDropdown(
      firstField,
      identityItems.map((i) => ({
        id: i.id,
        name: i.name,
        detail: [i.firstName, i.lastName].filter(Boolean).join(' ') || i.email || '',
      })),
      (selected) => {
        const item = identityItems.find((i) => i.id === selected.id);
        if (item) {
          fillIdentityForm(identityForm, item);
        }
      }
    );
  }
}

/** Check if site supports 2FA after autofill and inject badge if needed. */
async function checkTwoFaAfterAutofill(filledItem: LoginItem): Promise<void> {
  // If the item already has TOTP configured, no need to nag
  if (filledItem.totp) return;

  try {
    const hostname = new URL(window.location.href).hostname.replace(/^www\./, '');
    const result = await sendMessage<{
      success: boolean;
      supports2fa?: boolean;
      methods?: string[];
      documentation?: string;
      siteName?: string;
    }>({ type: 'check-2fa', domain: hostname });

    if (result.success && result.supports2fa) {
      inject2faBadge(result.methods ?? [], result.documentation, result.siteName);
    }
  } catch {
    // Silently ignore failures
  }
}

/** Inject a 2FA recommendation badge using Shadow DOM. */
function inject2faBadge(methods: string[], documentation?: string, siteName?: string): void {
  // Prevent duplicate badges
  if (document.getElementById('lockbox-2fa-badge')) return;

  const host = document.createElement('div');
  host.id = 'lockbox-2fa-badge';
  host.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;';

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    .badge {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 16px;
      background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
      color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      border-radius: 10px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      max-width: 340px;
    }
    .icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
    .text { flex: 1; min-width: 0; }
    .title { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
    .desc { font-size: 12px; opacity: 0.85; }
    .methods { font-size: 11px; opacity: 0.7; margin-top: 4px; }
    .link {
      color: #c7d2fe;
      text-decoration: underline;
      font-size: 11px;
      margin-top: 4px;
      display: inline-block;
      cursor: pointer;
    }
    .link:hover { color: #fff; }
    .dismiss {
      background: none;
      border: none;
      color: rgba(255,255,255,0.5);
      cursor: pointer;
      font-size: 14px;
      padding: 0;
      line-height: 1;
      flex-shrink: 0;
    }
    .dismiss:hover { color: #fff; }
  `;

  const badge = document.createElement('div');
  badge.className = 'badge';

  const siteLabel = siteName ?? 'This site';
  const methodsText = methods.length > 0 ? methods.join(', ') : '';

  badge.innerHTML = `
    <span class="icon">⚠️</span>
    <div class="text">
      <div class="title">${siteLabel} supports 2FA</div>
      <div class="desc">Enable it for better security</div>
      ${methodsText ? `<div class="methods">Methods: ${methodsText}</div>` : ''}
    </div>
  `;

  if (documentation) {
    const link = document.createElement('a');
    link.className = 'link';
    link.textContent = '2FA setup guide →';
    link.href = documentation;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    badge.querySelector('.text')?.appendChild(link);
  }

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'dismiss';
  dismissBtn.textContent = '✕';
  dismissBtn.addEventListener('click', () => host.remove());
  badge.appendChild(dismissBtn);

  shadow.appendChild(style);
  shadow.appendChild(badge);
  document.body.appendChild(host);

  // Auto-dismiss after 15 seconds
  setTimeout(() => {
    if (host.parentElement) host.remove();
  }, 15_000);
}

/** Inject lock icon overlays into detected password fields and identity fields. */
function injectOverlays(): void {
  // Login forms
  const forms = detectForms(document);

  for (const form of forms) {
    const { passwordField, usernameField } = form;

    // Inject lock icon on the password field
    if (!injectedFields.has(passwordField)) {
      injectedFields.add(passwordField);
      createLockIconOverlay(passwordField, () => {
        handleAutofill(passwordField, usernameField).catch(console.error);
      });
    }

    // Also inject lock icon on the username field so clicking it triggers autofill too
    if (usernameField && !injectedFields.has(usernameField)) {
      injectedFields.add(usernameField);
      createLockIconOverlay(usernameField, () => {
        handleAutofill(passwordField, usernameField).catch(console.error);
      });
    }
  }

  // Identity forms
  const identityForms = detectIdentityForms(document);

  for (const identityForm of identityForms) {
    // Find the first identity field to anchor the lock icon
    const firstField = Object.values(identityForm.fields)[0];
    if (!firstField || injectedFields.has(firstField)) continue;
    injectedFields.add(firstField);

    createLockIconOverlay(firstField, () => {
      handleIdentityAutofill(identityForm).catch(console.error);
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

/**
 * Show a Shadow DOM passkey picker when multiple passkeys match a WebAuthn request.
 * Returns the selected passkey or null if the user dismisses.
 */
function showPasskeyPicker(
  passkeys: Array<{
    credentialId: string;
    userName: string;
    userDisplayName: string;
    rpName: string;
  }>
): Promise<{ credentialId: string } | null> {
  if (!chrome.runtime?.id) return Promise.resolve(null);
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;`;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        .overlay { position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
        .modal { background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.25);max-width:380px;width:90%;overflow:hidden; }
        .modal-header { padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px; }
        .modal-header svg { width:20px;height:20px;color:#6366f1;flex-shrink:0; }
        .modal-title { font-size:15px;font-weight:600;color:#1e293b; }
        .modal-subtitle { font-size:12px;color:#64748b;margin-top:2px; }
        .passkey-list { max-height:240px;overflow-y:auto; }
        .passkey-item { padding:12px 20px;cursor:pointer;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:12px;transition:background 0.1s; }
        .passkey-item:last-child { border-bottom:none; }
        .passkey-item:hover { background:#f0f9ff; }
        .passkey-icon { width:32px;height:32px;border-radius:8px;background:#eef2ff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px; }
        .passkey-info { min-width:0; }
        .passkey-name { font-size:14px;font-weight:500;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
        .passkey-detail { font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
        .cancel-btn { width:100%;padding:12px;border:none;background:#f8fafc;color:#64748b;font-size:13px;cursor:pointer;border-top:1px solid #e2e8f0; }
        .cancel-btn:hover { background:#f1f5f9;color:#475569; }
      </style>
      <div class="overlay">
        <div class="modal">
          <div class="modal-header">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7A5 5 0 0 1 7 7h2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            <div>
              <div class="modal-title">Choose a passkey</div>
              <div class="modal-subtitle">Sign in to ${passkeys[0]?.rpName || 'this site'}</div>
            </div>
          </div>
          <div class="passkey-list"></div>
          <button class="cancel-btn">Cancel</button>
        </div>
      </div>
    `;

    const listEl = shadow.querySelector('.passkey-list')!;
    for (const pk of passkeys) {
      const item = document.createElement('div');
      item.className = 'passkey-item';
      item.innerHTML = `
        <div class="passkey-icon">🔑</div>
        <div class="passkey-info">
          <div class="passkey-name">${pk.userDisplayName || pk.userName}</div>
          <div class="passkey-detail">${pk.userName}</div>
        </div>
      `;
      item.addEventListener('click', () => {
        host.remove();
        resolve({ credentialId: pk.credentialId });
      });
      listEl.appendChild(item);
    }

    shadow.querySelector('.cancel-btn')!.addEventListener('click', () => {
      host.remove();
      resolve(null);
    });

    shadow.querySelector('.overlay')!.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        host.remove();
        resolve(null);
      }
    });

    document.documentElement.appendChild(host);
  });
}

/** WXT content script export. */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',

  main(ctx) {
    // ─── DOM-dependent features (deferred until DOM is ready) ─────────────────
    function initDomFeatures() {
      // Initial scan for login + identity forms
      injectOverlays();
      // Initialize save-on-submit detection
      initSaveDetector(ctx.signal);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initDomFeatures, { signal: ctx.signal });
    } else {
      initDomFeatures();
    }

    // Listen for WebAuthn messages from the injected page script
    window.addEventListener(
      'message',
      async (event: MessageEvent) => {
        if (event.source !== window) return;
        if (!event.data || typeof event.data.type !== 'string') return;

        if (event.data.type === 'lockbox-webauthn-create') {
          try {
            const result = await sendMessage<{
              credential?: object;
              error?: string;
              fallback?: boolean;
            }>({
              type: 'WEBAUTHN_CREATE',
              requestId: event.data.requestId,
              origin: event.data.origin,
              options: event.data.options,
            });
            window.postMessage(
              {
                type: 'lockbox-webauthn-response',
                requestId: event.data.requestId,
                ...result,
              },
              '*'
            );
          } catch {
            window.postMessage(
              {
                type: 'lockbox-webauthn-response',
                requestId: event.data.requestId,
                fallback: true,
              },
              '*'
            );
          }
        }

        if (event.data.type === 'lockbox-webauthn-get') {
          try {
            const result = await sendMessage<{
              credential?: object;
              error?: string;
              fallback?: boolean;
              selectPasskey?: boolean;
              matches?: Array<{
                credentialId: string;
                userName: string;
                userDisplayName: string;
                rpName: string;
              }>;
              _context?: { rpId: string; origin: string; challenge: string };
            }>({
              type: 'WEBAUTHN_GET',
              requestId: event.data.requestId,
              origin: event.data.origin,
              options: event.data.options,
            });

            // If multiple passkeys match, show a picker for the user to select
            if (result.selectPasskey && result.matches && result._context) {
              const selected = await showPasskeyPicker(result.matches);
              if (!selected) {
                window.postMessage(
                  {
                    type: 'lockbox-webauthn-response',
                    requestId: event.data.requestId,
                    fallback: true,
                  },
                  '*'
                );
                return;
              }
              // Sign with the selected passkey
              const signResult = await sendMessage<{
                credential?: object;
                fallback?: boolean;
              }>({
                type: 'WEBAUTHN_GET_SELECTED',
                credentialId: selected.credentialId,
                rpId: result._context.rpId,
                challenge: result._context.challenge,
                origin: result._context.origin,
              });
              window.postMessage(
                {
                  type: 'lockbox-webauthn-response',
                  requestId: event.data.requestId,
                  ...signResult,
                },
                '*'
              );
              return;
            }

            window.postMessage(
              {
                type: 'lockbox-webauthn-response',
                requestId: event.data.requestId,
                ...result,
              },
              '*'
            );
          } catch {
            window.postMessage(
              {
                type: 'lockbox-webauthn-response',
                requestId: event.data.requestId,
                fallback: true,
              },
              '*'
            );
          }
        }
      },
      { signal: ctx.signal }
    );

    // Listen for phishing warnings from background
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'phishing-warning') {
        injectPhishingWarning(message);
      } else if (message.type === 'get-password-field-metadata') {
        // Extract metadata from the first password field on the page
        const pwField = document.querySelector('input[type="password"]') as HTMLInputElement | null;
        if (pwField) {
          // Gather nearby text (labels, descriptions) for rule detection
          const label =
            pwField.closest('label')?.textContent?.trim() ??
            document.querySelector(`label[for="${pwField.id}"]`)?.textContent?.trim() ??
            '';
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
      if (!chrome.runtime?.id) {
        observer.disconnect();
        return;
      }
      injectOverlays();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
    ctx.onInvalidated(() => observer.disconnect());

    // Track user activity for auto-lock
    const activityEvents = ['click', 'keydown', 'mousemove'];
    let activityThrottle: ReturnType<typeof setTimeout> | null = null;

    const reportActivity = () => {
      if (activityThrottle) return;
      activityThrottle = setTimeout(() => {
        activityThrottle = null;
        if (!chrome.runtime?.id) return;
        chrome.runtime.sendMessage({ type: 'activity' }).catch(() => {});
      }, 5000);
    };

    activityEvents.forEach((event) => {
      document.addEventListener(event, reportActivity, { passive: true, signal: ctx.signal });
    });
    ctx.onInvalidated(() => {
      if (activityThrottle) clearTimeout(activityThrottle);
    });
  },
});
