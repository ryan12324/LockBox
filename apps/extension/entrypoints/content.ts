/**
 * Content script for Lockbox extension.
 * Detects login forms and identity forms, provides autofill functionality,
 * and monitors form submissions for save/update prompts.
 *
 * Uses Shadow DOM for all injected UI to avoid CSS conflicts.
 * Proxies crypto operations through the background service worker.
 */

import { detectForms, detectIdentityForms, detectOtpFields } from '../lib/form-detector.js';
import {
  fillForm,
  fillIdentityForm,
  simulateFill,
  createLockIconOverlay,
  createSuggestionDropdown,
  createIdentitySuggestionDropdown,
  createStatusDropdown,
} from '../lib/autofill.js';
import { initSaveDetector } from '../lib/save-detector.js';
import {
  showCreateConsent,
  showGetConsent,
  showPasskeyPicker,
  showVaultLockedToast,
  showUnlockPrompt,
} from '../lib/webauthn-ui.js';
import type { VaultItem, LoginItem, IdentityItem } from '@lockbox/types';
import { iconifySvg } from '../lib/iconify.js';
import { createLockboxBrand, INJECTED_BRAND_STYLES } from '../lib/injected-brand.js';

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
  const result = await sendMessage<{ items: VaultItem[]; error?: string }>({
    type: 'get-matches',
    url: window.location.href,
  });
  if (result.error) throw new Error(result.error);
  return result.items ?? [];
}

/** Get all identity items from the vault. */
async function getIdentityItems(): Promise<IdentityItem[]> {
  const result = await sendMessage<{ items: VaultItem[]; locked: boolean; error?: string }>({
    type: 'get-vault',
  });
  if (result.locked) return [];
  if (result.error) throw new Error(result.error);
  return (result.items ?? []).filter((i): i is IdentityItem => i.type === 'identity');
}

async function refreshItemForUse(itemId: string, expectedType: 'login'): Promise<LoginItem>;
async function refreshItemForUse(itemId: string, expectedType: 'identity'): Promise<IdentityItem>;
async function refreshItemForUse(
  itemId: string,
  expectedType: 'login' | 'identity'
): Promise<LoginItem | IdentityItem> {
  const result = await sendMessage<{
    success: boolean;
    item?: VaultItem;
    error?: string;
  }>({ type: 'refresh-item', itemId });
  if (!result.success || !result.item) {
    throw new Error(result.error || 'Could not refresh this item.');
  }
  if (result.item.type !== expectedType) {
    throw new Error(`This item is no longer a ${expectedType}.`);
  }
  return result.item as LoginItem | IdentityItem;
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
      { label: 'Open Authwell', onClick: () => openExtensionPopup() },
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
      { label: 'Open Authwell', onClick: () => openExtensionPopup() },
    ]);
    return;
  }

  // 4. Filter to login items
  const loginItems = items.filter((i): i is LoginItem => i.type === 'login');

  if (loginItems.length === 0) {
    createStatusDropdown(passwordField, 'no-matches', [
      { label: 'Open Authwell', onClick: () => openExtensionPopup() },
    ]);
    return;
  }

  let filledItem: LoginItem | null = null;

  if (loginItems.length === 1) {
    // Single match — fill immediately
    try {
      const freshItem = await refreshItemForUse(loginItems[0].id, 'login');
      fillForm(
        { formElement: null, usernameField, passwordField, submitButton: null },
        freshItem.username,
        freshItem.password
      );
      filledItem = freshItem;
    } catch {
      createStatusDropdown(passwordField, 'error', [
        { label: 'Retry', onClick: () => void handleAutofill(passwordField, usernameField) },
      ]);
      return;
    }
  } else {
    // Multiple matches — show dropdown
    createSuggestionDropdown(
      passwordField,
      loginItems.map((i) => ({
        id: i.id,
        name: i.name,
        username: i.username,
        uris: i.uris,
      })),
      (selected) => {
        const item = loginItems.find((i) => i.id === selected.id);
        if (item) {
          void (async () => {
            try {
              const freshItem = await refreshItemForUse(item.id, 'login');
              fillForm(
                { formElement: null, usernameField, passwordField, submitButton: null },
                freshItem.username,
                freshItem.password
              );
              checkTwoFaAfterAutofill(freshItem).catch(() => {});
            } catch {
              createStatusDropdown(passwordField, 'error', [
                {
                  label: 'Retry',
                  onClick: () => void handleAutofill(passwordField, usernameField),
                },
              ]);
            }
          })();
        }
      }
    );
  }

  // After single-match autofill, check 2FA support
  if (filledItem) {
    checkTwoFaAfterAutofill(filledItem).catch(() => {});
  }
}

