/**
 * Tests for the Zustand auth store.
 * Verifies session management, key storage (memory-only), and lock/logout behavior.
 */

// Mock sessionStorage before importing the store (Zustand persist middleware needs it)
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
  configurable: true,
});

import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../store/auth.js';
import type { KdfConfig } from '@lockbox/types';
const TEST_KDF_CONFIG: KdfConfig = {
  type: 'argon2id',
  iterations: 3,
  memory: 65536,
  parallelism: 4,
};

const TEST_SESSION = {
  token: 'test-token-abc123',
  userId: 'user-id-123',
  email: 'test@lockbox.dev',
  encryptedUserKey: 'base64-encrypted-user-key',
  kdfConfig: TEST_KDF_CONFIG,
  salt: 'base64-salt',
};

function resetStore() {
  useAuthStore.setState({
    session: null,
    userKey: null,
    masterKey: null,
    isLocked: false,
    lastActivity: Date.now(),
  });
}

describe('useAuthStore', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('initial state', () => {
    it('starts with no session', () => {
      const { session } = useAuthStore.getState();
      expect(session).toBeNull();
    });

    it('starts with no keys', () => {
      const { userKey, masterKey } = useAuthStore.getState();
      expect(userKey).toBeNull();
      expect(masterKey).toBeNull();
    });

    it('starts unlocked', () => {
      const { isLocked } = useAuthStore.getState();
      expect(isLocked).toBe(false);
    });
  });

  describe('setSession', () => {
    it('stores session data', () => {
      useAuthStore.getState().setSession(TEST_SESSION);
      const { session } = useAuthStore.getState();
      expect(session).not.toBeNull();
      expect(session?.token).toBe('test-token-abc123');
      expect(session?.email).toBe('test@lockbox.dev');
    });

    it('stores kdfConfig in session', () => {
      useAuthStore.getState().setSession(TEST_SESSION);
      const { session } = useAuthStore.getState();
      expect(session?.kdfConfig.type).toBe('argon2id');
      expect(session?.kdfConfig.iterations).toBe(3);
    });
  });

  describe('setKeys', () => {
    it('stores keys in memory', () => {
      const masterKey = new Uint8Array(32).fill(0x01);
      const userKey = new Uint8Array(64).fill(0x02);

      useAuthStore.getState().setKeys(masterKey, userKey);

      const state = useAuthStore.getState();
      expect(state.masterKey).not.toBeNull();
      expect(state.userKey).not.toBeNull();
    });

    it('sets isLocked to false when keys are set', () => {
      // First lock the vault
      useAuthStore.setState({ isLocked: true });

      const masterKey = new Uint8Array(32).fill(0x01);
      const userKey = new Uint8Array(64).fill(0x02);
      useAuthStore.getState().setKeys(masterKey, userKey);

      expect(useAuthStore.getState().isLocked).toBe(false);
    });

    it('updates lastActivity when keys are set', () => {
      const before = Date.now();
      const masterKey = new Uint8Array(32).fill(0x01);
      const userKey = new Uint8Array(64).fill(0x02);
      useAuthStore.getState().setKeys(masterKey, userKey);
      const after = Date.now();

      const { lastActivity } = useAuthStore.getState();
      expect(lastActivity).toBeGreaterThanOrEqual(before);
      expect(lastActivity).toBeLessThanOrEqual(after);
    });
  });

  describe('lock', () => {
    it('clears keys from memory', () => {
      const masterKey = new Uint8Array(32).fill(0x01);
      const userKey = new Uint8Array(64).fill(0x02);
      useAuthStore.getState().setKeys(masterKey, userKey);
      useAuthStore.getState().lock();

      const state = useAuthStore.getState();
      expect(state.masterKey).toBeNull();
      expect(state.userKey).toBeNull();
    });

    it('sets isLocked to true', () => {
      useAuthStore.getState().lock();
      expect(useAuthStore.getState().isLocked).toBe(true);
    });

    it('preserves session after lock (token still available for re-auth)', () => {
      useAuthStore.getState().setSession(TEST_SESSION);
      useAuthStore.getState().lock();

      // Session should still be there (needed to show unlock screen)
      expect(useAuthStore.getState().session).not.toBeNull();
      expect(useAuthStore.getState().session?.token).toBe('test-token-abc123');
    });
  });

  describe('logout', () => {
    it('clears session', () => {
      useAuthStore.getState().setSession(TEST_SESSION);
      useAuthStore.getState().logout();
      expect(useAuthStore.getState().session).toBeNull();
    });

    it('clears keys', () => {
      const masterKey = new Uint8Array(32).fill(0x01);
      const userKey = new Uint8Array(64).fill(0x02);
      useAuthStore.getState().setKeys(masterKey, userKey);
      useAuthStore.getState().logout();

      expect(useAuthStore.getState().masterKey).toBeNull();
      expect(useAuthStore.getState().userKey).toBeNull();
    });

    it('sets isLocked to false after logout', () => {
      useAuthStore.setState({ isLocked: true });
      useAuthStore.getState().logout();
      expect(useAuthStore.getState().isLocked).toBe(false);
    });
  });

  describe('updateActivity', () => {
    it('updates lastActivity timestamp', () => {
      const before = Date.now();
      useAuthStore.getState().updateActivity();
      const after = Date.now();

      const { lastActivity } = useAuthStore.getState();
      expect(lastActivity).toBeGreaterThanOrEqual(before);
      expect(lastActivity).toBeLessThanOrEqual(after);
    });
  });

  describe('security invariants', () => {
    it('keys are null after lock (not persisted)', () => {
      const masterKey = new Uint8Array(32).fill(0x01);
      const userKey = new Uint8Array(64).fill(0x02);
      useAuthStore.getState().setKeys(masterKey, userKey);

      // Verify keys are set
      expect(useAuthStore.getState().masterKey).not.toBeNull();
      expect(useAuthStore.getState().userKey).not.toBeNull();

      // Lock clears them
      useAuthStore.getState().lock();
      expect(useAuthStore.getState().masterKey).toBeNull();
      expect(useAuthStore.getState().userKey).toBeNull();
    });

    it('keys are null after logout', () => {
      const masterKey = new Uint8Array(32).fill(0x01);
      const userKey = new Uint8Array(64).fill(0x02);
      useAuthStore.getState().setKeys(masterKey, userKey);
      useAuthStore.getState().logout();

      expect(useAuthStore.getState().masterKey).toBeNull();
      expect(useAuthStore.getState().userKey).toBeNull();
    });
  });
});
