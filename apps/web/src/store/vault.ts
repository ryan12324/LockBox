import { create } from 'zustand';
import type { Folder } from '@lockbox/types';

interface VaultFilterState {
  selectedFolder: string | null;
  selectedType: string | null;
  showFavorites: boolean;
  folders: Folder[];
  lastUpdated: number;
  setSelectedFolder: (id: string | null) => void;
  setSelectedType: (type: string | null) => void;
  setShowFavorites: (show: boolean) => void;
  setFolders: (folders: Folder[]) => void;
  clearFilters: () => void;
  triggerUpdate: () => void;
}

export const useVaultFilterStore = create<VaultFilterState>((set) => ({
  selectedFolder: null,
  selectedType: null,
  showFavorites: false,
  folders: [],
  lastUpdated: Date.now(),
  setSelectedFolder: (id) => set({ selectedFolder: id }),
  setSelectedType: (type) => set({ selectedType: type }),
  setShowFavorites: (show) => set({ showFavorites: show }),
  setFolders: (folders) => set({ folders }),
  clearFilters: () => set({ selectedFolder: null, selectedType: null, showFavorites: false }),
  triggerUpdate: () => set({ lastUpdated: Date.now() }),
}));
