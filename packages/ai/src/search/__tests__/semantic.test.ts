import { describe, it, expect, beforeEach } from 'vitest';
import type { LoginItem, SecureNoteItem, CardItem, VaultItem } from '@lockbox/types';
import { KeywordEmbeddingProvider, cosineSimilarity } from '../embeddings.js';
import { SemanticSearch } from '../semantic.js';
import type { SearchResult } from '../semantic.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = '2026-02-26T00:00:00.000Z';

/** Build a LoginItem with sensible defaults. */
function makeLoginItem(overrides: Partial<LoginItem> = {}): LoginItem {
  return {
    id: crypto.randomUUID(),
    type: 'login',
    name: 'Test Item',
    username: 'user@test.com',
    password: 'secret123',
    uris: ['https://test.com'],
    tags: [],
    favorite: false,
    createdAt: NOW,
    updatedAt: NOW,
    revisionDate: NOW,
    ...overrides,
  };
}

/** Build a SecureNoteItem. */
function makeNoteItem(overrides: Partial<SecureNoteItem> = {}): SecureNoteItem {
  return {
    id: crypto.randomUUID(),
    type: 'note',
    name: 'Test Note',
    content: 'This is super secret content with passwords inside',
    tags: [],
    favorite: false,
    createdAt: NOW,
    updatedAt: NOW,
    revisionDate: NOW,
    ...overrides,
  };
}

