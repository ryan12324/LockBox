/**
 * Tests for HIBP breach checking module.
 * All HTTP calls are mocked — the real HIBP API is never contacted.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkPassword, checkBatch, sha1Hex } from '../breach.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a HIBP-style range response body. */
function hibpBody(entries: Array<[suffix: string, count: number]>): string {
  return entries.map(([s, c]) => `${s}:${c}`).join('\r\n');
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// sha1Hex
// ---------------------------------------------------------------------------

describe('sha1Hex', () => {
  it('should produce a correct lowercase hex SHA-1 digest', async () => {
    // SHA-1("password") = 5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8
    const hash = await sha1Hex('password');
    expect(hash).toBe('5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8');
  });

  it('should handle empty string', async () => {
    // SHA-1("") = da39a3ee5e6b4b0d3255bfef95601890afd80709
    const hash = await sha1Hex('');
    expect(hash).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });
});

// ---------------------------------------------------------------------------
// checkPassword
// ---------------------------------------------------------------------------

describe('checkPassword', () => {
  it('should detect a breached password (found = true)', async () => {
    // SHA-1("password") prefix = 5BAA6, suffix = 1E4C9B93F3F0682250B6CF8331B7EE68FD8
    const suffix = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';
    fetchSpy.mockResolvedValueOnce(
      new Response(
        hibpBody([
          ['0000000000000000000000000000000000A', 1],
          [suffix, 3861493],
          ['FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFB', 2],
        ]),
        { status: 200 }
      )
    );

    const result = await checkPassword('password');

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.pwnedpasswords.com/range/5BAA6');
    expect(result.hashPrefix).toBe('5BAA6');
    expect(result.found).toBe(true);
    expect(result.count).toBe(3861493);
    expect(result.checkedAt).toBeTruthy();
  });

  it('should report not found when suffix is absent', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        hibpBody([
          ['0000000000000000000000000000000000A', 1],
          ['FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 5],
        ]),
        { status: 200 }
      )
    );

    const result = await checkPassword('my-very-unique-passphrase-12345');

    expect(result.found).toBe(false);
    expect(result.count).toBe(0);
  });

  it('should throw on non-OK HTTP status', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Rate limited', { status: 429, statusText: 'Too Many Requests' })
    );

    await expect(checkPassword('test')).rejects.toThrow('HIBP API error: 429');
  });
});

// ---------------------------------------------------------------------------
// checkBatch
// ---------------------------------------------------------------------------

describe('checkBatch', () => {
  it('should check multiple passwords and return a Map keyed by id', async () => {
    // Mock two separate fetch calls
    fetchSpy
      .mockResolvedValueOnce(
        new Response(hibpBody([['1E4C9B93F3F0682250B6CF8331B7EE68FD8', 100]]), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(hibpBody([['0000000000000000000000000000000000A', 1]]), { status: 200 })
      );

    const results = await checkBatch([
      { id: 'item-1', password: 'password' },
      { id: 'item-2', password: 'unique-secret-xyz' },
    ]);

    expect(results.size).toBe(2);
    expect(results.get('item-1')?.found).toBe(true);
    expect(results.get('item-1')?.count).toBe(100);
    expect(results.get('item-2')?.found).toBe(false);
  });

  it('should rate-limit with >= 100ms gaps between calls', async () => {
    const callTimes: number[] = [];

    fetchSpy.mockImplementation(() => {
      callTimes.push(Date.now());
      return Promise.resolve(new Response(hibpBody([['AAAA', 0]]), { status: 200 }));
    });

    await checkBatch([
      { id: 'a', password: 'one' },
      { id: 'b', password: 'two' },
      { id: 'c', password: 'three' },
    ]);

    expect(callTimes).toHaveLength(3);

    // Each subsequent call should be at least ~100ms after the previous
    for (let i = 1; i < callTimes.length; i++) {
      const gap = callTimes[i] - callTimes[i - 1];
      // Allow 80ms tolerance for timer imprecision
      expect(gap).toBeGreaterThanOrEqual(80);
    }
  });

  it('should handle network errors gracefully per item', async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(
        new Response(hibpBody([['1E4C9B93F3F0682250B6CF8331B7EE68FD8', 42]]), { status: 200 })
      );

    const results = await checkBatch([
      { id: 'fail', password: 'password' },
      { id: 'ok', password: 'password' },
    ]);

    // Failed item should be recorded as not found
    expect(results.get('fail')?.found).toBe(false);
    expect(results.get('fail')?.count).toBe(0);
    // Successful item should still work
    expect(results.get('ok')?.found).toBe(true);
    expect(results.get('ok')?.count).toBe(42);
  });
});
