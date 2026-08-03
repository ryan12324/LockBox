/**
 * Content script for Lockbox extension.
 * Detects login forms and identity forms, provides autofill functionality,
 * and monitors form submissions for save/update prompts.
 *
 * Uses Shadow DOM for all injected UI to avoid CSS conflicts.
 * Proxies crypto operations through the background service worker.
 */

import { detectForms } from '../lib/form-detector.js';
import type { DetectedForm } from '../lib/form-detector.js';
import {
  fillForm,
  fillIdentityForm,
  simulateFill,
  createSuggestionDropdown,
  createIdentitySuggestionDropdown,
  createStatusDropdown,
} from '../lib/autofill.js';
import { AutofillOverlayController } from '../lib/autofill-controller.js';
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
import { INLINE_AUTOFILL_DISABLED_HOSTS_KEY, INLINE_AUTOFILL_ENABLED_KEY } from '../lib/storage.js';

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

async function refreshMatchingLoginForUse(itemId: string): Promise<LoginItem> {
  const result = await sendMessage<{
    success: boolean;
    item?: VaultItem;
    error?: string;
  }>({ type: 'refresh-matching-login', itemId });
  if (!result.success || result.item?.type !== 'login') {
    throw new Error(result.error || 'This login cannot be used on this page.');
  }
  return result.item as LoginItem;
}

async function rememberLoginSelection(item: LoginItem): Promise<void> {
  await sendMessage({
    type: 'remember-login-selection',
    itemId: item.id,
    username: item.username,
  }).catch(() => {});
}

/** Handle autofill for a detected form. */
function resolveLiveLoginForm(passwordField: HTMLInputElement): DetectedForm | null {
  return (
    detectForms(document).find(
      (form) => form.passwordField === passwordField && form.passwordPurpose !== 'new'
    ) ?? null
  );
}