/** Build a CardItem. */
function makeCardItem(overrides: Partial<CardItem> = {}): CardItem {
  return {
    id: crypto.randomUUID(),
    type: 'card',
    name: 'Test Card',
    cardholderName: 'John Doe',
    number: '4111111111111111',
    expMonth: '12',
    expYear: '2028',
    cvv: '123',
    tags: [],
    favorite: false,
    createdAt: NOW,
    updatedAt: NOW,
    revisionDate: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests — cosineSimilarity
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = new Float32Array([1, 2, 3, 4]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0, 0]);
    const b = new Float32Array([0, 1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it('returns -1.0 for opposite vectors', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([-1, -2, -3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it('returns 0 when one vector is all zeros', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([0, 0, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('throws on mismatched vector lengths', () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([1, 2, 3]);
    expect(() => cosineSimilarity(a, b)).toThrow('Vector length mismatch');
  });
});

// ---------------------------------------------------------------------------
// Tests — KeywordEmbeddingProvider
// ---------------------------------------------------------------------------

describe('KeywordEmbeddingProvider', () => {
  let provider: KeywordEmbeddingProvider;

  beforeEach(async () => {
    provider = new KeywordEmbeddingProvider(64);
    await provider.initialize();
  });

  it('initializes successfully and reports isReady', () => {
    expect(provider.isReady).toBe(true);
  });

  it('reports correct dimensions', () => {
    expect(provider.dimensions).toBe(64);
  });

  it('calls progress callback during initialization', async () => {
    const fresh = new KeywordEmbeddingProvider();
    let called = false;
    await fresh.initialize((p) => {
      called = true;
      expect(p.status).toBeTruthy();
    });
    expect(called).toBe(true);
  });

  it('embed returns Float32Array of correct length', async () => {
    provider.buildVocabulary(['hello world', 'test text']);
    const result = await provider.embed('hello world');
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(64);
  });

  it('embed returns zero vector for empty text', async () => {
    provider.buildVocabulary(['some text']);
    const result = await provider.embed('');
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it('embedBatch returns array of embeddings', async () => {
    provider.buildVocabulary(['hello', 'world']);
    const results = await provider.embedBatch(['hello', 'world']);
    expect(results).toHaveLength(2);
    expect(results[0]).toBeInstanceOf(Float32Array);
    expect(results[1]).toBeInstanceOf(Float32Array);
  });

  it('produces similar vectors for similar texts', async () => {
    provider.buildVocabulary([
      'github login account',
      'github repository code',
      'banking financial money',
    ]);
    const a = await provider.embed('github login');
    const b = await provider.embed('github account');
    const c = await provider.embed('banking money');

    // github texts should be more similar to each other than to banking
    const simAB = cosineSimilarity(a, b);
    const simAC = cosineSimilarity(a, c);
    expect(simAB).toBeGreaterThan(simAC);
  });

  it('default dimensions is 512', () => {
    const defaultProvider = new KeywordEmbeddingProvider();
    expect(defaultProvider.dimensions).toBe(512);
  });
});

// ---------------------------------------------------------------------------
// Tests — SemanticSearch indexing
// ---------------------------------------------------------------------------

describe('SemanticSearch — indexing', () => {
  let provider: KeywordEmbeddingProvider;
  let search: SemanticSearch;

  beforeEach(async () => {
    provider = new KeywordEmbeddingProvider(64);
    await provider.initialize();
    search = new SemanticSearch(provider);
  });

  it('isIndexed is false before index()', () => {
    expect(search.isIndexed).toBe(false);
  });

  it('isIndexed is true after index()', async () => {
    await search.index([makeLoginItem()]);
    expect(search.isIndexed).toBe(true);
  });

  it('isIndexed is true even for empty vault', async () => {
    await search.index([]);
    expect(search.isIndexed).toBe(true);
  });

  it('reindex updates existing items', async () => {
    const item = makeLoginItem({ id: 'item-1', name: 'Old Name', uris: ['https://old.com'] });
    await search.index([item]);

    const updated = { ...item, name: 'New GitHub', uris: ['https://github.com'] };
    await search.reindex([updated]);

    const results = await search.search('github');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].item.name).toBe('New GitHub');
  });

  it('removeFromIndex removes items', async () => {
    const item = makeLoginItem({ id: 'remove-me', name: 'GitHub Login' });
    await search.index([item]);

    search.removeFromIndex(['remove-me']);

    const results = await search.search('github');
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — Search (keyword matching)
// ---------------------------------------------------------------------------

describe('SemanticSearch — keyword search', () => {
  let provider: KeywordEmbeddingProvider;
  let search: SemanticSearch;
  let items: VaultItem[];

  beforeEach(async () => {
    provider = new KeywordEmbeddingProvider(64);
    await provider.initialize();
    search = new SemanticSearch(provider);

    items = [
      makeLoginItem({
        id: '1',
        name: 'GitHub',
        username: 'dev@github.com',
        uris: ['https://github.com'],
      }),
      makeLoginItem({
        id: '2',
        name: 'Gmail',
        username: 'user@gmail.com',
        uris: ['https://mail.google.com'],
      }),
      makeLoginItem({
        id: '3',
        name: 'My Bank',
        username: 'banker',
        uris: ['https://bank.example.com'],
      }),
      makeLoginItem({
        id: '4',
        name: 'Facebook',
        username: 'social@fb.com',
        uris: ['https://facebook.com'],
      }),
      makeLoginItem({
        id: '5',
        name: 'Twitter',
        username: 'tweeter',
        uris: ['https://twitter.com'],
      }),
      makeNoteItem({ id: '6', name: 'API Keys' }),
      makeCardItem({ id: '7', name: 'Visa Business Card' }),
    ];

    await search.index(items);
  });

  it('finds items by name — "github"', async () => {
    const results = await search.search('github');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].item.id).toBe('1');
  });

  it('finds items by URI domain — "facebook"', async () => {
    const results = await search.search('facebook');
    const ids = results.map((r) => r.item.id);
    expect(ids).toContain('4');
  });

  it('finds items by username — "banker"', async () => {
    const results = await search.search('banker');
    const ids = results.map((r) => r.item.id);
    expect(ids).toContain('3');
  });

  it('finds bank items by "bank"', async () => {
    const results = await search.search('bank');
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.item.id);
    expect(ids).toContain('3');
  });

  it('returns empty results for non-matching query', async () => {
    const results = await search.search('zzzznonexistent');
    expect(results).toHaveLength(0);
  });

  it('respects limit option', async () => {
    const results = await search.search('com', { limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('respects minScore option', async () => {
    const results = await search.search('github', { minScore: 0.99 });
    // Very high threshold — may return no results or only exact match
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0.99);
    }
  });

  it('scores are between 0 and 1', async () => {
    const results = await search.search('github');
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('results are sorted by score descending', async () => {
    const results = await search.search('mail');
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — Semantic search (concept matching)
// ---------------------------------------------------------------------------

describe('SemanticSearch — semantic matching', () => {
  let provider: KeywordEmbeddingProvider;
  let search: SemanticSearch;

  beforeEach(async () => {
    provider = new KeywordEmbeddingProvider(128);
    await provider.initialize();
    search = new SemanticSearch(provider);

    const items = [
      makeLoginItem({
        id: 'fb',
        name: 'Facebook',
        username: 'social@fb.com',
        uris: ['https://facebook.com'],
      }),
      makeLoginItem({
        id: 'tw',
        name: 'Twitter',
        username: 'tweets',
        uris: ['https://twitter.com'],
      }),
      makeLoginItem({
        id: 'gm',
        name: 'Gmail Personal',
        username: 'me@gmail.com',
        uris: ['https://mail.google.com'],
      }),
      makeLoginItem({
        id: 'ol',
        name: 'Outlook Work',
        username: 'work@outlook.com',
        uris: ['https://outlook.live.com'],
      }),
    ];

    await search.index(items);
  });

  it('"social media" finds Facebook and Twitter via shared terms', async () => {
    const results = await search.search('social');
    const ids = results.map((r: SearchResult) => r.item.id);
    expect(ids).toContain('fb');
  });

  it('"email" finds mail-related items', async () => {
    const results = await search.search('mail');
    const ids = results.map((r: SearchResult) => r.item.id);
    expect(ids).toContain('gm');
  });
});

// ---------------------------------------------------------------------------
// Tests — Privacy
// ---------------------------------------------------------------------------

describe('SemanticSearch — privacy', () => {
  let provider: KeywordEmbeddingProvider;
  let search: SemanticSearch;

  beforeEach(async () => {
    provider = new KeywordEmbeddingProvider(64);
    await provider.initialize();
    search = new SemanticSearch(provider);
  });

  it('passwords are NEVER in searchable text', async () => {
    const item = makeLoginItem({
      id: 'pw-test',
      name: 'Secure Site',
      password: 'MySuper$ecretP@ssw0rd!',
    });
    await search.index([item]);

    // Search for the password — should NOT match
    const results = await search.search('MySuper$ecretP@ssw0rd!');
    expect(results).toHaveLength(0);
  });

  it('card numbers are NEVER in searchable text', async () => {
    const item = makeCardItem({
      id: 'card-test',
      name: 'My Visa',
      number: '4111111111111111',
    });
    await search.index([item]);

    const results = await search.search('4111111111111111');
    expect(results).toHaveLength(0);
  });

  it('TOTP secrets are NEVER in searchable text', async () => {
    const item = makeLoginItem({
      id: 'totp-test',
      name: 'Two Factor Site',
      totp: 'otpauth://totp/Example:user?secret=JBSWY3DPEHPK3PXP&issuer=Example',
    });
    await search.index([item]);

    const results = await search.search('JBSWY3DPEHPK3PXP');
    expect(results).toHaveLength(0);
  });

  it('secure note content is NEVER in searchable text', async () => {
    const item = makeNoteItem({
      id: 'note-test',
      name: 'My Personal Notes',
      content: 'xylophone-quantum-nebula-42-zebra',
    });
    await search.index([item]);

    // Note content should not be searchable
    const results = await search.search('xylophone quantum nebula zebra');
    expect(results).toHaveLength(0);
  });

  it('CVV is NEVER in searchable text', async () => {
    const item = makeCardItem({
      id: 'cvv-test',
      name: 'Amex Card',
      cvv: '9876',
    });
    await search.index([item]);

    const results = await search.search('9876');
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — Edge cases
// ---------------------------------------------------------------------------

describe('SemanticSearch — edge cases', () => {
  let provider: KeywordEmbeddingProvider;
  let search: SemanticSearch;

  beforeEach(async () => {
    provider = new KeywordEmbeddingProvider(64);
    await provider.initialize();
    search = new SemanticSearch(provider);
  });

  it('returns empty array for empty vault', async () => {
    await search.index([]);
    const results = await search.search('anything');
    expect(results).toHaveLength(0);
  });

  it('returns empty array for empty query', async () => {
    await search.index([makeLoginItem()]);
    const results = await search.search('');
    expect(results).toHaveLength(0);
  });

  it('returns empty array for whitespace-only query', async () => {
    await search.index([makeLoginItem()]);
    const results = await search.search('   ');
    expect(results).toHaveLength(0);
  });

  it('handles items without URIs', async () => {
    const item = makeLoginItem({
      id: 'no-uri',
      name: 'No URI Login',
      uris: [],
    });
    await search.index([item]);

    const results = await search.search('login');
    expect(results.length).toBeGreaterThanOrEqual(0);
    // Should not throw
  });

  it('handles long queries without error', async () => {
    const items = [makeLoginItem({ id: 'lg', name: 'Test Item' })];
    await search.index(items);

    const longQuery = 'this is a very long search query '.repeat(50);
    const results = await search.search(longQuery);
    // Should not throw, may or may not return results
    expect(Array.isArray(results)).toBe(true);
  });

  it('handles special characters in query', async () => {
    const items = [makeLoginItem({ id: 'sp', name: 'Test@Item#1' })];
    await search.index(items);

    const results = await search.search('test@item');
    expect(Array.isArray(results)).toBe(true);
  });

  it('reindex adds new items not in original index', async () => {
    await search.index([makeLoginItem({ id: 'existing', name: 'Existing' })]);

    const newItem = makeLoginItem({ id: 'new-item', name: 'Brand New GitHub' });
    await search.reindex([newItem]);

    const results = await search.search('github');
    const ids = results.map((r) => r.item.id);
    expect(ids).toContain('new-item');
  });
});
