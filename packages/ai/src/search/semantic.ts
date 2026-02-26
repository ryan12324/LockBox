/**
 * Semantic search engine for vault items — hybrid keyword + embedding search.
 *
 * Privacy-critical: only non-sensitive fields are indexed (names, usernames,
 * URI domains). Passwords, card numbers, CVVs, and TOTP secrets are NEVER
 * included in searchable text.
 */

import type { VaultItem, LoginItem, SecureNoteItem, CardItem } from '@lockbox/types';
import type { EmbeddingProvider } from './embeddings.js';
import { cosineSimilarity } from './embeddings.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single search result with relevance score and match type. */
export interface SearchResult {
  /** The matched vault item. */
  item: VaultItem;
  /** Relevance score between 0 and 1. */
  score: number;
  /** How the match was found. */
  matchType: 'semantic' | 'keyword' | 'exact';
}

/** Options for controlling search behavior. */
export interface SearchOptions {
  /** Maximum number of results to return. Defaults to 20. */
  limit?: number;
  /** Minimum relevance score (0–1). Results below this are excluded. Defaults to 0.1. */
  minScore?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Score boost applied to exact substring matches, capped at 1.0. */
const EXACT_MATCH_BOOST = 0.3;

/** Default maximum number of results. */
const DEFAULT_LIMIT = 20;

/** Default minimum score threshold. */
const DEFAULT_MIN_SCORE = 0.1;

// ---------------------------------------------------------------------------
// Text extraction (privacy-critical)
// ---------------------------------------------------------------------------

/**
 * Extract a domain from a URI string.
 *
 * Handles both full URLs and bare hostnames. Returns the hostname without
 * protocol, path, or port.
 */
function extractDomain(uri: string): string {
  try {
    // Handle URIs that look like full URLs
    if (uri.includes('://')) {
      const url = new URL(uri);
      return url.hostname;
    }
    // Bare hostname or domain — strip any path
    return uri.split('/')[0];
  } catch {
    // Malformed URI — return as-is, stripped of slashes
    return uri.replace(/[/\\]/g, '');
  }
}

/**
 * Extract searchable text from a vault item.
 *
 * **PRIVACY-CRITICAL:** Only non-sensitive fields are included:
 * - LoginItem: name, username, URI domains
 * - SecureNoteItem: name only (content is NOT searchable)
 * - CardItem: name only (card details are NOT searchable)
 *
 * Passwords, card numbers, CVVs, and TOTP secrets are NEVER included.
 */
function extractSearchableText(item: VaultItem): string {
  switch (item.type) {
    case 'login': {
      const login = item as LoginItem;
      const domains = login.uris.map(extractDomain).join(' ');
      return `${login.name} ${login.username} ${domains}`.trim();
    }
    case 'note': {
      const note = item as SecureNoteItem;
      return note.name;
    }
    case 'card': {
      const card = item as CardItem;
      return card.name;
    }
    default:
      return item.name;
  }
}

// ---------------------------------------------------------------------------
// Keyword fallback
// ---------------------------------------------------------------------------

/**
 * Simple keyword matching fallback when the embedding provider is not ready.
 *
 * Splits the query into words and counts how many appear (as substrings) in
 * the item's searchable text. Score = matchingWords / totalQueryWords.
 */
function keywordFallbackScore(query: string, itemText: string): number {
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (queryWords.length === 0) return 0;

  const lowerText = itemText.toLowerCase();
  let matches = 0;
  for (const word of queryWords) {
    if (lowerText.includes(word)) {
      matches++;
    }
  }

  return matches / queryWords.length;
}

/**
 * Check whether any query word is an exact substring match in the item text.
 * Used for the +0.3 exact match boost.
 */
function hasExactMatch(query: string, itemText: string): boolean {
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  const lowerText = itemText.toLowerCase();
  return queryWords.some((word) => lowerText.includes(word));
}

// ---------------------------------------------------------------------------
// SemanticSearch
// ---------------------------------------------------------------------------

/** Indexed entry — item + its precomputed embedding and text. */
interface IndexEntry {
  item: VaultItem;
  text: string;
  embedding: Float32Array | null;
}

/**
 * Hybrid semantic + keyword search engine for vault items.
 *
 * Combines embedding-based similarity (via a pluggable {@link EmbeddingProvider})
 * with exact keyword matching. Falls back to pure keyword matching when the
 * provider is not ready.
 *
 * @example
 * ```ts
 * const provider = new KeywordEmbeddingProvider();
 * await provider.initialize();
 *
 * const search = new SemanticSearch(provider);
 * await search.index(vaultItems);
 *
 * const results = await search.search('github');
 * ```
 */
export class SemanticSearch {
  private provider: EmbeddingProvider;
  private entries: Map<string, IndexEntry> = new Map();
  private _isIndexed = false;

