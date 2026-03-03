/**
 * WebAuthn consent UI overlays — Shadow DOM components injected into pages.
 *
 * All overlays follow the same pattern as the existing autofill dropdowns:
 * fixed-positioned, Shadow DOM for CSS isolation, indigo-600 primary,
 * dark card aesthetic, dismissible.
 *
 * SECURITY: These run in the content script (ISOLATED world). No private
 * keys or sensitive vault data flows through these — only display metadata
 * (rpName, userName, credentialId) for user consent decisions.
 */

// ─── Shared styles ──────────────────────────────────────────────────────────

const BASE_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.45); display: flex; align-items: center;
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
    background: #1e1e2e; border-radius: 14px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08);
    max-width: 400px; width: 90%; overflow: hidden;
    animation: slideUp 0.2s ease-out;
  }
  .modal-header {
    padding: 18px 20px 14px; display: flex; align-items: center; gap: 12px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .modal-header svg { width: 22px; height: 22px; color: #818cf8; flex-shrink: 0; }
  .modal-title { font-size: 15px; font-weight: 600; color: #e2e8f0; }
  .modal-subtitle { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  .modal-body { padding: 16px 20px; }
  .info-row {
    display: flex; align-items: center; gap: 10px; padding: 10px 12px;
    background: rgba(255,255,255,0.04); border-radius: 8px; margin-bottom: 8px;
  }
  .info-row:last-child { margin-bottom: 0; }
  .info-icon {
    width: 36px; height: 36px; border-radius: 8px; background: rgba(99,102,241,0.15);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    font-size: 16px;
  }
  .info-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-value {
    font-size: 14px; color: #e2e8f0; font-weight: 500;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px;
  }
  .modal-actions {
    display: flex; gap: 10px; padding: 14px 20px;
    border-top: 1px solid rgba(255,255,255,0.08);
  }
  .btn {
    flex: 1; padding: 10px 16px; border-radius: 8px; font-size: 13px;
    font-weight: 600; cursor: pointer; border: none; transition: all 0.15s;
  }
  .btn-primary {
    background: #6366f1; color: #fff;
  }
  .btn-primary:hover { background: #818cf8; }
  .btn-secondary {
    background: rgba(255,255,255,0.08); color: #94a3b8;
    border: 1px solid rgba(255,255,255,0.1);
  }
  .btn-secondary:hover { background: rgba(255,255,255,0.12); color: #e2e8f0; }
  .security-badge {
    display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px;
    border-radius: 4px; font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.4px;
  }
  .badge-secure { background: rgba(34,197,94,0.15); color: #4ade80; }
  .badge-warning { background: rgba(251,191,36,0.15); color: #fbbf24; }
`;

// ─── Passkey picker styles (for multi-match assertion) ──────────────────────

const PICKER_STYLES = `
  .passkey-list { max-height: 240px; overflow-y: auto; }
  .passkey-item {
    padding: 12px 20px; cursor: pointer;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    display: flex; align-items: center; gap: 12px; transition: background 0.1s;
  }
  .passkey-item:last-child { border-bottom: none; }
  .passkey-item:hover { background: rgba(99,102,241,0.1); }
  .passkey-icon {
    width: 36px; height: 36px; border-radius: 8px; background: rgba(99,102,241,0.15);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    font-size: 16px;
  }
  .passkey-info { min-width: 0; flex: 1; }
  .passkey-name {
    font-size: 14px; font-weight: 500; color: #e2e8f0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .passkey-detail {
    font-size: 12px; color: #64748b;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cancel-btn {
    width: 100%; padding: 12px; border: none;
    background: rgba(255,255,255,0.04); color: #64748b;
    font-size: 13px; cursor: pointer;
    border-top: 1px solid rgba(255,255,255,0.08);
  }
  .cancel-btn:hover { background: rgba(255,255,255,0.08); color: #94a3b8; }
`;

// ─── Toast styles (non-modal notification) ──────────────────────────────────

const TOAST_STYLES = `
  .toast {
    position: fixed; bottom: 20px; right: 20px;
    display: flex; align-items: flex-start; gap: 12px;
    padding: 14px 18px; max-width: 360px;
    background: #1e1e2e;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
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
  .toast-title { font-size: 13px; font-weight: 600; color: #e2e8f0; margin-bottom: 3px; }
  .toast-desc { font-size: 12px; color: #94a3b8; line-height: 1.4; }
  .toast-action {
    display: inline-block; margin-top: 6px; padding: 4px 10px;
    background: #6366f1; color: #fff; border: none; border-radius: 5px;
    font-size: 11px; font-weight: 600; cursor: pointer;
  }
  .toast-action:hover { background: #818cf8; }
  .toast-dismiss {
    background: none; border: none; color: rgba(255,255,255,0.3);
    cursor: pointer; font-size: 16px; padding: 0; line-height: 1; flex-shrink: 0;
  }
  .toast-dismiss:hover { color: rgba(255,255,255,0.6); }
`;

// ─── Key SVG icon (shared across overlays) ──────────────────────────────────

const KEY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7A5 5 0 0 1 7 7h2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;
const SHIELD_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
const LOCK_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

// ─── Helper: sanitize for display ───────────────────────────────────────────

function esc(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Helper: create & mount shadow host ─────────────────────────────────────

function createHost(id: string): { host: HTMLDivElement; shadow: ShadowRoot } {
  document.getElementById(id)?.remove();

  const host = document.createElement('div');
  host.id = id;
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(host);
  return { host, shadow };
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
      <div class="modal">
        <div class="modal-header">
          ${SHIELD_ICON_SVG}
          <div>
            <div class="modal-title">Create a passkey</div>
            <div class="modal-subtitle">
              <span class="security-badge badge-secure">End-to-end encrypted</span>
            </div>
          </div>
        </div>
        <div class="modal-body">
          <div class="info-row">
            <div class="info-icon">🌐</div>
            <div>
              <div class="info-label">Website</div>
              <div class="info-value">${esc(params.rpName)}</div>
              <div class="info-label" style="margin-top:2px">${esc(params.rpId)}</div>
            </div>
          </div>
          <div class="info-row">
            <div class="info-icon">👤</div>
            <div>
              <div class="info-label">Account</div>
              <div class="info-value">${esc(params.userDisplayName || params.userName)}</div>
              ${params.userDisplayName && params.userName !== params.userDisplayName ? `<div class="info-label" style="margin-top:2px">${esc(params.userName)}</div>` : ''}
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" data-action="cancel">Cancel</button>
          <button class="btn btn-primary" data-action="confirm">Save passkey</button>
        </div>
      </div>
    `;

    function cleanup(result: boolean): void {
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
      <div class="modal">
        <div class="modal-header">
          ${KEY_ICON_SVG}
          <div>
            <div class="modal-title">Sign in with passkey</div>
            <div class="modal-subtitle">${esc(params.rpName)}</div>
          </div>
        </div>
        <div class="modal-body">
          <div class="info-row">
            <div class="info-icon">👤</div>
            <div>
              <div class="info-label">Account</div>
              <div class="info-value">${esc(params.userDisplayName || params.userName)}</div>
              ${params.userDisplayName && params.userName !== params.userDisplayName ? `<div class="info-label" style="margin-top:2px">${esc(params.userName)}</div>` : ''}
            </div>
          </div>
          <div class="info-row">
            <div class="info-icon">🌐</div>
            <div>
              <div class="info-label">Website</div>
              <div class="info-value">${esc(params.rpId)}</div>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" data-action="cancel">Cancel</button>
          <button class="btn btn-primary" data-action="confirm">Sign in</button>
        </div>
      </div>
    `;

    function cleanup(result: boolean): void {
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
      <div class="modal">
        <div class="modal-header">
          ${KEY_ICON_SVG}
          <div>
            <div class="modal-title">Choose a passkey</div>
            <div class="modal-subtitle">Sign in to ${esc(passkeys[0]?.rpName || 'this site')}</div>
          </div>
        </div>
        <div class="passkey-list"></div>
        <button class="cancel-btn">Cancel</button>
      </div>
    `;

    function cleanup(result: { credentialId: string } | null): void {
      host.remove();
      resolve(result);
    }

    const listEl = overlay.querySelector('.passkey-list')!;
    for (const pk of passkeys) {
      const item = document.createElement('div');
      item.className = 'passkey-item';
      item.innerHTML = `
        <div class="passkey-icon">🔑</div>
        <div class="passkey-info">
          <div class="passkey-name">${esc(pk.userDisplayName || pk.userName)}</div>
          <div class="passkey-detail">${esc(pk.userName)}</div>
        </div>
      `;
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

    shadow.appendChild(overlay);
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
  toast.innerHTML = `
    <span class="toast-icon">${LOCK_ICON_SVG.replace('width="24"', 'width="20"').replace('height="24"', 'height="20"').replace('stroke="currentColor"', 'stroke="#fbbf24"')}</span>
    <div class="toast-text">
      <div class="toast-title">Lockbox is locked</div>
      <div class="toast-desc">Unlock to use passkeys on this site</div>
      <button class="toast-action">Open Lockbox</button>
    </div>
    <button class="toast-dismiss">\u00d7</button>
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
