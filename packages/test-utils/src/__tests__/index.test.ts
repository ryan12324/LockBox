import { describe, it, expect } from 'vitest';
import { createTestEncryptionKey, createTestVaultItem, createTestLoginItem } from '../index';

describe('Test Utilities', () => {
  describe('createTestEncryptionKey', () => {
    it('should create a 32-byte key', () => {
      const key = createTestEncryptionKey();
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    it('should be deterministic (always 0x42)', () => {
      const key = createTestEncryptionKey();
      for (let i = 0; i < key.length; i++) {
        expect(key[i]).toBe(0x42);
      }
    });
  });

  describe('createTestVaultItem', () => {
    it('should create a vault item with defaults', () => {
      const item = createTestVaultItem();
      expect(item.type).toBe('login');
      expect(item.name).toBe('Test Item');
      expect(item.tags).toEqual([]);
      expect(item.favorite).toBe(false);
    });

    it('should allow overrides', () => {
      const item = createTestVaultItem({
        name: 'Custom Item',
        favorite: true,
      });
      expect(item.name).toBe('Custom Item');
      expect(item.favorite).toBe(true);
    });

    it('should have ISO timestamps', () => {
      const item = createTestVaultItem();
      expect(item.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(item.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(item.revisionDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('createTestLoginItem', () => {
    it('should create a login item with credentials', () => {
      const item = createTestLoginItem();
      expect(item.type).toBe('login');
      expect(item.username).toBe('test@example.com');
      expect(item.password).toBe('TestPassword123!');
      expect(item.uris).toEqual(['https://example.com']);
    });

    it('should have undefined TOTP by default', () => {
      const item = createTestLoginItem();
      expect(item.totp).toBeUndefined();
    });
  });
});