type TotpGenerationResult = {
  code: string | null;
  remaining: number;
  error?: string;
};

async function fillTotp(field: HTMLInputElement, item: LoginItem): Promise<void> {
  const result = await sendMessage<TotpGenerationResult>({
    type: 'get-item-totp',
    itemId: item.id,
  });
  if (!result.code) {
    createStatusDropdown(field, 'error', [
      { label: 'Edit in Authwell', onClick: () => openExtensionPopup() },
    ]);
    return;
  }
  simulateFill(field, result.code);
}

/** Fill a standalone second-factor field from logins matching this site. */
async function handleTotpAutofill(field: HTMLInputElement): Promise<void> {
  if (!(await isVaultUnlocked())) {
    createStatusDropdown(field, 'locked', [
      { label: 'Open Authwell', onClick: () => openExtensionPopup() },
    ]);
    return;
  }

  let items: LoginItem[];
  try {
    items = (await getMatchingItems()).filter(
      (item): item is LoginItem => item.type === 'login' && Boolean((item as LoginItem).totp)
    );
  } catch {
    createStatusDropdown(field, 'error', [
      { label: 'Retry', onClick: () => void handleTotpAutofill(field) },
    ]);
    return;
  }

  if (items.length === 0) {
    createStatusDropdown(field, 'no-matches', [
      { label: 'Open Authwell', onClick: () => openExtensionPopup() },
    ]);
    return;
  }

  if (items.length === 1) {
    await fillTotp(field, items[0]);
    return;
  }

  createSuggestionDropdown(
    field,
    items.map((item) => ({
      id: item.id,
      name: item.name,
      username: item.username,
      uris: item.uris,
    })),
    (selected) => {
      const item = items.find((candidate) => candidate.id === selected.id);
      if (item) void fillTotp(field, item);
    }
  );
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
      { label: 'Open Authwell', onClick: () => openExtensionPopup() },
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
      { label: 'Open Authwell', onClick: () => openExtensionPopup() },
    ]);
    return;
  }

  if (identityItems.length === 1) {
    // Single identity — fill immediately
    try {
      fillIdentityForm(identityForm, await refreshItemForUse(identityItems[0].id, 'identity'));
    } catch {
      createStatusDropdown(firstField, 'error', [
        { label: 'Retry', onClick: () => void handleIdentityAutofill(identityForm) },
      ]);
    }
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
          void refreshItemForUse(item.id, 'identity')
            .then((freshItem) => fillIdentityForm(identityForm, freshItem))
            .catch(() => {
              createStatusDropdown(firstField, 'error', [
                { label: 'Retry', onClick: () => void handleIdentityAutofill(identityForm) },
              ]);
            });
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
     ${INJECTED_BRAND_STYLES}
     .badge {
       display: flex;
       align-items: flex-start;
       gap: 10px;
       padding: 12px 16px;
       background: #5C4A3C;
       color: #fff;
       font-family: system-ui, -apple-system, sans-serif;
       font-size: 13px;
       line-height: 1.4;
       border-radius: 20px;
       box-shadow: 0 4px 16px rgba(0,0,0,0.3);
       max-width: 340px;
     }
     .icon { display: flex; flex-shrink: 0; margin-top: 1px; }
     .text { flex: 1; min-width: 0; }
     .lockbox-brand {
       width: max-content;
       margin-bottom: 8px;
       padding: 4px 6px;
       background: #F7F8FC;
       border-radius: 8px;
     }
     .lockbox-brand__logo { width: 82px; }
     .title { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
     .desc { font-size: 12px; opacity: 0.85; }
     .methods { font-size: 11px; opacity: 0.7; margin-top: 4px; }
     .link {
       color: #C4A882;
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
     .dismiss:focus-visible, .link:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
   `;

  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.setAttribute('role', 'status');
  badge.setAttribute('aria-live', 'polite');

  const siteLabel = siteName ?? 'This site';
  const methodsText = methods.length > 0 ? methods.join(', ') : '';

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = iconifySvg('shield-check', { size: 18 });

  const text = document.createElement('div');
  text.className = 'text';
  const brand = createLockboxBrand();
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = `${siteLabel} supports 2FA`;
  const description = document.createElement('div');
  description.className = 'desc';
  description.textContent = 'Enable it for better security';
  text.append(brand, title, description);
  if (methodsText) {
    const methodsEl = document.createElement('div');
    methodsEl.className = 'methods';
    methodsEl.textContent = `Methods: ${methodsText}`;
    text.appendChild(methodsEl);
  }
  badge.append(icon, text);

  if (documentation) {
    try {
      const guideUrl = new URL(documentation);
      if (guideUrl.protocol === 'https:') {
        const link = document.createElement('a');
        link.className = 'link';
        link.textContent = '2FA setup guide →';
        link.href = guideUrl.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        text.appendChild(link);
      }
    } catch {
      // Ignore malformed or unsafe guide URLs from the remote directory.
    }
  }

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'dismiss';
  dismissBtn.setAttribute('aria-label', 'Dismiss two-factor authentication suggestion');
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

  // Standalone OTP steps often appear after the password form has navigated
  // away, so they need their own detector and explicit user-triggered fill.
  for (const otpField of detectOtpFields(document)) {
    if (injectedFields.has(otpField)) continue;
    injectedFields.add(otpField);
    createLockIconOverlay(otpField, () => {
      handleTotpAutofill(otpField).catch(console.error);
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
     ${INJECTED_BRAND_STYLES}
     .banner {
       display: flex;
       align-items: center;
       justify-content: space-between;
       padding: 10px 16px;
       background: #98452F;
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
     .icon { display: flex; flex-shrink: 0; }
     .lockbox-brand {
       padding: 4px 6px;
       background: #F7F8FC;
       border-radius: 8px;
       flex-shrink: 0;
     }
     .lockbox-brand__logo { width: 82px; }
     .text strong { display: block; margin-bottom: 2px; font-size: 14px; }
     .text span { opacity: 0.9; font-size: 12px; }
     .dismiss {
       background: rgba(255,255,255,0.2);
       border: 1px solid rgba(255,255,255,0.3);
       color: #fff;
       padding: 6px 14px;
       border-radius: 10px;
       cursor: pointer;
       font-size: 12px;
       font-weight: 600;
       flex-shrink: 0;
       margin-left: 12px;
     }
     .dismiss:hover { background: rgba(255,255,255,0.3); }
     .dismiss:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
     @media (max-width: 640px) {
       .icon { display: none; }
       .lockbox-brand__logo { width: 72px; }
     }
   `;

  const banner = document.createElement('div');
  banner.className = 'banner';
  banner.setAttribute('role', 'alert');

  const reasonText = message.reasons.length > 0 ? message.reasons[0] : 'Suspicious URL detected';
  const scorePercent = Math.round(message.score * 100);

  const info = document.createElement('div');
  info.className = 'info';
  const brand = createLockboxBrand();
  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = iconifySvg('alert-triangle', { size: 20 });
  const text = document.createElement('div');
  text.className = 'text';
  const title = document.createElement('strong');
  title.textContent = `Potential phishing site (${scorePercent}% risk)`;
  const reason = document.createElement('span');
  reason.textContent = reasonText;
  text.append(title, reason);
  info.append(brand, icon, text);
  banner.appendChild(info);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dismiss';
  btn.setAttribute('aria-label', 'Dismiss phishing warning');
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
        if (
          (event.data.type === 'lockbox-webauthn-create' ||
            event.data.type === 'lockbox-webauthn-get') &&
          (typeof event.data.requestId !== 'string' ||
            event.data.requestId.length > 128 ||
            event.data.origin !== window.location.origin)
        ) {
          return;
        }

        if (event.data.type === 'lockbox-webauthn-create') {
          try {
            const opts = event.data.options;
            let unlocked = await isVaultUnlocked();
            if (!unlocked) {
              unlocked = await showUnlockPrompt({
                onOpenLockbox: () => openExtensionPopup(),
                checkUnlocked: () => isVaultUnlocked(),
              });
              if (!unlocked) {
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
            }

            const confirmed = await showCreateConsent({
              rpName: opts.rp?.name ?? '',
              rpId: opts.rp?.id ?? new URL(event.data.origin).hostname,
              userName: opts.user?.name ?? '',
              userDisplayName: opts.user?.displayName ?? opts.user?.name ?? '',
            });
            if (!confirmed) {
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

            const result = await sendMessage<{
              credential?: object;
              error?: string;
              errorName?: string;
              fallback?: boolean;
            }>({
              type: 'WEBAUTHN_CREATE',
              requestId: event.data.requestId,
              origin: event.data.origin,
              options: opts,
            });
            window.postMessage(
              { type: 'lockbox-webauthn-response', requestId: event.data.requestId, ...result },
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
            let unlocked = await isVaultUnlocked();
            if (!unlocked) {
              unlocked = await showUnlockPrompt({
                onOpenLockbox: () => openExtensionPopup(),
                checkUnlocked: () => isVaultUnlocked(),
              });
              if (!unlocked) {
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
            }

            const result = await sendMessage<{
              credential?: object;
              error?: string;
              errorName?: string;
              fallback?: boolean;
              selectPasskey?: boolean;
              needsConsent?: boolean;
              consentData?: {
                rpName: string;
                rpId: string;
                userName: string;
                userDisplayName: string;
                credentialId: string;
              };
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

            if (result.needsConsent && result.consentData && result._context) {
              const confirmed = await showGetConsent(result.consentData);
              if (!confirmed) {
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
              const signResult = await sendMessage<{
                credential?: object;
                fallback?: boolean;
              }>({
                type: 'WEBAUTHN_GET_SELECTED',
                credentialId: result.consentData.credentialId,
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
              { type: 'lockbox-webauthn-response', requestId: event.data.requestId, ...result },
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
    chrome.runtime.onMessage.addListener((message, _sender, rawSendResponse) => {
      // Wrap sendResponse to handle extension context invalidation.
      // If the extension reloads while an async handler (e.g. consent dialog) is
      // pending, the message channel dies and sendResponse throws.
      const sendResponse = (data: unknown) => {
        try {
          rawSendResponse(data);
        } catch {
          /* extension context invalidated — response channel dead */
        }
      };

      if (message.type === 'webauthn-create-consent') {
        showCreateConsent(message.params)
          .then((confirmed) => sendResponse({ confirmed }))
          .catch(() => sendResponse({ confirmed: false }));
        return true;
      } else if (message.type === 'webauthn-get-consent') {
        showGetConsent(message.params)
          .then((confirmed) => sendResponse({ confirmed }))
          .catch(() => sendResponse({ confirmed: false }));
        return true;
      } else if (message.type === 'webauthn-pick-passkey') {
        showPasskeyPicker(message.passkeys)
          .then((selected) => sendResponse({ selected }))
          .catch(() => sendResponse({ selected: null }));
        return true;
      } else if (message.type === 'webauthn-vault-locked') {
        showVaultLockedToast(() => openExtensionPopup());
        sendResponse({ shown: true });
      } else if (message.type === 'webauthn-unlock-prompt') {
        showUnlockPrompt({
          onOpenLockbox: () => openExtensionPopup(),
          checkUnlocked: () => isVaultUnlocked(),
        })
          .then((unlocked) => sendResponse({ unlocked }))
          .catch(() => sendResponse({ unlocked: false }));
        return true;
      } else if (message.type === 'phishing-warning') {
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

    const startObserver = () => {
      observer.observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) {
      startObserver();
    } else {
      document.addEventListener('DOMContentLoaded', startObserver, {
        once: true,
        signal: ctx.signal,
      });
    }
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
