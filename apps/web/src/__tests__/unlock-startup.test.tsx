// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  status: vi.fn(),
  validateSession: vi.fn(),
  toast: vi.fn(),
  setKeys: vi.fn(),
  unlockWithUserKey: vi.fn(),
  logout: vi.fn(),
  authState: {
    session: null as SessionData | null,
    userKey: null as Uint8Array | null,
    masterKey: null as Uint8Array | null,
  },
}));

interface SessionData {
  token: string;
  userId: string;
  email: string;
  encryptedUserKey: string;
  kdfConfig: {
    type: 'argon2id';
    iterations: number;
    memory: number;
    parallelism: number;
  };
  salt: string;
}

vi.mock('../store/auth.js', () => ({
  useAuthStore: () => ({
    ...mocks.authState,
    setKeys: mocks.setKeys,
    unlockWithUserKey: mocks.unlockWithUserKey,
    logout: mocks.logout,
  }),
}));

vi.mock('../lib/native-biometric.js', () => ({
  authenticateNativeBiometric: mocks.authenticate,
  getNativeBiometricStatus: mocks.status,
  nativeBiometricScope: (accountId: string) => `native-scope#${accountId}`,
}));

vi.mock('../lib/device-unlock-session.js', () => ({
  DeviceUnlockSessionError: class DeviceUnlockSessionError extends Error {
    constructor(message: string, public readonly revoked: boolean) {
      super(message);
    }
  },
  validateDeviceUnlockSession: mocks.validateSession,
}));

vi.mock('../providers/ToastProvider.js', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

import Unlock from '../pages/Unlock.js';

const SESSION: SessionData = {
  token: 'persisted-session-token',
  userId: 'account-a',
  email: 'person@example.test',
  encryptedUserKey: 'encrypted-user-key',
  kdfConfig: { type: 'argon2id', iterations: 3, memory: 65_536, parallelism: 4 },
  salt: 'c2FsdHNhbHRzYWx0MTIzNA==',
};

function renderUnlock() {
  return render(
    <React.StrictMode>
      <MemoryRouter initialEntries={['/unlock']}>
        <Routes>
          <Route path="/unlock" element={<Unlock />} />
          <Route path="/vault" element={<div>Opened vault</div>} />
        </Routes>
      </MemoryRouter>
    </React.StrictMode>
  );
}

describe('native cold-start unlock', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    (globalThis as typeof globalThis & { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
    };
    mocks.authState.session = SESSION;
    mocks.authState.userKey = null;
    mocks.authState.masterKey = null;
    mocks.setKeys.mockReset();
    mocks.unlockWithUserKey.mockReset().mockImplementation((userKey: Uint8Array) => {
      mocks.authState.userKey = userKey;
      mocks.authState.masterKey = null;
    });
    mocks.logout.mockReset();
    mocks.authenticate.mockReset().mockResolvedValue(new Uint8Array(64).fill(0x42));
    mocks.status.mockReset().mockResolvedValue({
      supported: true,
      enrolled: true,
      replacementRequired: false,
      biometryType: 'fingerprint',
    });
    mocks.validateSession.mockReset().mockResolvedValue(undefined);
    mocks.toast.mockReset();
  });

  afterEach(() => {
    cleanup();
    delete (globalThis as typeof globalThis & { Capacitor?: unknown }).Capacitor;
  });

  it('automatically prompts once and unlocks a remembered native session', async () => {
    renderUnlock();

    expect(await screen.findByText('Opened vault')).toBeTruthy();
    expect(mocks.validateSession).toHaveBeenCalledOnce();
    expect(mocks.validateSession).toHaveBeenCalledWith('persisted-session-token', 'account-a');
    expect(mocks.authenticate).toHaveBeenCalledOnce();
    expect(mocks.unlockWithUserKey).toHaveBeenCalledWith(new Uint8Array(64).fill(0x42));
    expect(mocks.authState.masterKey).toBeNull();
  });

  it('does not prompt when biometric enrollment is unavailable', async () => {
    mocks.status.mockResolvedValue({
      supported: true,
      enrolled: false,
      replacementRequired: false,
      biometryType: 'fingerprint',
    });
    renderUnlock();

    await waitFor(() => expect(mocks.status).toHaveBeenCalled());
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Master password')).toBeTruthy();
  });
});
