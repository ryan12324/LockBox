/**
 * Embedding providers for semantic search — pluggable interface with a
 * built-in keyword/TF-IDF implementation that requires no ML dependencies.
 *
 * The {@link EmbeddingProvider} interface allows swapping in real ML models
 * (e.g. ONNX, transformers.js) while the default {@link KeywordEmbeddingProvider}
 * uses TF-IDF weighting over a learned vocabulary.
 */
/** Progress callback for long-running initialization (e.g. model download). */
export type ProgressCallback = (progress: {
    loaded: number;
    total: number;
    status: string;
}) => void;
/**
 * Pluggable embedding provider interface.
 *
 * Implementations convert text into fixed-length numeric vectors that can be
 * compared via cosine similarity. The default implementation uses TF-IDF;
 * drop in a real model for higher quality results.
 */
export interface EmbeddingProvider {
    /** Prepare the provider (download model, build vocab, etc.). */
    initialize(onProgress?: ProgressCallback): Promise<boolean>;
    /** Whether the provider is ready to embed. */
    readonly isReady: boolean;
    /** Embed a single text into a fixed-length vector. */
    embed(text: string): Promise<Float32Array>;
    /** Embed multiple texts in one call. */
    embedBatch(texts: string[]): Promise<Float32Array[]>;
    /** Dimensionality of the output vectors. */
    readonly dimensions: number;
}
/**
 * Cosine similarity between two equal-length vectors.
 *
 * Returns a value in [-1, 1] where 1 means identical direction,
 * 0 means orthogonal, and -1 means opposite.
 */
export declare function cosineSimilarity(a: Float32Array, b: Float32Array): number;
/**
 * TF-IDF based embedding provider — no ML dependencies required.
 *
 * Builds a vocabulary from a corpus of texts, then represents each text as a
 * TF-IDF weighted vector over the top N vocabulary terms. Vectors are L2-
 * normalized so cosine similarity works correctly.
 */
export declare class KeywordEmbeddingProvider implements EmbeddingProvider {
    private _isReady;
    private _dimensions;
    private vocabulary;
    private termIndex;
    private idfValues;
    constructor(dimensions?: number);
    get isReady(): boolean;
    get dimensions(): number;
    /**
     * Initialize the provider. For the keyword provider this is a no-op that
     * marks the provider as ready — vocabulary is built lazily via
     * {@link buildVocabulary}.
     */
    initialize(onProgress?: ProgressCallback): Promise<boolean>;
    /**
     * Build (or rebuild) the vocabulary from a corpus of texts.
     *
     * Computes document frequency for each term, selects the top N terms
     * (by DF), and pre-computes IDF values. Must be called before
     * {@link embed} to get meaningful results.
     */
    buildVocabulary(texts: string[]): void;
    /** Embed a single text into a TF-IDF weighted vector. */
    embed(text: string): Promise<Float32Array>;
    /** Embed multiple texts in one call. */
    embedBatch(texts: string[]): Promise<Float32Array[]>;
}
//# sourceMappingURL=embeddings.d.ts.map