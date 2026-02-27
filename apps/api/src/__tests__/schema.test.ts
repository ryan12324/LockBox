import { describe, it, expect } from 'vitest';
import { users, sessions, vaultItems, folders, aliasSettings } from '../db/schema';

describe('Database Schema', () => {
  describe('users table', () => {
    it('should export users table', () => {
      expect(users).toBeDefined();
      expect(users.constructor.name).toBe('SQLiteTable');
    });

    it('should have required columns', () => {
      expect(users.id).toBeDefined();
      expect(users.email).toBeDefined();
      expect(users.authHash).toBeDefined();
      expect(users.encryptedUserKey).toBeDefined();
      expect(users.kdfConfig).toBeDefined();
      expect(users.salt).toBeDefined();
      expect(users.createdAt).toBeDefined();
      expect(users.updatedAt).toBeDefined();
    });

    it('should have optional recovery_key_hash column', () => {
      expect(users.recoveryKeyHash).toBeDefined();
    });
  });

  describe('sessions table', () => {
    it('should export sessions table', () => {
      expect(sessions).toBeDefined();
      expect(sessions.constructor.name).toBe('SQLiteTable');
    });

    it('should have required columns', () => {
      expect(sessions.id).toBeDefined();
      expect(sessions.userId).toBeDefined();
      expect(sessions.token).toBeDefined();
      expect(sessions.expiresAt).toBeDefined();
      expect(sessions.createdAt).toBeDefined();
    });
  });

  describe('folders table', () => {
    it('should export folders table', () => {
      expect(folders).toBeDefined();
      expect(folders.constructor.name).toBe('SQLiteTable');
    });

    it('should have required columns', () => {
      expect(folders.id).toBeDefined();
      expect(folders.userId).toBeDefined();
      expect(folders.name).toBeDefined();
      expect(folders.createdAt).toBeDefined();
    });

    it('should have optional parentId for self-referential hierarchy', () => {
      expect(folders.parentId).toBeDefined();
    });
  });

  describe('vault_items table', () => {
    it('should export vaultItems table', () => {
      expect(vaultItems).toBeDefined();
      expect(vaultItems.constructor.name).toBe('SQLiteTable');
    });

    it('should have required columns', () => {
      expect(vaultItems.id).toBeDefined();
      expect(vaultItems.userId).toBeDefined();
      expect(vaultItems.type).toBeDefined();
      expect(vaultItems.encryptedData).toBeDefined();
      expect(vaultItems.revisionDate).toBeDefined();
      expect(vaultItems.createdAt).toBeDefined();
    });

    it('should have encrypted_data column for opaque blobs', () => {
      expect(vaultItems.encryptedData).toBeDefined();
    });

    it('should have optional columns for organization', () => {
      expect(vaultItems.folderId).toBeDefined();
      expect(vaultItems.tags).toBeDefined();
      expect(vaultItems.favorite).toBeDefined();
    });

    it('should have optional deletedAt for soft deletes', () => {
      expect(vaultItems.deletedAt).toBeDefined();
    });
  });

  describe('Schema exports', () => {
    it('should export all tables from db module', async () => {
      const dbModule = await import('../db');
      expect(dbModule.users).toBeDefined();
      expect(dbModule.sessions).toBeDefined();
      expect(dbModule.folders).toBeDefined();
      expect(dbModule.vaultItems).toBeDefined();
      expect(dbModule.aliasSettings).toBeDefined();
    });

    it('should export createDb function', async () => {
      const dbModule = await import('../db');
      expect(dbModule.createDb).toBeDefined();
      expect(typeof dbModule.createDb).toBe('function');
    });
  });
});
