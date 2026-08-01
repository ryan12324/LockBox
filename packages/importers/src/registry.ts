import { lastPassAdapter } from './lastpass.js';
import type { ImportProviderAdapter, ImportProviderId } from './types.js';

export const importProviderAdapters: readonly ImportProviderAdapter[] = [lastPassAdapter];

export function getImportProvider(id: ImportProviderId): ImportProviderAdapter {
  const provider = importProviderAdapters.find((candidate) => candidate.id === id);
  if (!provider) throw new Error(`Unsupported import provider: ${id}`);
  return provider;
}

export function detectImportProvider(headers: readonly string[]): ImportProviderAdapter | null {
  const ranked = importProviderAdapters
    .map((provider) => ({ provider, score: provider.detect(headers) }))
    .sort((left, right) => right.score - left.score);
  return ranked[0] && ranked[0].score > 0 ? ranked[0].provider : null;
}
