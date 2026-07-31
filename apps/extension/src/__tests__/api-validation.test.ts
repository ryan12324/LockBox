import { describe, expect, it } from 'vitest';
import { validateKdfParams } from '../../lib/api.js';

const validKdfParams = {
  salt: btoa(String.fromCharCode(...new Uint8Array(16).fill(7))),
  kdfConfig: {
    type: 'argon2id' as const,
    iterations: 3,
    memory: 65_536,
    parallelism: 4,
  },
};

describe('extension API response validation', () => {
  it('accepts valid KDF parameters', () => {
    expect(validateKdfParams(validKdfParams)).toEqual(validKdfParams);
  });

  it('rejects a missing salt before crypto decoding', () => {
    expect(() => validateKdfParams({ kdfConfig: validKdfParams.kdfConfig })).toThrow(
      'invalid login parameters'
    );
  });

  it('rejects malformed base64 before crypto decoding', () => {
    expect(() => validateKdfParams({ ...validKdfParams, salt: 'not base64!' })).toThrow(
      'invalid login parameters'
    );
  });

  it('rejects unsafe KDF costs', () => {
    expect(() =>
      validateKdfParams({
        ...validKdfParams,
        kdfConfig: { ...validKdfParams.kdfConfig, memory: 2_000_000 },
      })
    ).toThrow('invalid login parameters');
  });
});
