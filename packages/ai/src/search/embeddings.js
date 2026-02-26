/**
 * Embedding providers for semantic search — pluggable interface with a
 * built-in keyword/TF-IDF implementation that requires no ML dependencies.
 *
 * The {@link EmbeddingProvider} interface allows swapping in real ML models
 * (e.g. ONNX, transformers.js) while the default {@link KeywordEmbeddingProvider}
 * uses TF-IDF weighting over a learned vocabulary.
 */
// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------
/**
 * Cosine similarity between two equal-length vectors.
 *
 * Returns a value in [-1, 1] where 1 means identical direction,
 * 0 means orthogonal, and -1 means opposite.
 */
export function cosineSimilarity(a, b) {
    if (a.length !== b.length) {
        throw new Error(`Vector length mismatch: ${String(a.length)} vs ${String(b.length)}`);
    }
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    if (denom === 0)
        return 0;
    return dot / denom;
}
// ---------------------------------------------------------------------------
// Keyword / TF-IDF provider
// ---------------------------------------------------------------------------
/** Common English stop words filtered during tokenization. */
const STOP_WORDS = new Set([
    'the',
    'is',
    'at',
    'which',
    'on',
    'a',
    'an',
    'in',
    'for',
    'to',
    'of',
    'and',
    'or',
    'it',
    'its',
    'this',
    'that',
    'with',
    'from',
    'by',
    'as',
    'be',
    'was',
    'were',
    'are',
    'been',
    'has',
    'have',
    'had',
    'do',
    'does',
    'did',
    'but',
    'not',
    'so',
    'if',
    'no',
    'nor',
    'too',
    'very',
    'can',
    'will',
    'just',
    'my',
    'your',
    'his',
    'her',
    'our',
    'their',
    'me',
    'him',
    'us',
    'them',
    'i',
    'you',
    'he',
    'she',
    'we',
    'they',
    'what',
    'who',
    'how',
    'when',
    'where',
    'why',
]);
/**
 * Tokenize text into lowercase terms, filtering stop words and single chars.
 */
function tokenize(text) {
    return text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}
/**
 * TF-IDF based embedding provider — no ML dependencies required.
 *
 * Builds a vocabulary from a corpus of texts, then represents each text as a
 * TF-IDF weighted vector over the top N vocabulary terms. Vectors are L2-
 * normalized so cosine similarity works correctly.
 */
export class KeywordEmbeddingProvider {
    _isReady = false;
    _dimensions;
    vocabulary = [];
    termIndex = new Map();
    idfValues = new Map();
    constructor(dimensions = 512) {
        this._dimensions = dimensions;
    }
    get isReady() {
        return this._isReady;
    }
    get dimensions() {
        return this._dimensions;
    }
    /**
     * Initialize the provider. For the keyword provider this is a no-op that
     * marks the provider as ready — vocabulary is built lazily via
     * {@link buildVocabulary}.
     */
    async initialize(onProgress) {
        onProgress?.({ loaded: 1, total: 1, status: 'Keyword provider ready' });
        this._isReady = true;
        return true;
    }
    /**
     * Build (or rebuild) the vocabulary from a corpus of texts.
     *
     * Computes document frequency for each term, selects the top N terms
     * (by DF), and pre-computes IDF values. Must be called before
     * {@link embed} to get meaningful results.
     */
    buildVocabulary(texts) {
        const docFreq = new Map();
        const totalDocs = texts.length;
        // Count document frequency for each term
        for (const text of texts) {
            const uniqueTerms = new Set(tokenize(text));
            for (const term of uniqueTerms) {
                docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
            }
        }
        // Sort by document frequency (descending), take top N
        const sorted = [...docFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, this._dimensions);
        this.vocabulary = sorted.map(([term]) => term);
        this.termIndex = new Map(this.vocabulary.map((term, i) => [term, i]));
        // Compute IDF: log(totalDocs / df) — standard TF-IDF formula
        this.idfValues = new Map();
        for (const [term, df] of sorted) {
            this.idfValues.set(term, Math.log((totalDocs + 1) / (df + 1)) + 1);
        }
    }
    /** Embed a single text into a TF-IDF weighted vector. */
    async embed(text) {
        const vector = new Float32Array(this._dimensions);
        const tokens = tokenize(text);
        if (tokens.length === 0)
            return vector;
        // Compute term frequencies
        const tf = new Map();
        for (const token of tokens) {
            tf.set(token, (tf.get(token) ?? 0) + 1);
        }
        // Fill vector with TF-IDF weights
        for (const [term, count] of tf) {
            const idx = this.termIndex.get(term);
            if (idx !== undefined) {
                const termFreq = count / tokens.length;
                const idf = this.idfValues.get(term) ?? 1;
                vector[idx] = termFreq * idf;
            }
        }
        // L2 normalize
        normalize(vector);
        return vector;
    }
    /** Embed multiple texts in one call. */
    async embedBatch(texts) {
        const results = [];
        for (const text of texts) {
            results.push(await this.embed(text));
        }
        return results;
    }
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/** L2-normalize a vector in place. */
function normalize(vector) {
    let sum = 0;
    for (let i = 0; i < vector.length; i++) {
        sum += vector[i] * vector[i];
    }
    const mag = Math.sqrt(sum);
    if (mag > 0) {
        for (let i = 0; i < vector.length; i++) {
            vector[i] /= mag;
        }
    }
}
//# sourceMappingURL=embeddings.js.map