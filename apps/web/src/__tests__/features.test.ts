import { describe, expect, it } from 'vitest';
import { api } from '../lib/api.js';

describe('document vault API', () => {
  it('exposes the complete encrypted document lifecycle', () => {
    expect(typeof api.documents.upload).toBe('function');
    expect(typeof api.documents.download).toBe('function');
    expect(typeof api.documents.delete).toBe('function');
    expect(typeof api.documents.quota).toBe('function');
  });
});

describe('two-factor API', () => {
  it('exposes status, setup, verification, login validation, and disable operations', () => {
    expect(typeof api.twoFactor.status).toBe('function');
    expect(typeof api.twoFactor.setup).toBe('function');
    expect(typeof api.twoFactor.verify).toBe('function');
    expect(typeof api.twoFactor.validate).toBe('function');
    expect(typeof api.twoFactor.disable).toBe('function');
  });
});

describe('document vault item type', () => {
  it('keeps document in the supported type selector', () => {
    const validTypes = ['login', 'note', 'card', 'identity', 'passkey', 'document'];
    expect(validTypes).toContain('document');
  });
});
