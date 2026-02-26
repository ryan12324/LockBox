/**
 * Semantic search engine for vault items — hybrid keyword + embedding search.
 *
 * Privacy-critical: only non-sensitive fields are indexed (names, usernames,
 * URI domains). Passwords, card numbers, CVVs, and TOTP secrets are NEVER
 * included in searchable text.
 */
import type { VaultItem } from '@lockbox/types';
import type { EmbeddingProvider } from './embeddings.js';
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
export declare class SemanticSearch {
    private provider;
    private entries;
    private _isIndexed;
    constructor(provider: EmbeddingProvider);
    /** Whether items have been indexed and are ready for search. */
    get isIndexed(): boolean;
    /**
     * Index a set of vault items for search.
     *
     * Extracts searchable text, builds the embedding provider's vocabulary,
     * and computes embeddings for every item.
     */
    index(items: VaultItem[]): Promise<void>;
    /**
     * Update the index with changed items.
     *
     * Re-extracts text and recomputes embeddings only for the specified items.
     * Items not already in the index are added.
     */
    reindex(changedItems: VaultItem[]): Promise<void>;
    /**
     * Remove items from the index by their IDs.
     */
    removeFromIndex(itemIds: string[]): void;
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
    search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}
//# sourceMappingURL=semantic.d.ts.map