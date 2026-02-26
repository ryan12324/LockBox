/**
 * Zustand auth store — manages session, keys, and lock state.
 * SECURITY: userKey and masterKey are NEVER persisted to storage.
 * Only the session token (for API calls) is persisted to sessionStorage.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { KdfConfig } from '@lockbox/types';

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
  lock: () => void;
  logout: () => void;
  updateActivity: () => void;
}

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

      lock: () => set({ userKey: null, masterKey: null, isLocked: true }),

      logout: () =>
        set({ session: null, userKey: null, masterKey: null, isLocked: false }),

      updateActivity: () => set({ lastActivity: Date.now() }),
    }),
    {
      name: 'lockbox-session',
      storage: {
        getItem: (name) => {
          const value = sessionStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: (name, value) => sessionStorage.setItem(name, JSON.stringify(value)),
        removeItem: (name) => sessionStorage.removeItem(name),
      },
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