async function handleAutofill(form: DetectedForm): Promise<void> {
  const passwordField = form.passwordField;
  if (!resolveLiveLoginForm(passwordField)) return;

  // 1. Check if vault is unlocked
  const unlocked = await isVaultUnlocked();
  if (!resolveLiveLoginForm(passwordField)) return;
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
          handleAutofill(form).catch(() => {});
        },
      },
    ]);
    return;
  }

  if (!resolveLiveLoginForm(passwordField)) return;

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
      const liveForm = resolveLiveLoginForm(passwordField);
      if (!liveForm || !fillForm(liveForm, freshItem.username, freshItem.password)) return;
      void rememberLoginSelection(freshItem);
      filledItem = freshItem;
    } catch {
      createStatusDropdown(passwordField, 'error', [
        { label: 'Retry', onClick: () => void handleAutofill(form) },
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
              const liveForm = resolveLiveLoginForm(passwordField);
              if (!liveForm || !fillForm(liveForm, freshItem.username, freshItem.password)) return;
              void rememberLoginSelection(freshItem);
              checkTwoFaAfterAutofill(freshItem).catch(() => {});
            } catch {
              createStatusDropdown(passwordField, 'error', [
                {
                  label: 'Retry',
                  onClick: () => void handleAutofill(form),
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

async function fillLoginFromPopup(itemId: string): Promise<{ success: boolean; error?: string }> {
  const forms = detectForms(document).filter((form) => form.passwordPurpose !== 'new');
  if (forms.length === 0) {
    return { success: false, error: 'No compatible login form is visible on this page.' };
  }

  const focused = document.activeElement;
  const preferred =
    forms.find((form) => form.passwordField === focused || form.usernameField === focused) ??
    forms[0];

  try {
    const item = await refreshMatchingLoginForUse(itemId);
    const liveForm = resolveLiveLoginForm(preferred.passwordField);
    if (!liveForm || !fillForm(liveForm, item.username, item.password)) {
      return { success: false, error: 'The login form changed before Authwell could fill it.' };
    }
    void rememberLoginSelection(item);
    checkTwoFaAfterAutofill(item).catch(() => {});
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Authwell could not fill this login.',
    };
  }
}

/** Fill a username-only first step while retaining only its item id and username. */
async function handleUsernameAutofill(field: HTMLInputElement): Promise<void> {
  if (!field.isConnected) return;
  if (!(await isVaultUnlocked())) {
    if (field.isConnected) {
      createStatusDropdown(field, 'locked', [
        { label: 'Open Authwell', onClick: () => openExtensionPopup() },
      ]);
    }
    return;
  }

  let items: LoginItem[];
  try {
    items = (await getMatchingItems()).filter((item): item is LoginItem => item.type === 'login');
  } catch {
    if (field.isConnected) {
      createStatusDropdown(field, 'error', [
        { label: 'Retry', onClick: () => void handleUsernameAutofill(field) },
      ]);
    }
    return;
  }
  if (!field.isConnected) return;

  const fillUsername = async (itemId: string) => {
    const item = await refreshItemForUse(itemId, 'login');
    if (!field.isConnected || !simulateFill(field, item.username)) return;
    await rememberLoginSelection(item);
  };

  if (items.length === 0) {
    createStatusDropdown(field, 'no-matches', [
      { label: 'Open Authwell', onClick: () => openExtensionPopup() },
    ]);
  } else if (items.length === 1) {
    await fillUsername(items[0].id).catch(() => {
      if (field.isConnected) {
        createStatusDropdown(field, 'error', [
          { label: 'Retry', onClick: () => void handleUsernameAutofill(field) },
        ]);
      }
    });
  } else {
    createSuggestionDropdown(
      field,
      items.map((item) => ({
        id: item.id,
        name: item.name,
        username: item.username,
        uris: item.uris,
      })),
      (selected) => void fillUsername(selected.id)
    );
  }
}

type TotpGenerationResult = {
  code: string | null;
  remaining: number;
  error?: string;
};

async function fillTotp(field: HTMLInputElement, item: LoginItem): Promise<void> {
  if (!field.isConnected) return;

  const result = await sendMessage<TotpGenerationResult>({
    type: 'get-item-totp',
    itemId: item.id,
  });
  if (!field.isConnected) return;

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
  if (!field.isConnected) return;

  if (!(await isVaultUnlocked())) {
    if (!field.isConnected) return;
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
    if (!field.isConnected) return;
    createStatusDropdown(field, 'error', [
      { label: 'Retry', onClick: () => void handleTotpAutofill(field) },
    ]);
    return;
  }

  if (!field.isConnected) return;

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
  if (!firstField?.isConnected) return;

  // Check if vault is unlocked
  const unlocked = await isVaultUnlocked();
  if (!firstField.isConnected) return;
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
    if (!firstField.isConnected) return;
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

  if (!firstField.isConnected) return;

  if (identityItems.length === 0) {
    createStatusDropdown(firstField, 'no-matches', [
      { label: 'Open Authwell', onClick: () => openExtensionPopup() },
    ]);
    return;
  }

  if (identityItems.length === 1) {
    // Single identity — fill immediately
    try {
      const item = await refreshItemForUse(identityItems[0].id, 'identity');
      if (!firstField.isConnected) return;
      fillIdentityForm(identityForm, item);
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
            .then((freshItem) => {
              if (!firstField.isConnected) return;
              fillIdentityForm(identityForm, freshItem);
            })
            .catch(() => {
              if (!firstField.isConnected) return;
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
  allFrames: true,

  main(ctx) {
    let overlayController: AutofillOverlayController | null = null;

    const applyInlineAutofillPreferences = async () => {
      try {
        const settings = await sendMessage<{ siteEnabled: boolean }>({
          type: 'get-inline-autofill-settings',
        });
        overlayController?.setEnabled(settings.siteEnabled);
      } catch {
        overlayController?.setEnabled(false);
      }
    };

    const storageChangeListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (
        areaName === 'local' &&
        (changes[INLINE_AUTOFILL_ENABLED_KEY] || changes[INLINE_AUTOFILL_DISABLED_HOSTS_KEY])
      ) {
        void applyInlineAutofillPreferences();
      }
    };
    chrome.storage.onChanged.addListener(storageChangeListener);

    // ─── DOM-dependent features (deferred until DOM is ready) ─────────────────
    function initDomFeatures() {
      overlayController = new AutofillOverlayController(
        document,
        {
          onLogin: (form) => handleAutofill(form),
          onUsername: (field) => handleUsernameAutofill(field),
          onIdentity: (form) => handleIdentityAutofill(form),
          onOtp: (field) => handleTotpAutofill(field),
        },
        { enabled: false }
      );
      overlayController.start();
      void applyInlineAutofillPreferences();
      // Initialize save-on-submit detection
      initSaveDetector(ctx.signal, {
        resolveUsername: async () => {
          const result: { username?: string } = await sendMessage<{ username?: string }>({
            type: 'get-remembered-login-selection',
          }).catch((): { username?: string } => ({}));
          return result.username ?? '';
        },
      });
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
        if (window === window.top) injectPhishingWarning(message);
      } else if (message.type === 'fill-login') {
        if (typeof message.itemId !== 'string' || message.itemId.length > 128) {
          sendResponse({ success: false, error: 'A valid login is required.' });
          return false;
        }
        fillLoginFromPopup(message.itemId)
          .then(sendResponse)
          .catch(() =>
            sendResponse({ success: false, error: 'Authwell could not fill this login.' })
          );
        return true;
      } else if (message.type === 'get-password-field-metadata') {
        // Extract metadata from the first password field on the page, including
        // open shadow roots and temporarily revealed password inputs.
        const pwField = detectForms(document)[0]?.passwordField ?? null;
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
      overlayController?.destroy();
      chrome.storage.onChanged.removeListener(storageChangeListener);
    });
  },
});
