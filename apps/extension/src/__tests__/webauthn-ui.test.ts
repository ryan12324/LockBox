import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  showCreateConsent,
  showGetConsent,
  showPasskeyPicker,
  showVaultLockedToast,
} from '../../lib/webauthn-ui.js';

beforeEach(() => {
  (globalThis as Record<string, unknown>).chrome = {
    runtime: { id: 'test-extension-id' },
  };
});

afterEach(() => {
  document.documentElement
    .querySelectorAll('[id^="lockbox-webauthn"]')
    .forEach((el) => el.remove());
  delete (globalThis as Record<string, unknown>).chrome;
});

// ─── showCreateConsent ──────────────────────────────────────────────────────

describe('showCreateConsent', () => {
  it('renders modal with RP and user details', async () => {
    const promise = showCreateConsent({
      rpName: 'Example Corp',
      rpId: 'example.com',
      userName: 'alice@example.com',
      userDisplayName: 'Alice',
    });

    const host = document.getElementById('lockbox-webauthn-create-consent');
    expect(host).not.toBeNull();

    const shadow = host!.shadowRoot!;
    expect(shadow.querySelector('.modal-title')!.textContent).toBe('Create a passkey');
    expect(shadow.innerHTML).toContain('Example Corp');
    expect(shadow.innerHTML).toContain('example.com');
    expect(shadow.innerHTML).toContain('Alice');

    (shadow.querySelector('[data-action="confirm"]') as HTMLButtonElement).click();
    expect(await promise).toBe(true);

    expect(document.getElementById('lockbox-webauthn-create-consent')).toBeNull();
  });

  it('returns false when user cancels', async () => {
    const promise = showCreateConsent({
      rpName: 'Test',
      rpId: 'test.com',
      userName: 'bob',
      userDisplayName: 'Bob',
    });

    const shadow = document.getElementById('lockbox-webauthn-create-consent')!.shadowRoot!;
    (shadow.querySelector('[data-action="cancel"]') as HTMLButtonElement).click();
    expect(await promise).toBe(false);
  });

  it('returns false when backdrop is clicked', async () => {
    const promise = showCreateConsent({
      rpName: 'Test',
      rpId: 'test.com',
      userName: 'user',
      userDisplayName: 'User',
    });

    const shadow = document.getElementById('lockbox-webauthn-create-consent')!.shadowRoot!;
    const overlay = shadow.querySelector('.overlay') as HTMLElement;
    overlay.click();
    expect(await promise).toBe(false);
  });

  it('returns false when Escape is pressed', async () => {
    const promise = showCreateConsent({
      rpName: 'Test',
      rpId: 'test.com',
      userName: 'user',
      userDisplayName: 'User',
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(await promise).toBe(false);
  });

  it('returns false when chrome.runtime is unavailable', async () => {
    (globalThis as Record<string, unknown>).chrome = { runtime: {} };
    const result = await showCreateConsent({
      rpName: 'Test',
      rpId: 'test.com',
      userName: 'user',
      userDisplayName: 'User',
    });
    expect(result).toBe(false);
  });

  it('replaces existing overlay if one is already open', async () => {
    const first = showCreateConsent({
      rpName: 'First',
      rpId: 'first.com',
      userName: 'user1',
      userDisplayName: 'User1',
    });

    const second = showCreateConsent({
      rpName: 'Second',
      rpId: 'second.com',
      userName: 'user2',
      userDisplayName: 'User2',
    });

    const hosts = document.querySelectorAll('#lockbox-webauthn-create-consent');
    expect(hosts.length).toBe(1);

    const shadow = hosts[0].shadowRoot!;
    expect(shadow.innerHTML).toContain('Second');

    (shadow.querySelector('[data-action="confirm"]') as HTMLButtonElement).click();
    expect(await second).toBe(true);
  });
});

// ─── showGetConsent ─────────────────────────────────────────────────────────

describe('showGetConsent', () => {
  it('renders sign-in modal with account and site details', async () => {
    const promise = showGetConsent({
      rpName: 'Example Corp',
      rpId: 'example.com',
      userName: 'alice@example.com',
      userDisplayName: 'Alice',
      credentialId: 'cred-123',
    });

    const host = document.getElementById('lockbox-webauthn-get-consent');
    expect(host).not.toBeNull();

    const shadow = host!.shadowRoot!;
    expect(shadow.querySelector('.modal-title')!.textContent).toBe('Sign in with passkey');
    expect(shadow.innerHTML).toContain('Alice');
    expect(shadow.innerHTML).toContain('example.com');

    (shadow.querySelector('[data-action="confirm"]') as HTMLButtonElement).click();
    expect(await promise).toBe(true);
  });

  it('returns false when user cancels', async () => {
    const promise = showGetConsent({
      rpName: 'Test',
      rpId: 'test.com',
      userName: 'user',
      userDisplayName: 'User',
      credentialId: 'cred-abc',
    });

    const shadow = document.getElementById('lockbox-webauthn-get-consent')!.shadowRoot!;
    (shadow.querySelector('[data-action="cancel"]') as HTMLButtonElement).click();
    expect(await promise).toBe(false);
  });

  it('shows userName when no displayName differs', async () => {
    const promise = showGetConsent({
      rpName: 'Test',
      rpId: 'test.com',
      userName: 'samename',
      userDisplayName: 'samename',
      credentialId: 'c',
    });

    const shadow = document.getElementById('lockbox-webauthn-get-consent')!.shadowRoot!;
    expect(shadow.innerHTML).toContain('samename');

    (shadow.querySelector('[data-action="cancel"]') as HTMLButtonElement).click();
    await promise;
  });
});

// ─── showPasskeyPicker ──────────────────────────────────────────────────────

describe('showPasskeyPicker', () => {
  const passkeys = [
    {
      credentialId: 'cred-1',
      userName: 'alice@corp.com',
      userDisplayName: 'Alice',
      rpName: 'Corp',
    },
    { credentialId: 'cred-2', userName: 'bob@corp.com', userDisplayName: 'Bob', rpName: 'Corp' },
  ];

  it('renders a list of passkeys', async () => {
    const promise = showPasskeyPicker(passkeys);

    const host = document.getElementById('lockbox-webauthn-picker');
    expect(host).not.toBeNull();

    const shadow = host!.shadowRoot!;
    const items = shadow.querySelectorAll('.passkey-item');
    expect(items.length).toBe(2);
    expect(shadow.innerHTML).toContain('Alice');
    expect(shadow.innerHTML).toContain('Bob');

    (items[1] as HTMLElement).click();
    const result = await promise;
    expect(result).toEqual({ credentialId: 'cred-2' });
  });

  it('returns null when cancelled', async () => {
    const promise = showPasskeyPicker(passkeys);

    const shadow = document.getElementById('lockbox-webauthn-picker')!.shadowRoot!;
    (shadow.querySelector('.cancel-btn') as HTMLButtonElement).click();
    expect(await promise).toBeNull();
  });

  it('returns null on backdrop click', async () => {
    const promise = showPasskeyPicker(passkeys);

    const shadow = document.getElementById('lockbox-webauthn-picker')!.shadowRoot!;
    const overlay = shadow.querySelector('.overlay') as HTMLElement;
    overlay.click();
    expect(await promise).toBeNull();
  });

  it('returns null on Escape key', async () => {
    const promise = showPasskeyPicker(passkeys);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(await promise).toBeNull();
  });
});

// ─── showVaultLockedToast ───────────────────────────────────────────────────

describe('showVaultLockedToast', () => {
  it('renders a toast notification', () => {
    showVaultLockedToast();
    const host = document.getElementById('lockbox-webauthn-locked-toast');
    expect(host).not.toBeNull();

    const shadow = host!.shadowRoot!;
    expect(shadow.innerHTML).toContain('Lockbox is locked');
    expect(shadow.innerHTML).toContain('Unlock to use passkeys');
  });

  it('calls onOpenLockbox when action button is clicked', () => {
    const callback = vi.fn();
    showVaultLockedToast(callback);

    const shadow = document.getElementById('lockbox-webauthn-locked-toast')!.shadowRoot!;
    (shadow.querySelector('.toast-action') as HTMLButtonElement).click();

    expect(callback).toHaveBeenCalledOnce();
    expect(document.getElementById('lockbox-webauthn-locked-toast')).toBeNull();
  });

  it('removes toast when dismiss is clicked', () => {
    showVaultLockedToast();

    const shadow = document.getElementById('lockbox-webauthn-locked-toast')!.shadowRoot!;
    (shadow.querySelector('.toast-dismiss') as HTMLButtonElement).click();

    expect(document.getElementById('lockbox-webauthn-locked-toast')).toBeNull();
  });

  it('replaces duplicate toasts', () => {
    showVaultLockedToast();
    showVaultLockedToast();

    const hosts = document.querySelectorAll('#lockbox-webauthn-locked-toast');
    expect(hosts.length).toBe(1);
  });

  it('auto-dismisses after timeout', () => {
    vi.useFakeTimers();
    showVaultLockedToast();
    expect(document.getElementById('lockbox-webauthn-locked-toast')).not.toBeNull();

    vi.advanceTimersByTime(8000);
    expect(document.getElementById('lockbox-webauthn-locked-toast')).toBeNull();

    vi.useRealTimers();
  });
});
