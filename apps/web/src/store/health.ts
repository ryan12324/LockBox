import { create } from 'zustand';
import type { VaultHealthSummary, PasswordHealthReport } from '@lockbox/types';

interface HealthState {
  summary: VaultHealthSummary | null;
  reports: PasswordHealthReport[];
  loading: boolean;
  lastAnalyzed: string | null;
  setSummary: (summary: VaultHealthSummary) => void;
  setReports: (reports: PasswordHealthReport[]) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useHealthStore = create<HealthState>((set) => ({
  summary: null,
  reports: [],
  loading: false,
  lastAnalyzed: null,
  setSummary: (summary) => set({ summary, lastAnalyzed: new Date().toISOString() }),
  setReports: (reports) => set({ reports }),
  setLoading: (loading) => set({ loading }),
  clear: () => set({ summary: null, reports: [], loading: false, lastAnalyzed: null }),
}));
