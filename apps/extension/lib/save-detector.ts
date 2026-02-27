/**
 * Save-on-submit detector for the content script.
 * Monitors form submissions and AJAX requests to detect new/updated credentials.
 * Prompts user via a Shadow DOM banner to save or update vault items.
 */

import { detectForms } from './form-detector.js';

/** Credentials extracted from a form submission. */
export interface ExtractedCredentials {
  url: string;
  username: string;
  password: string;
}

/** Response from the background script credential check. */
export type CredentialCheckResult = 'new' | 'update' | 'match';

/** Banner dismiss timeout in milliseconds. */
const BANNER_DISMISS_MS = 30_000;

/** Banner host element ID. */
const BANNER_ID = 'lockbox-save-banner';

/**
 * Extract username and password from form fields within a form element.
 * Returns null if no credentials can be extracted.
 */
export function extractCredentials(form: HTMLFormElement): ExtractedCredentials | null {
  const forms = detectForms(form);
  if (forms.length === 0) return null;

  const detected = forms[0];
  const password = detected.passwordField?.value;
  if (!password) return null;

  const username = detected.usernameField?.value ?? '';

  return {
    url: window.location.href,
    username,
    password,
  };
}

/**
 * Extract credentials from a POST request body.
 * Looks for credential-like keys in URL-encoded or JSON payloads.
 */
export function extractCredentialsFromPayload(
  url: string,
  body: string | undefined
): ExtractedCredentials | null {
  if (!body) return null;

  let data: Record<string, string> | null = null;

  // Try JSON parse
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed === 'object' && parsed !== null) {
      data = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') data[k] = v;
      }
    }
  } catch {
    // Try URL-encoded form data
    try {
      const params = new URLSearchParams(body);
      data = {};
      for (const [k, v] of params.entries()) {
        data[k] = v;
      }
    } catch {
      return null;
    }
  }

  if (!data) return null;

  const passwordKeys = ['password', 'pass', 'passwd', 'pw', 'user_password', 'user_pass'];
  const usernameKeys = [
    'username',
    'user',
    'email',
    'login',
    'user_email',
    'userid',
    'user_id',
    'account',
  ];

  let password = '';
  let username = '';

  for (const key of passwordKeys) {
    const lowerEntries = Object.entries(data).find(([k]) => k.toLowerCase() === key);
    if (lowerEntries && lowerEntries[1]) {
      password = lowerEntries[1];
      break;
    }
  }

  if (!password) return null;

  for (const key of usernameKeys) {
    const lowerEntries = Object.entries(data).find(([k]) => k.toLowerCase() === key);
    if (lowerEntries && lowerEntries[1]) {
      username = lowerEntries[1];
      break;
    }
  }

  return { url, username, password };
}

/**
 * Inject a save/update banner at the top of the page using Shadow DOM.
 * Returns the banner host element.
 */
export function injectSaveBanner(
  type: 'new' | 'update',
  siteName: string,
  onSave: () => void,
  onDismiss: () => void
): HTMLElement {
  // Remove existing banner if present
  const existing = document.getElementById(BANNER_ID);
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = BANNER_ID;
  host.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;';

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    .banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
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
    .text { font-size: 13px; }
    .actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
      margin-left: 12px;
    }
    .btn {
      padding: 6px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      border: none;
    }
    .btn-save {
      background: #fff;
      color: #4f46e5;
    }
    .btn-save:hover { background: #e0e7ff; }
    .btn-dismiss {
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      color: #fff;
    }
    .btn-dismiss:hover { background: rgba(255,255,255,0.3); }
  `;

  const banner = document.createElement('div');
  banner.className = 'banner';

  const message =
    type === 'new' ? 'Save this login to Lockbox?' : `Update password for ${siteName}?`;

  const buttonLabel = type === 'new' ? 'Save' : 'Update';

  banner.innerHTML = `
    <div class="info">
      <span class="icon">🔐</span>
      <span class="text">${message}</span>
    </div>
    <div class="actions"></div>
  `;

  const actionsEl = banner.querySelector('.actions');

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-save';
  saveBtn.textContent = buttonLabel;
  saveBtn.addEventListener('click', () => {
    host.remove();
    onSave();
  });

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'btn btn-dismiss';
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.addEventListener('click', () => {
    host.remove();
    onDismiss();
  });

  actionsEl?.appendChild(saveBtn);
  actionsEl?.appendChild(dismissBtn);

  shadow.appendChild(style);
  shadow.appendChild(banner);
  document.body.prepend(host);

  // Auto-dismiss after timeout
  setTimeout(() => {
    if (host.parentElement) {
      host.remove();
      onDismiss();
    }
  }, BANNER_DISMISS_MS);

  return host;
}

/**
 * Handle detected credentials by checking against vault and showing banner.
 */
async function handleDetectedCredentials(creds: ExtractedCredentials): Promise<void> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'check-credentials',
      url: creds.url,
      username: creds.username,
      password: creds.password,
    })) as { result: CredentialCheckResult; itemId?: string };

    if (response.result === 'match') return; // Already saved, nothing to do

    const hostname = new URL(creds.url).hostname.replace(/^www\./, '');

    injectSaveBanner(
      response.result === 'new' ? 'new' : 'update',
      hostname,
      () => {
        const msgType = response.result === 'new' ? 'save-credentials' : 'update-credentials';
        chrome.runtime
          .sendMessage({
            type: msgType,
            url: creds.url,
            username: creds.username,
            password: creds.password,
            itemId: response.itemId,
          })
          .catch(console.error);
      },
      () => {
        /* dismissed */
      }
    );
  } catch {
    // Extension context may be invalidated, silently ignore
  }
}

/**
 * Initialize the save-on-submit detector.
 * Monitors form submissions and intercepts AJAX requests with credentials.
 */
export function initSaveDetector(): void {
  // 1. Monitor form submit events
  document.addEventListener(
    'submit',
    (e: Event) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;

      const creds = extractCredentials(form);
      if (creds) {
        handleDetectedCredentials(creds).catch(() => {});
      }
    },
    { capture: true }
  );

  // 2. Intercept fetch for AJAX form submissions
  const originalFetch = window.fetch;
  window.fetch = function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    try {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST' && init?.body && typeof init.body === 'string') {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const creds = extractCredentialsFromPayload(url, init.body);
        if (creds) {
          // Use page URL as the credential URL, not the API endpoint
          creds.url = window.location.href;
          handleDetectedCredentials(creds).catch(() => {});
        }
      }
    } catch {
      // Never break page functionality
    }
    return originalFetch.call(window, input, init);
  };

  // 3. Intercept XMLHttpRequest for AJAX form submissions
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  const xhrMethodMap = new WeakMap<XMLHttpRequest, string>();

  XMLHttpRequest.prototype.open = function patchedOpen(
    method: string,
    url: string | URL,
    ...rest: [boolean?, string?, string?]
  ): void {
    xhrMethodMap.set(this, method.toUpperCase());
    return originalXHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function patchedSend(
    body?: Document | XMLHttpRequestBodyInit | null
  ): void {
    try {
      const method = xhrMethodMap.get(this);
      if (method === 'POST' && typeof body === 'string') {
        const creds = extractCredentialsFromPayload(window.location.href, body);
        if (creds) {
          handleDetectedCredentials(creds).catch(() => {});
        }
      }
    } catch {
      // Never break page functionality
    }
    return originalXHRSend.call(this, body);
  };
}