  constructor(provider: EmbeddingProvider) {
    this.provider = provider;
  }

  /** Whether items have been indexed and are ready for search. */
  get isIndexed(): boolean {
    return this._isIndexed;
  }

  /**
   * Index a set of vault items for search.
   *
   * Extracts searchable text, builds the embedding provider's vocabulary,
   * and computes embeddings for every item.
   */
  async index(items: VaultItem[]): Promise<void> {
    this.entries = new Map();

    // Extract text for all items
    const texts: string[] = [];
    const itemRefs: VaultItem[] = [];

    for (const item of items) {
      const text = extractSearchableText(item);
      texts.push(text);
      itemRefs.push(item);
    }

    // Build vocabulary if provider supports it (KeywordEmbeddingProvider)
    if ('buildVocabulary' in this.provider) {
      (this.provider as { buildVocabulary(texts: string[]): void }).buildVocabulary(texts);
    }

    // Compute embeddings if provider is ready
    let embeddings: Float32Array[] | null = null;
    if (this.provider.isReady) {
      embeddings = await this.provider.embedBatch(texts);
    }

    // Store entries
    for (let i = 0; i < items.length; i++) {
      this.entries.set(items[i].id, {
        item: items[i],
        text: texts[i],
        embedding: embeddings ? embeddings[i] : null,
      });
    }

    this._isIndexed = true;
  }

  /**
   * Update the index with changed items.
   *
   * Re-extracts text and recomputes embeddings only for the specified items.
   * Items not already in the index are added.
   */
  async reindex(changedItems: VaultItem[]): Promise<void> {
    for (const item of changedItems) {
      const text = extractSearchableText(item);
      let embedding: Float32Array | null = null;

      if (this.provider.isReady) {
        embedding = await this.provider.embed(text);
      }

      this.entries.set(item.id, { item, text, embedding });
    }
  }

  /**
   * Remove items from the index by their IDs.
   */
  removeFromIndex(itemIds: string[]): void {
    for (const id of itemIds) {
      this.entries.delete(id);
    }
  }

  /**
   * Search the indexed vault items.
   *
   * Algorithm:
   * 1. Embed the query → cosine similarity against all indexed embeddings
   * 2. Also check exact keyword matches (substring on name, username, domains)
   * 3. Exact matches get +0.3 boost (capped at 1.0)
   * 4. Combine, deduplicate, sort by score descending
   * 5. Apply limit and minScore filters
   *
   * Falls back to pure keyword matching if the provider is not ready.
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const limit = options?.limit ?? DEFAULT_LIMIT;
    const minScore = options?.minScore ?? DEFAULT_MIN_SCORE;

    if (query.trim().length === 0) return [];
    if (this.entries.size === 0) return [];

    const results: SearchResult[] = [];
    const useEmbeddings = this.provider.isReady;

    // Embed the query if provider is ready
    let queryEmbedding: Float32Array | null = null;
    if (useEmbeddings) {
      queryEmbedding = await this.provider.embed(query);
    }

    for (const entry of this.entries.values()) {
      let score = 0;
      let matchType: SearchResult['matchType'] = 'keyword';

      if (useEmbeddings && queryEmbedding && entry.embedding) {
        // Semantic similarity
        const similarity = cosineSimilarity(queryEmbedding, entry.embedding);
        // TF-IDF vectors are non-negative, so cosine is naturally in [0,1]
        score = Math.max(0, similarity);
        matchType = 'semantic';
      } else {
        // Keyword fallback
        score = keywordFallbackScore(query, entry.text);
      }

      // Exact match boost
      const exact = hasExactMatch(query, entry.text);
      if (exact) {
        score = Math.min(1, score + EXACT_MATCH_BOOST);
        matchType = 'exact';
      }

      if (score >= minScore) {
        results.push({ item: entry.item, score, matchType });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Apply limit
    return results.slice(0, limit);
  }
}
