import { create } from 'zustand';
import { createContext, useContext, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { AuraState } from '@lockbox/design';

interface AuraStore {
  state: AuraState;
  setState: (s: AuraState) => void;
}

const useAuraStore = create<AuraStore>((set) => ({
  state: 'idle',
  setState: (state) => set({ state }),
}));

interface AuraContextValue {
  state: AuraState;
  setState: (s: AuraState) => void;
  pulse: () => void;
  startThinking: () => void;
  stopThinking: () => void;
}

const AuraContext = createContext<AuraContextValue | null>(null);

export function AuraProvider({ children }: { children: ReactNode }) {
  const state = useAuraStore((s) => s.state);
  const setState = useAuraStore((s) => s.setState);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPulseTimer = useCallback(() => {
    if (pulseTimer.current) {
      clearTimeout(pulseTimer.current);
      pulseTimer.current = null;
    }
  }, []);

  const clearSearchTimer = useCallback(() => {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
  }, []);

  const pulse = useCallback(() => {
    clearPulseTimer();
    setState('active');
    pulseTimer.current = setTimeout(() => {
      setState('idle');
      pulseTimer.current = null;
    }, 600);
  }, [setState, clearPulseTimer]);

  const startThinking = useCallback(() => {
    setState('thinking');
  }, [setState]);

  const stopThinking = useCallback(() => {
    setState('idle');
  }, [setState]);

  useEffect(() => {
    const onCopy = () => pulse();

    const onSearch = () => {
      clearSearchTimer();
      setState('active');
      searchTimer.current = setTimeout(() => {
        setState('idle');
        searchTimer.current = null;
      }, 1000);
    };

    const onChatThinking = () => setState('thinking');

    window.addEventListener('lockbox:copy', onCopy);
    window.addEventListener('lockbox:search', onSearch);
    window.addEventListener('lockbox:chat-thinking', onChatThinking);

    return () => {
      window.removeEventListener('lockbox:copy', onCopy);
      window.removeEventListener('lockbox:search', onSearch);
      window.removeEventListener('lockbox:chat-thinking', onChatThinking);
      clearPulseTimer();
      clearSearchTimer();
    };
  }, [pulse, setState, clearPulseTimer, clearSearchTimer]);

  return (
    <AuraContext.Provider value={{ state, setState, pulse, startThinking, stopThinking }}>
      {children}
    </AuraContext.Provider>
  );
}

export function useAura(): AuraContextValue {
  const ctx = useContext(AuraContext);
  if (!ctx) {
    throw new Error('useAura must be used within an AuraProvider');
  }
  return ctx;
}
