/**
 * Zustand auth store — manages session, keys, and lock state.
 * SECURITY: userKey and masterKey are NEVER persisted to storage.
 * Native apps persist the API session across WebView process restarts so they
 * can reach biometric unlock. Desktop web keeps the session tab-scoped.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { KdfConfig } from '@lockbox/types';
import { isNativeLockboxApp } from '../lib/server-connection.js';

export interface SessionData {
  token: string;
  userId: string;
  email: string;
  encryptedUserKey: string;
  kdfConfig: KdfConfig;
  salt: string;
}

interface AuthState {
  session: SessionData | null;
  userKey: Uint8Array | null; // memory only — NEVER persisted
  masterKey: Uint8Array | null; // memory only — NEVER persisted
  isLocked: boolean;
  lastActivity: number;

  setSession: (session: SessionData) => void;
  setKeys: (masterKey: Uint8Array, userKey: Uint8Array) => void;
  unlockWithUserKey: (userKey: Uint8Array) => void;
  lock: () => void;
  logout: () => void;
  updateActivity: () => void;
}

function sessionPersistenceStorage(): Storage {
  return isNativeLockboxApp() ? localStorage : sessionStorage;
}

const authSessionStorage = {
  getItem: (name: string) => {
    const storage = sessionPersistenceStorage();
    try {
      const value = storage.getItem(name);
      return value ? JSON.parse(value) : null;
    } catch {
      storage.removeItem(name);
      return null;
    }
  },
  setItem: (name: string, value: unknown) => {
    sessionPersistenceStorage().setItem(name, JSON.stringify(value));
  },
  removeItem: (name: string) => {
    // Clear both stores so changing runtime context cannot resurrect a session.
    sessionStorage.removeItem(name);
    localStorage.removeItem(name);
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      userKey: null,
      masterKey: null,
      isLocked: false,
      lastActivity: Date.now(),

      setSession: (session) => set({ session }),

      setKeys: (masterKey, userKey) =>
        set({ masterKey, userKey, isLocked: false, lastActivity: Date.now() }),

      unlockWithUserKey: (userKey) =>
        set({ masterKey: null, userKey, isLocked: false, lastActivity: Date.now() }),

      lock: () => set({ userKey: null, masterKey: null, isLocked: true }),

      logout: () =>
        set({ session: null, userKey: null, masterKey: null, isLocked: false }),

      updateActivity: () => set({ lastActivity: Date.now() }),
    }),
    {
      name: 'lockbox-session',
      storage: authSessionStorage,
      // Only persist session — NEVER persist keys
      partialize: (state) => ({ session: state.session }) as AuthState,
      // Defensive merge: protect memory-only keys from rehydration race conditions.
      // Without this, async rehydration could theoretically replace the entire state
      // (via set(merged, true)) and reset userKey/masterKey to null if the merge
      // runs after setKeys() was called but before the component reads the keys.
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as object),
        userKey: currentState.userKey,
        masterKey: currentState.masterKey,
      }),
    },
  ),
);
