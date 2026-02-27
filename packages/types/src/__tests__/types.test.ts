import { describe, it, expect } from 'vitest';
import type {
  VaultItem,
  LoginItem,
  SecureNoteItem,
  CardItem,
  EncryptedVaultItem,
  Folder,
  RegisterRequest,
  LoginResponse,
  SyncResponse,
  KdfConfig,
  EmergencyKit,
} from '../index';
import { isLoginItem, isSecureNoteItem, isCardItem } from '../index';

describe('Type Guards', () => {
  describe('isLoginItem', () => {
    it('should return true for LoginItem', () => {
      const loginItem: LoginItem = {
        id: 'item-1',
        type: 'login',
        name: 'GitHub',
        username: 'user@example.com',
        password: 'secret123',
        uris: ['https://github.com'],
        tags: ['dev'],
        favorite: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        revisionDate: '2024-01-01T00:00:00Z',
      };

      expect(isLoginItem(loginItem)).toBe(true);
    });

    it('should return false for SecureNoteItem', () => {
      const noteItem: SecureNoteItem = {
        id: 'item-2',
        type: 'note',
        name: 'My Notes',
        content: 'Some secret notes',
        tags: [],
        favorite: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        revisionDate: '2024-01-01T00:00:00Z',
      };

      expect(isLoginItem(noteItem)).toBe(false);
    });

    it('should return false for CardItem', () => {
      const cardItem: CardItem = {
        id: 'item-3',
        type: 'card',
        name: 'Visa',
        cardholderName: 'John Doe',
        number: '4111111111111111',
        expMonth: '12',
        expYear: '2025',
        cvv: '123',
        brand: 'Visa',
        tags: [],
        favorite: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        revisionDate: '2024-01-01T00:00:00Z',
      };

      expect(isLoginItem(cardItem)).toBe(false);
    });
  });

  describe('isSecureNoteItem', () => {
    it('should return true for SecureNoteItem', () => {
      const noteItem: SecureNoteItem = {
        id: 'item-2',
        type: 'note',
        name: 'My Notes',
        content: 'Some secret notes',
        tags: [],
        favorite: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        revisionDate: '2024-01-01T00:00:00Z',
      };

      expect(isSecureNoteItem(noteItem)).toBe(true);
    });

    it('should return false for LoginItem', () => {
      const loginItem: LoginItem = {
        id: 'item-1',
        type: 'login',
        name: 'GitHub',
        username: 'user@example.com',
        password: 'secret123',
        uris: ['https://github.com'],
        tags: [],
        favorite: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        revisionDate: '2024-01-01T00:00:00Z',
      };

      expect(isSecureNoteItem(loginItem)).toBe(false);
    });

    it('should return false for CardItem', () => {
      const cardItem: CardItem = {
        id: 'item-3',
        type: 'card',
        name: 'Visa',
        cardholderName: 'John Doe',
        number: '4111111111111111',
        expMonth: '12',
        expYear: '2025',
        cvv: '123',
        tags: [],
        favorite: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        revisionDate: '2024-01-01T00:00:00Z',
      };

      expect(isSecureNoteItem(cardItem)).toBe(false);
    });
  });

  describe('isCardItem', () => {
    it('should return true for CardItem', () => {
      const cardItem: CardItem = {
        id: 'item-3',
        type: 'card',
        name: 'Visa',
        cardholderName: 'John Doe',
        number: '4111111111111111',
        expMonth: '12',
        expYear: '2025',
        cvv: '123',
        brand: 'Visa',
        tags: [],
        favorite: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        revisionDate: '2024-01-01T00:00:00Z',
      };

      expect(isCardItem(cardItem)).toBe(true);
    });

    it('should return false for LoginItem', () => {
      const loginItem: LoginItem = {
        id: 'item-1',
        type: 'login',
        name: 'GitHub',
        username: 'user@example.com',
        password: 'secret123',
        uris: ['https://github.com'],
        tags: [],
        favorite: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        revisionDate: '2024-01-01T00:00:00Z',
      };

      expect(isCardItem(loginItem)).toBe(false);
    });

    it('should return false for SecureNoteItem', () => {
      const noteItem: SecureNoteItem = {
        id: 'item-2',
        type: 'note',
        name: 'My Notes',
        content: 'Some secret notes',
        tags: [],
        favorite: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        revisionDate: '2024-01-01T00:00:00Z',
      };

      expect(isCardItem(noteItem)).toBe(false);
    });
  });

  describe('Type compilation', () => {
    it('should compile all exported types', () => {
      // This test verifies that all types are properly exported and can be imported
      // If TypeScript compilation fails, this test will not run

      // Vault types
      const folder: Folder = {
        id: 'folder-1',
        name: 'Work',
        createdAt: '2024-01-01T00:00:00Z',
      };

      // Encrypted vault item
      const encryptedItem: EncryptedVaultItem = {
        id: 'item-1',
        type: 'login',
        encryptedData: 'base64-encoded-ciphertext',
        revisionDate: '2024-01-01T00:00:00Z',
        tags: [],
        favorite: false,
      };

      // API types
      const kdfConfig: KdfConfig = {
        type: 'argon2id',
        iterations: 3,
        memory: 65536,
        parallelism: 4,
      };

      const registerRequest: RegisterRequest = {
        email: 'user@example.com',
        authHash: 'base64-auth-hash',
        encryptedUserKey: 'base64-encrypted-key',
        kdfConfig,
        salt: 'base64-salt',
      };

      const loginResponse: LoginResponse = {
        token: 'session-token',
        user: {
          id: 'user-1',
          email: 'user@example.com',
          kdfConfig,
          salt: 'base64-salt',
          encryptedUserKey: 'base64-encrypted-key',
        },
      };

      const syncResponse: SyncResponse = {
        added: [encryptedItem],
        modified: [],
        deleted: [],
        folders: [folder],
        serverTimestamp: '2024-01-01T00:00:00Z',
      };

      const emergencyKit: EmergencyKit = {
        recoveryKey: 'base32-recovery-key',
        createdAt: '2024-01-01T00:00:00Z',
        email: 'user@example.com',
      };

      // Verify objects are defined (not null/undefined)
      expect(folder).toBeDefined();
      expect(encryptedItem).toBeDefined();
      expect(registerRequest).toBeDefined();
      expect(loginResponse).toBeDefined();
      expect(syncResponse).toBeDefined();
      expect(emergencyKit).toBeDefined();
    });
  });

  describe('LoginItem with optional TOTP', () => {
    it('should allow LoginItem without TOTP', () => {
      const loginItem: LoginItem = {
        id: 'item-1',
        type: 'login',
        name: 'GitHub',
        username: 'user@example.com',
        password: 'secret123',
        uris: ['https://github.com'],
        tags: [],
        favorite: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        revisionDate: '2024-01-01T00:00:00Z',
      };

      expect(isLoginItem(loginItem)).toBe(true);
      expect(loginItem.totp).toBeUndefined();
    });

    it('should allow LoginItem with TOTP otpauth URI', () => {
      const loginItem: LoginItem = {
        id: 'item-1',
        type: 'login',
        name: 'GitHub',
        username: 'user@example.com',
        password: 'secret123',
        uris: ['https://github.com'],
        totp: 'otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub',
        tags: [],
        favorite: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        revisionDate: '2024-01-01T00:00:00Z',
      };

      expect(isLoginItem(loginItem)).toBe(true);
      expect(loginItem.totp).toBeDefined();
      expect(loginItem.totp).toContain('otpauth://');
    });
  });

  describe('VaultItem with optional folderId', () => {
    it('should allow VaultItem without folderId', () => {
      const loginItem: LoginItem = {
        id: 'item-1',
        type: 'login',
        name: 'GitHub',
        username: 'user@example.com',
        password: 'secret123',
        uris: [],
        tags: [],
        favorite: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        revisionDate: '2024-01-01T00:00:00Z',
      };

      expect(loginItem.folderId).toBeUndefined();
    });

    it('should allow VaultItem with folderId', () => {
      const loginItem: LoginItem = {
        id: 'item-1',
        type: 'login',
        name: 'GitHub',
        username: 'user@example.com',
        password: 'secret123',
        uris: [],
        folderId: 'folder-1',
        tags: [],
        favorite: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        revisionDate: '2024-01-01T00:00:00Z',
      };

      expect(loginItem.folderId).toBe('folder-1');
    });
  });
});
