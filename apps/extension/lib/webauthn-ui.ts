/**
 * WebAuthn consent UI overlays — Shadow DOM components injected into pages.
 *
 * All overlays follow the same pattern as the existing autofill dropdowns:
 * fixed-positioned, Shadow DOM for CSS isolation, shared warm-neutral palette,
 * checked-in Iconify icons, and dismissible interactions.
 *
 * SECURITY: These run in the content script (ISOLATED world). No private
 * keys or sensitive vault data flows through these — only display metadata
 * (rpName, userName, credentialId) for user consent decisions.
 */

import { iconifySvg } from './iconify.js';

// ─── Shared styles ──────────────────────────────────────────────────────────

const BASE_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(44,40,37,0.4); display: flex; align-items: center;
    justify-content: center; font-family: -apple-system, BlinkMacSystemFont,
    'Segoe UI', Roboto, sans-serif; z-index: 2147483647;
    animation: fadeIn 0.15s ease-out;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .modal {
    background: #FDFCFA; border-radius: 24px;
    box-shadow: 0 12px 40px rgba(44,40,37,0.12), 0 0 0 1px #DDD6CC;
    max-width: 400px; width: 90%; overflow: hidden;
    animation: slideUp 0.2s ease-out;
  }
  .modal-header {
    padding: 18px 20px 14px; display: flex; align-items: center; gap: 12px;
    border-bottom: 1px solid #DDD6CC;
  }
  .modal-header svg { width: 22px; height: 22px; color: #8B7355; flex-shrink: 0; }
  .modal-title { font-size: 15px; font-weight: 600; color: #2C2825; }
  .modal-subtitle { font-size: 12px; color: #7A7168; margin-top: 2px; }
  .modal-body { padding: 16px 20px; }
  .info-row {
    display: flex; align-items: center; gap: 10px; padding: 10px 12px;
    background: #EAE6DF; border-radius: 10px; margin-bottom: 8px;
  }
  .info-row:last-child { margin-bottom: 0; }
  .info-icon {
    width: 36px; height: 36px; border-radius: 10px; background: rgba(139,115,85,0.15);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    color: #6B5640;
  }
  .info-label { font-size: 11px; color: #7A7168; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-value {
    font-size: 14px; color: #2C2825; font-weight: 500;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px;
  }
  .modal-actions {
    display: flex; gap: 10px; padding: 14px 20px;
    border-top: 1px solid #DDD6CC;
  }
  .btn {
    flex: 1; padding: 10px 16px; border-radius: 10px; font-size: 13px;
    font-weight: 600; cursor: pointer; border: none; transition: all 0.15s;
  }
  .btn-primary {
    background: #8B7355; color: #fff;
  }
  .btn-primary:hover { background: #7A6348; }
  .btn-secondary {
    background: #EAE6DF; color: #7A7168;
    border: 1px solid #DDD6CC;
  }
  .btn-secondary:hover { background: #DDD6CC; color: #2C2825; }
  .btn:focus-visible, .cancel-btn:focus-visible, .toast-action:focus-visible,
  .toast-dismiss:focus-visible, .passkey-item:focus-visible {
    outline: 2px solid #8B7355; outline-offset: 2px;
  }
  .security-badge {
    display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px;
    border-radius: 10px; font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.4px;
  }
  .badge-secure { background: rgba(94,138,94,0.1); color: #5E8A5E; }
  .badge-warning { background: rgba(181,142,58,0.1); color: #B58E3A; }
  @media (prefers-reduced-motion: reduce) {
    .overlay, .modal { animation: none; }
    .btn { transition: none; }
  }
`;

// ─── Passkey picker styles (for multi-match assertion) ──────────────────────

const PICKER_STYLES = `
  .passkey-list { max-height: 240px; overflow-y: auto; }
  .passkey-item {
    padding: 12px 20px; cursor: pointer;
    border-bottom: 1px solid #DDD6CC;
    display: flex; align-items: center; gap: 12px; transition: background 0.1s;
    width: 100%; background: transparent; border-left: 0; border-right: 0;
    border-top: 0; font: inherit; text-align: left;
  }
  .passkey-item:last-child { border-bottom: none; }
  .passkey-item:hover { background: rgba(196,168,130,0.1); }
  .passkey-icon {
    width: 36px; height: 36px; border-radius: 10px; background: rgba(139,115,85,0.15);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    color: #6B5640;
  }
  .passkey-info { min-width: 0; flex: 1; }
  .passkey-name {
    font-size: 14px; font-weight: 500; color: #2C2825;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .passkey-detail {
    font-size: 12px; color: #7A7168;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cancel-btn {
    width: 100%; padding: 12px; border: none;
    background: #EAE6DF; color: #7A7168;
    font-size: 13px; cursor: pointer;
    border-top: 1px solid #DDD6CC;
  }
  .cancel-btn:hover { background: #DDD6CC; color: #2C2825; }
`;

// ─── Toast styles (non-modal notification) ──────────────────────────────────

const TOAST_STYLES = `
  .toast {
    position: fixed; bottom: 20px; right: 20px;
    display: flex; align-items: flex-start; gap: 12px;
    padding: 14px 18px; max-width: 360px;
    background: #FDFCFA;
    border: 1px solid #DDD6CC;
    border-radius: 20px;
    box-shadow: 0 8px 32px rgba(44,40,37,0.12);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: slideInRight 0.25s ease-out;
    z-index: 2147483647;
  }
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(24px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  .toast-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
  .toast-text { flex: 1; min-width: 0; }
  .toast-title { font-size: 13px; font-weight: 600; color: #2C2825; margin-bottom: 3px; }
  .toast-desc { font-size: 12px; color: #7A7168; line-height: 1.4; }
  .toast-action {
    display: inline-block; margin-top: 6px; padding: 4px 10px;
    background: #8B7355; color: #fff; border: none; border-radius: 10px;
    font-size: 11px; font-weight: 600; cursor: pointer;
  }
  .toast-action:hover { background: #7A6348; }
  .toast-dismiss {
    background: none; border: none; color: #A69E93;
    cursor: pointer; font-size: 16px; padding: 0; line-height: 1; flex-shrink: 0;
  }
  .toast-dismiss:hover { color: #2C2825; }
  @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
`;

// ─── Key SVG icon (shared across overlays) ──────────────────────────────────

const KEY_ICON_SVG = iconifySvg('key', { size: 22 });
const SHIELD_ICON_SVG = iconifySvg('shield-lock', { size: 22 });
const LOCK_ICON_SVG = iconifySvg('lock', { size: 22 });

// ─── Helper: create & mount shadow host ─────────────────────────────────────

const activeHostCleanups = new Map<string, () => void>();

function createHost(id: string): { host: HTMLDivElement; shadow: ShadowRoot } {
  activeHostCleanups.get(id)?.();
  activeHostCleanups.delete(id);
  document.getElementById(id)?.remove();

  const host = document.createElement('div');
  host.id = id;
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(host);
  return { host, shadow };
}

function registerHostCleanup(id: string, cleanup: () => void): void {
  activeHostCleanups.set(id, cleanup);
}

function unregisterHostCleanup(id: string, cleanup: () => void): void {
  if (activeHostCleanups.get(id) === cleanup) activeHostCleanups.delete(id);
}

// ─── Passkey Create Consent ─────────────────────────────────────────────────

export interface CreateConsentParams {
  rpName: string;
  rpId: string;
  userName: string;
  userDisplayName: string;
}

/**
 * Show a consent overlay for passkey registration.
 * Returns `true` if user confirms, `false` if they cancel.
 */
export function showCreateConsent(params: CreateConsentParams): Promise<boolean> {
  if (!chrome.runtime?.id) return Promise.resolve(false);

  return new Promise((resolve) => {
    const { host, shadow } = createHost('lockbox-webauthn-create-consent');

    const style = document.createElement('style');
    style.textContent = BASE_STYLES;
    shadow.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="lockbox-create-title">
        <div class="modal-header">
          ${SHIELD_ICON_SVG}
          <div>
            <div class="modal-title" id="lockbox-create-title">Create a passkey</div>
            <div class="modal-subtitle">
              <span class="security-badge badge-secure">End-to-end encrypted</span>
            </div>
          </div>
        </div>
        <div class="modal-body">
          <div class="info-row">
            <div class="info-icon">${iconifySvg('world', { size: 18 })}</div>
            <div>
              <div class="info-label">Website</div>
              <div class="info-value" data-rp-name></div>
              <div class="info-label" style="margin-top:2px" data-rp-id></div>
            </div>
          </div>
          <div class="info-row">
            <div class="info-icon">${iconifySvg('user', { size: 18 })}</div>
            <div>
              <div class="info-label">Account</div>
              <div class="info-value" data-account-name></div>
              <div class="info-label" style="margin-top:2px" data-account-secondary hidden></div>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="btn btn-primary" data-action="confirm">Save passkey</button>
        </div>
      </div>
    `;

    (overlay.querySelector('[data-rp-name]') as HTMLElement).textContent = params.rpName;
    (overlay.querySelector('[data-rp-id]') as HTMLElement).textContent = params.rpId;
    (overlay.querySelector('[data-account-name]') as HTMLElement).textContent =
      params.userDisplayName || params.userName;
    const accountSecondary = overlay.querySelector('[data-account-secondary]') as HTMLElement;
    if (params.userDisplayName && params.userName !== params.userDisplayName) {
      accountSecondary.hidden = false;
      accountSecondary.textContent = params.userName;
    }

    const replacementCleanup = () => cleanup(false);
    function cleanup(result: boolean): void {
      unregisterHostCleanup('lockbox-webauthn-create-consent', replacementCleanup);
      document.removeEventListener('keydown', keyHandler);
      host.remove();
      resolve(result);
    }

    overlay
      .querySelector('[data-action="confirm"]')!
      .addEventListener('click', () => cleanup(true));
    overlay
      .querySelector('[data-action="cancel"]')!
      .addEventListener('click', () => cleanup(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', keyHandler);
        cleanup(false);
      }
    };
    document.addEventListener('keydown', keyHandler);
    registerHostCleanup('lockbox-webauthn-create-consent', replacementCleanup);

    shadow.appendChild(overlay);
    (shadow.querySelector('[data-action="confirm"]') as HTMLButtonElement)?.focus();
  });
}

// ─── Passkey Get Consent (single match) ─────────────────────────────────────

export interface GetConsentParams {
  rpName: string;
  rpId: string;
  userName: string;
  userDisplayName: string;
  credentialId: string;
}

/**
 * Show a consent overlay for passkey assertion (single match).
 * Returns `true` if user confirms, `false` if they cancel.
 */
export function showGetConsent(params: GetConsentParams): Promise<boolean> {
  if (!chrome.runtime?.id) return Promise.resolve(false);

  return new Promise((resolve) => {
    const { host, shadow } = createHost('lockbox-webauthn-get-consent');

    const style = document.createElement('style');
    style.textContent = BASE_STYLES;
    shadow.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="lockbox-get-title">
        <div class="modal-header">
          ${KEY_ICON_SVG}
          <div>
            <div class="modal-title" id="lockbox-get-title">Sign in with passkey</div>
            <div class="modal-subtitle" data-rp-name></div>
          </div>
        </div>
        <div class="modal-body">
          <div class="info-row">
            <div class="info-icon">${iconifySvg('user', { size: 18 })}</div>
            <div>
              <div class="info-label">Account</div>
              <div class="info-value" data-account-name></div>
              <div class="info-label" style="margin-top:2px" data-account-secondary hidden></div>
            </div>
          </div>
          <div class="info-row">
            <div class="info-icon">${iconifySvg('world', { size: 18 })}</div>
            <div>
              <div class="info-label">Website</div>
              <div class="info-value" data-rp-id></div>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="btn btn-primary" data-action="confirm">Sign in</button>
        </div>
      </div>
    `;

    (overlay.querySelector('[data-rp-name]') as HTMLElement).textContent = params.rpName;
    (overlay.querySelector('[data-rp-id]') as HTMLElement).textContent = params.rpId;
    (overlay.querySelector('[data-account-name]') as HTMLElement).textContent =
      params.userDisplayName || params.userName;
    const accountSecondary = overlay.querySelector('[data-account-secondary]') as HTMLElement;
    if (params.userDisplayName && params.userName !== params.userDisplayName) {
      accountSecondary.hidden = false;
      accountSecondary.textContent = params.userName;
    }

    const replacementCleanup = () => cleanup(false);
    function cleanup(result: boolean): void {
      unregisterHostCleanup('lockbox-webauthn-get-consent', replacementCleanup);
      document.removeEventListener('keydown', keyHandler);
      host.remove();
      resolve(result);
    }

    overlay
      .querySelector('[data-action="confirm"]')!
      .addEventListener('click', () => cleanup(true));
    overlay
      .querySelector('[data-action="cancel"]')!
      .addEventListener('click', () => cleanup(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', keyHandler);
        cleanup(false);
      }
    };
    document.addEventListener('keydown', keyHandler);
    registerHostCleanup('lockbox-webauthn-get-consent', replacementCleanup);

    shadow.appendChild(overlay);
    (shadow.querySelector('[data-action="confirm"]') as HTMLButtonElement)?.focus();
  });
}

// ─── Passkey Picker (multi-match assertion) ─────────────────────────────────

export interface PasskeyPickerEntry {
  credentialId: string;
  userName: string;
  userDisplayName: string;
  rpName: string;
}

/**
 * Show a picker overlay when multiple passkeys match an assertion request.
 * Returns the selected passkey or null if dismissed.
 */
export function showPasskeyPicker(
  passkeys: PasskeyPickerEntry[]
): Promise<{ credentialId: string } | null> {
  if (!chrome.runtime?.id) return Promise.resolve(null);

  return new Promise((resolve) => {
    const { host, shadow } = createHost('lockbox-webauthn-picker');

    const style = document.createElement('style');
    style.textContent = BASE_STYLES + PICKER_STYLES;
    shadow.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="lockbox-picker-title">
        <div class="modal-header">
          ${KEY_ICON_SVG}
          <div>
            <div class="modal-title" id="lockbox-picker-title">Choose a passkey</div>
            <div class="modal-subtitle">Sign in to <span data-rp-name></span></div>
          </div>
        </div>
        <div class="passkey-list"></div>
        <button type="button" class="cancel-btn">Cancel</button>
      </div>
    `;
    (overlay.querySelector('[data-rp-name]') as HTMLElement).textContent =
      passkeys[0]?.rpName || 'this site';

    const replacementCleanup = () => cleanup(null);
    function cleanup(result: { credentialId: string } | null): void {
      unregisterHostCleanup('lockbox-webauthn-picker', replacementCleanup);
      document.removeEventListener('keydown', keyHandler);
      host.remove();
      resolve(result);
    }

    const listEl = overlay.querySelector('.passkey-list')!;
    for (const pk of passkeys) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'passkey-item';
      item.innerHTML = `
        <div class="passkey-icon">${iconifySvg('key', { size: 18 })}</div>
        <div class="passkey-info">
          <div class="passkey-name"></div>
          <div class="passkey-detail"></div>
        </div>
      `;
      (item.querySelector('.passkey-name') as HTMLElement).textContent =
        pk.userDisplayName || pk.userName;
      (item.querySelector('.passkey-detail') as HTMLElement).textContent = pk.userName;
      item.addEventListener('click', () => cleanup({ credentialId: pk.credentialId }));
      listEl.appendChild(item);
    }

    overlay.querySelector('.cancel-btn')!.addEventListener('click', () => cleanup(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(null);
    });

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', keyHandler);
        cleanup(null);
      }
    };
    document.addEventListener('keydown', keyHandler);
    registerHostCleanup('lockbox-webauthn-picker', replacementCleanup);

    shadow.appendChild(overlay);
    (shadow.querySelector('.passkey-item, .cancel-btn') as HTMLButtonElement)?.focus();
  });
}

// ─── Vault Locked Toast ─────────────────────────────────────────────────────

/**
 * Show a non-modal toast when a WebAuthn request arrives while the vault is locked.
 * The user can click "Open Lockbox" to unlock, or dismiss.
 * Auto-dismisses after 8 seconds.
 */
export function showVaultLockedToast(onOpenLockbox?: () => void): void {
  document.getElementById('lockbox-webauthn-locked-toast')?.remove();

  const host = document.createElement('div');
  host.id = 'lockbox-webauthn-locked-toast';
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = TOAST_STYLES;
  shadow.appendChild(style);

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `
    <span class="toast-icon">${LOCK_ICON_SVG.replace('width="24"', 'width="20"').replace('height="24"', 'height="20"').replace('stroke="currentColor"', 'stroke="#fbbf24"')}</span>
    <div class="toast-text">
      <div class="toast-title">Lockbox is locked</div>
      <div class="toast-desc">Unlock to use passkeys on this site</div>
      <button type="button" class="toast-action">Open Lockbox</button>
    </div>
    <button type="button" class="toast-dismiss" aria-label="Dismiss Lockbox notification">\u00d7</button>
  `;

  toast.querySelector('.toast-action')!.addEventListener('click', () => {
    host.remove();
    onOpenLockbox?.();
  });
  toast.querySelector('.toast-dismiss')!.addEventListener('click', () => host.remove());

  shadow.appendChild(toast);
  document.documentElement.appendChild(host);

  setTimeout(() => {
    if (host.parentElement) host.remove();
  }, 8000);
}

// ─── Unlock Prompt (blocking modal with polling) ────────────────────────────

const UNLOCK_PROMPT_STYLES = `
  .spinner {
    display: inline-block; width: 16px; height: 16px;
    border: 2px solid rgba(139,115,85,0.2);
    border-top-color: #8B7355;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .status-row {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 12px; margin-top: 8px;
    background: rgba(139,115,85,0.08); border-radius: 10px;
    font-size: 13px; color: #7A7168;
  }
  .status-row.unlocked { color: #5E8A5E; }
`;

export interface UnlockPromptParams {
  onOpenLockbox: () => void;
  checkUnlocked: () => Promise<boolean>;
  timeoutMs?: number;
}

/**
 * Show a full-screen blocking modal when the vault is locked during a WebAuthn request.
 * Polls `checkUnlocked()` every second. Auto-dismisses and resolves `true` when
 * the vault unlocks. Resolves `false` on cancel, Escape, backdrop click, or timeout.
 */
export function showUnlockPrompt(params: UnlockPromptParams): Promise<boolean> {
  if (!chrome.runtime?.id) return Promise.resolve(false);

  const timeoutMs = params.timeoutMs ?? 120_000;

  return new Promise((resolve) => {
    const { host, shadow } = createHost('lockbox-webauthn-unlock-prompt');

    const style = document.createElement('style');
    style.textContent = BASE_STYLES + UNLOCK_PROMPT_STYLES;
    shadow.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="lockbox-unlock-title">
        <div class="modal-header">
          ${LOCK_ICON_SVG}
          <div>
            <div class="modal-title" id="lockbox-unlock-title">Lockbox is locked</div>
            <div class="modal-subtitle">Unlock to use passkeys on this site</div>
          </div>
        </div>
        <div class="modal-body">
          <div class="info-row">
            <div class="info-icon">${iconifySvg('key', { size: 18 })}</div>
            <div>
              <div class="info-label">Action required</div>
              <div class="info-value">Enter your master password to continue</div>
            </div>
          </div>
          <div class="status-row" data-status role="status" aria-live="polite">
            <div class="spinner"></div>
            <span>Waiting for unlock…</span>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="btn btn-primary" data-action="open">Open Lockbox</button>
        </div>
      </div>
    `;

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let resolved = false;

    const replacementCleanup = () => cleanup(false);
    function cleanup(result: boolean): void {
      if (resolved) return;
      resolved = true;
      unregisterHostCleanup('lockbox-webauthn-unlock-prompt', replacementCleanup);
      document.removeEventListener('keydown', keyHandler);
      if (pollTimer) clearInterval(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      host.remove();
      resolve(result);
    }

    overlay
      .querySelector('[data-action="open"]')!
      .addEventListener('click', () => params.onOpenLockbox());
    overlay
      .querySelector('[data-action="cancel"]')!
      .addEventListener('click', () => cleanup(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', keyHandler);
        cleanup(false);
      }
    };
    document.addEventListener('keydown', keyHandler);
    registerHostCleanup('lockbox-webauthn-unlock-prompt', replacementCleanup);

    shadow.appendChild(overlay);
    (shadow.querySelector('[data-action="open"]') as HTMLButtonElement)?.focus();

    pollTimer = setInterval(async () => {
      if (resolved) return;
      try {
        const unlocked = await params.checkUnlocked();
        if (unlocked) {
          const statusRow = shadow.querySelector('[data-status]');
          if (statusRow) {
            statusRow.classList.add('unlocked');
            const icon = document.createElement('span');
            icon.innerHTML = iconifySvg('circle-check', { size: 18 });
            const message = document.createElement('span');
            message.textContent = 'Unlocked!';
            statusRow.replaceChildren(icon, message);
          }
          setTimeout(() => cleanup(true), 300);
        }
      } catch {
        /* poll error — keep trying */
      }
    }, 1000);

    timeoutTimer = setTimeout(() => cleanup(false), timeoutMs);
  });
}
