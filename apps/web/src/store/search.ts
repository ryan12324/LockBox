import { create } from 'zustand';
import { SemanticSearch, KeywordEmbeddingProvider } from '@lockbox/ai';
import type { VaultItem } from '@lockbox/types';
import type { SearchResult } from '@lockbox/ai';

interface SearchState {
  engine: SemanticSearch | null;
  indexed: boolean;
  searching: boolean;
  results: SearchResult[];
  query: string;

  initEngine: () => void;
  indexItems: (items: VaultItem[]) => Promise<void>;
  search: (query: string) => Promise<void>;
  clear: () => void;
}

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

export const useSearchStore = create<SearchState>((set, get) => ({
  engine: null,
  indexed: false,
  searching: false,
  results: [],
  query: '',

  initEngine: () => {
    if (get().engine) return;
    const provider = new KeywordEmbeddingProvider();
    const engine = new SemanticSearch(provider);

    // We don't await here as it's meant to be called on init.
    provider.initialize().then(() => {
      set({ engine });
    });
  },

  indexItems: async (items: VaultItem[]) => {
    let { engine } = get();
    if (!engine) {
      const provider = new KeywordEmbeddingProvider();
      await provider.initialize();
      engine = new SemanticSearch(provider);
      set({ engine });
    }

    await engine.index(items);
    set({ indexed: true });
  },

  search: async (query: string) => {
    set({ query, searching: query.trim().length > 0 });

    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    if (!query.trim()) {
      set({ results: [], searching: false });
      return;
    }

    // Debounce search
    return new Promise<void>((resolve) => {
      searchTimeout = setTimeout(async () => {
        const { engine, indexed } = get();
        if (!engine || !indexed) {
          set({ searching: false });
          resolve();
          return;
        }

        try {
          const results = await engine.search(query);
          set({ results, searching: false });
        } catch (err) {
          console.error('Search error:', err);
          set({ results: [], searching: false });
        }
        resolve();
      }, 300);
    });
  },

  clear: () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    set({ query: '', results: [], searching: false });
  },
}));
