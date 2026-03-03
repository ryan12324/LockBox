/**
 * Tests for vault item encryption/decryption helpers.
 * Verifies AAD binding, round-trip correctness, and key slicing.
 */

import { describe, it, expect } from 'vitest';
import { encryptVaultItem, decryptVaultItem } from '../lib/crypto.js';
import type {
  VaultItem,
  LoginItem,
  CardItem,
  IdentityItem,
  SecureNoteItem,
  PasskeyItem,
  DocumentItem,
} from '@lockbox/types';

function makeTestKey(): Uint8Array {
  // 64-byte user key (first 32 bytes used for AES-256)
  return new Uint8Array(64).fill(0x42);
}

function makeTestItem(): LoginItem {
  const now = new Date().toISOString();
  return {
    id: 'test-item-id',
    type: 'login',
    name: 'Test Login',
    username: 'user@example.com',
    password: 's3cr3t_p@ssw0rd',
    uris: ['https://example.com'],
    totp: undefined,
    tags: ['work'],
    favorite: false,
    createdAt: now,
    updatedAt: now,
    revisionDate: now,
  };
}

describe('encryptVaultItem / decryptVaultItem', () => {
  it('round-trips a login item correctly', async () => {
    const userKey = makeTestKey();
    const item = makeTestItem();
    const itemId = item.id;
    const revisionDate = item.revisionDate;

    const encrypted = await encryptVaultItem(item, userKey, itemId, revisionDate);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.length).toBeGreaterThan(0);

    const decrypted = await decryptVaultItem(encrypted, userKey, itemId, revisionDate);
    expect(decrypted.name).toBe(item.name);
    expect(decrypted.type).toBe('login');
    const login = decrypted as LoginItem;
    expect(login.username).toBe(item.username);
    expect(login.password).toBe(item.password);
    expect(login.uris).toEqual(item.uris);
    expect(login.tags).toEqual(item.tags);
  });

  it('produces different ciphertext each call (random IV)', async () => {
    const userKey = makeTestKey();
    const item = makeTestItem();

    const enc1 = await encryptVaultItem(item, userKey, item.id, item.revisionDate);
    const enc2 = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    // Different IVs → different ciphertext
    expect(enc1).not.toBe(enc2);
  });

  it('decryption fails with wrong itemId (AAD mismatch)', async () => {
    const userKey = makeTestKey();
    const item = makeTestItem();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    await expect(
      decryptVaultItem(encrypted, userKey, 'wrong-item-id', item.revisionDate)
    ).rejects.toThrow();
  });

  it('decryption fails with wrong revisionDate (AAD mismatch)', async () => {
    const userKey = makeTestKey();
    const item = makeTestItem();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    await expect(
      decryptVaultItem(encrypted, userKey, item.id, '2000-01-01T00:00:00.000Z')
    ).rejects.toThrow();
  });

  it('decryption fails with wrong key', async () => {
    const userKey = makeTestKey();
    const wrongKey = new Uint8Array(64).fill(0x99);
    const item = makeTestItem();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    await expect(
      decryptVaultItem(encrypted, wrongKey, item.id, item.revisionDate)
    ).rejects.toThrow();
  });

  it('uses only first 32 bytes of 64-byte user key', async () => {
    // Two keys with same first 32 bytes but different last 32 bytes
    const key1 = new Uint8Array(64);
    key1.fill(0x42, 0, 32);
    key1.fill(0x11, 32, 64);

    const key2 = new Uint8Array(64);
    key2.fill(0x42, 0, 32);
    key2.fill(0x99, 32, 64); // different second half

    const item = makeTestItem();
    const encrypted = await encryptVaultItem(item, key1, item.id, item.revisionDate);

    // Should decrypt successfully with key2 (same first 32 bytes)
    const decrypted = await decryptVaultItem(encrypted, key2, item.id, item.revisionDate);
    expect(decrypted.name).toBe(item.name);
  });

  it('preserves all vault item fields through round-trip', async () => {
    const userKey = makeTestKey();
    const now = new Date().toISOString();
    const item: VaultItem = {
      id: 'full-test-id',
      type: 'login',
      name: 'Full Test',
      folderId: 'folder-123',
      tags: ['tag1', 'tag2'],
      favorite: true,
      createdAt: now,
      updatedAt: now,
      revisionDate: now,
      username: 'testuser',
      password: 'testpass',
      uris: ['https://a.com', 'https://b.com'],
      totp: 'otpauth://totp/Example?secret=JBSWY3DPEHPK3PXP',
    } as LoginItem;

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);
    const decrypted = await decryptVaultItem(encrypted, userKey, item.id, item.revisionDate);

    expect(decrypted.folderId).toBe('folder-123');
    expect(decrypted.tags).toEqual(['tag1', 'tag2']);
    expect(decrypted.favorite).toBe(true);
    const login = decrypted as LoginItem;
    expect(login.totp).toBe('otpauth://totp/Example?secret=JBSWY3DPEHPK3PXP');
    expect(login.uris).toHaveLength(2);
  });
});

describe('CardItem encryption round-trip', () => {
  function makeTestCard(): CardItem {
    const now = new Date().toISOString();
    return {
      id: 'card-item-id',
      type: 'card',
      name: 'Personal Visa',
      cardholderName: 'Jane Q. Doe',
      number: '4111111111111111',
      expMonth: '09',
      expYear: '2028',
      cvv: '742',
      brand: 'Visa',
      tags: ['personal', 'primary'],
      favorite: true,
      createdAt: now,
      updatedAt: now,
      revisionDate: now,
    };
  }

  it('round-trips a card item correctly', async () => {
    const userKey = makeTestKey();
    const item = makeTestCard();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.length).toBeGreaterThan(0);

    const decrypted = await decryptVaultItem(encrypted, userKey, item.id, item.revisionDate);
    expect(decrypted.type).toBe('card');
    const card = decrypted as CardItem;
    expect(card.name).toBe(item.name);
    expect(card.cardholderName).toBe(item.cardholderName);
    expect(card.number).toBe(item.number);
    expect(card.expMonth).toBe(item.expMonth);
    expect(card.expYear).toBe(item.expYear);
    expect(card.cvv).toBe(item.cvv);
    expect(card.brand).toBe(item.brand);
    expect(card.tags).toEqual(item.tags);
    expect(card.favorite).toBe(true);
  });

  it('decryption fails with wrong itemId (AAD mismatch)', async () => {
    const userKey = makeTestKey();
    const item = makeTestCard();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    await expect(
      decryptVaultItem(encrypted, userKey, 'wrong-card-id', item.revisionDate)
    ).rejects.toThrow();
  });

  it('decryption fails with wrong revisionDate (AAD mismatch)', async () => {
    const userKey = makeTestKey();
    const item = makeTestCard();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    await expect(
      decryptVaultItem(encrypted, userKey, item.id, '1999-12-31T23:59:59.000Z')
    ).rejects.toThrow();
  });
});

describe('IdentityItem encryption round-trip', () => {
  function makeTestIdentity(): IdentityItem {
    const now = new Date().toISOString();
    return {
      id: 'identity-item-id',
      type: 'identity',
      name: 'Primary Identity',
      firstName: 'Jane',
      middleName: 'Quinn',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      phone: '+1-555-867-5309',
      address1: '742 Evergreen Terrace',
      address2: 'Apt 3B',
      city: 'Springfield',
      state: 'IL',
      postalCode: '62704',
      country: 'US',
      company: 'Acme Corp',
      ssn: '123-45-6789',
      passportNumber: 'X12345678',
      licenseNumber: 'D400-1234-5678',
      tags: ['personal'],
      favorite: false,
      createdAt: now,
      updatedAt: now,
      revisionDate: now,
    };
  }

  it('round-trips an identity item correctly', async () => {
    const userKey = makeTestKey();
    const item = makeTestIdentity();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.length).toBeGreaterThan(0);

    const decrypted = await decryptVaultItem(encrypted, userKey, item.id, item.revisionDate);
    expect(decrypted.type).toBe('identity');
    const identity = decrypted as IdentityItem;
    expect(identity.name).toBe(item.name);
    expect(identity.firstName).toBe(item.firstName);
    expect(identity.middleName).toBe(item.middleName);
    expect(identity.lastName).toBe(item.lastName);
    expect(identity.email).toBe(item.email);
    expect(identity.phone).toBe(item.phone);
    expect(identity.address1).toBe(item.address1);
    expect(identity.address2).toBe(item.address2);
    expect(identity.city).toBe(item.city);
    expect(identity.state).toBe(item.state);
    expect(identity.postalCode).toBe(item.postalCode);
    expect(identity.country).toBe(item.country);
    expect(identity.company).toBe(item.company);
    expect(identity.ssn).toBe(item.ssn);
    expect(identity.passportNumber).toBe(item.passportNumber);
    expect(identity.licenseNumber).toBe(item.licenseNumber);
    expect(identity.tags).toEqual(item.tags);
  });

  it('decryption fails with wrong itemId (AAD mismatch)', async () => {
    const userKey = makeTestKey();
    const item = makeTestIdentity();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    await expect(
      decryptVaultItem(encrypted, userKey, 'wrong-identity-id', item.revisionDate)
    ).rejects.toThrow();
  });

  it('decryption fails with wrong revisionDate (AAD mismatch)', async () => {
    const userKey = makeTestKey();
    const item = makeTestIdentity();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    await expect(
      decryptVaultItem(encrypted, userKey, item.id, '1999-12-31T23:59:59.000Z')
    ).rejects.toThrow();
  });
});

describe('SecureNoteItem encryption round-trip', () => {
  function makeTestNote(): SecureNoteItem {
    const now = new Date().toISOString();
    return {
      id: 'note-item-id',
      type: 'note',
      name: 'Recovery Codes',
      content:
        'Recovery codes for GitHub:\n1. abc123-def456\n2. ghi789-jkl012\n3. mno345-pqr678\n\nKeep these safe!',
      tags: ['recovery', 'github'],
      favorite: false,
      createdAt: now,
      updatedAt: now,
      revisionDate: now,
    };
  }

  it('round-trips a secure note item correctly', async () => {
    const userKey = makeTestKey();
    const item = makeTestNote();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.length).toBeGreaterThan(0);

    const decrypted = await decryptVaultItem(encrypted, userKey, item.id, item.revisionDate);
    expect(decrypted.type).toBe('note');
    const note = decrypted as SecureNoteItem;
    expect(note.name).toBe(item.name);
    expect(note.content).toBe(item.content);
    expect(note.tags).toEqual(item.tags);
    expect(note.favorite).toBe(false);
  });

  it('decryption fails with wrong itemId (AAD mismatch)', async () => {
    const userKey = makeTestKey();
    const item = makeTestNote();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    await expect(
      decryptVaultItem(encrypted, userKey, 'wrong-note-id', item.revisionDate)
    ).rejects.toThrow();
  });

  it('decryption fails with wrong revisionDate (AAD mismatch)', async () => {
    const userKey = makeTestKey();
    const item = makeTestNote();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    await expect(
      decryptVaultItem(encrypted, userKey, item.id, '1999-12-31T23:59:59.000Z')
    ).rejects.toThrow();
  });
});

describe('PasskeyItem encryption round-trip', () => {
  function makeTestPasskey(): PasskeyItem {
    const now = new Date().toISOString();
    return {
      id: 'passkey-item-id',
      type: 'passkey',
      name: 'GitHub Passkey',
      rpId: 'github.com',
      rpName: 'GitHub',
      userId: 'dXNlci0xMjM0NTY3ODk',
      userName: 'jane.doe@github.com',
      credentialId: 'Y3JlZGVudGlhbC1pZC0xMjM0NTY3ODk',
      publicKey: 'cHVibGljLWtleS1jb3NlLWVjMi1wMjU2',
      counter: 42,
      transports: ['internal', 'hybrid'],
      tags: ['work', 'github'],
      favorite: true,
      createdAt: now,
      updatedAt: now,
      revisionDate: now,
    };
  }

  it('round-trips a passkey item correctly', async () => {
    const userKey = makeTestKey();
    const item = makeTestPasskey();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.length).toBeGreaterThan(0);

    const decrypted = await decryptVaultItem(encrypted, userKey, item.id, item.revisionDate);
    expect(decrypted.type).toBe('passkey');
    const passkey = decrypted as PasskeyItem;
    expect(passkey.name).toBe(item.name);
    expect(passkey.rpId).toBe(item.rpId);
    expect(passkey.rpName).toBe(item.rpName);
    expect(passkey.userId).toBe(item.userId);
    expect(passkey.userName).toBe(item.userName);
    expect(passkey.credentialId).toBe(item.credentialId);
    expect(passkey.publicKey).toBe(item.publicKey);
    expect(passkey.counter).toBe(item.counter);
    expect(passkey.transports).toEqual(item.transports);
    expect(passkey.tags).toEqual(item.tags);
    expect(passkey.favorite).toBe(true);
  });

  it('decryption fails with wrong itemId (AAD mismatch)', async () => {
    const userKey = makeTestKey();
    const item = makeTestPasskey();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    await expect(
      decryptVaultItem(encrypted, userKey, 'wrong-passkey-id', item.revisionDate)
    ).rejects.toThrow();
  });

  it('decryption fails with wrong revisionDate (AAD mismatch)', async () => {
    const userKey = makeTestKey();
    const item = makeTestPasskey();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    await expect(
      decryptVaultItem(encrypted, userKey, item.id, '1999-12-31T23:59:59.000Z')
    ).rejects.toThrow();
  });
});

describe('DocumentItem encryption round-trip', () => {
  function makeTestDocument(): DocumentItem {
    const now = new Date().toISOString();
    return {
      id: 'document-item-id',
      type: 'document',
      name: 'Tax Return 2025.pdf',
      encryptedFileKey: 'ZW5jcnlwdGVkLWZpbGUta2V5LWJhc2U2NA',
      mimeType: 'application/pdf',
      size: 2048576,
      description: 'Federal tax return filed April 2025',
      tags: ['taxes', 'finance', '2025'],
      favorite: false,
      createdAt: now,
      updatedAt: now,
      revisionDate: now,
    };
  }

  it('round-trips a document item correctly', async () => {
    const userKey = makeTestKey();
    const item = makeTestDocument();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.length).toBeGreaterThan(0);

    const decrypted = await decryptVaultItem(encrypted, userKey, item.id, item.revisionDate);
    expect(decrypted.type).toBe('document');
    const doc = decrypted as DocumentItem;
    expect(doc.name).toBe(item.name);
    expect(doc.encryptedFileKey).toBe(item.encryptedFileKey);
    expect(doc.mimeType).toBe(item.mimeType);
    expect(doc.size).toBe(item.size);
    expect(doc.description).toBe(item.description);
    expect(doc.tags).toEqual(item.tags);
    expect(doc.favorite).toBe(false);
  });

  it('decryption fails with wrong itemId (AAD mismatch)', async () => {
    const userKey = makeTestKey();
    const item = makeTestDocument();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    await expect(
      decryptVaultItem(encrypted, userKey, 'wrong-document-id', item.revisionDate)
    ).rejects.toThrow();
  });

  it('decryption fails with wrong revisionDate (AAD mismatch)', async () => {
    const userKey = makeTestKey();
    const item = makeTestDocument();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    await expect(
      decryptVaultItem(encrypted, userKey, item.id, '1999-12-31T23:59:59.000Z')
    ).rejects.toThrow();
  });
});

describe('E2E: ItemPanel save → API round-trip → Vault decrypt', () => {
  it('simulates the exact production create+load flow', async () => {
    // Simulate the full flow:
    // 1. ItemPanel.handleSave encrypts an item
    // 2. Sends to server (we simulate with JSON round-trip)
    // 3. Server stores values
    // 4. Vault.loadVault fetches + decrypts
    const userKey = makeTestKey();
    const now = new Date().toISOString();
    const itemId = crypto.randomUUID();

    // ─── Step 1: ItemPanel.handleSave builds the vault item ───
    const vaultItem: LoginItem = {
      id: itemId,
      type: 'login',
      name: 'My Login',
      username: 'testuser',
      password: 'testpass123',
      uris: ['https://example.com'],
      totp: undefined,
      tags: [],
      favorite: false,
      createdAt: now,
      updatedAt: now,
      revisionDate: now,
    };

    // ─── Step 2: Encrypt with AAD ───
    const encryptedData = await encryptVaultItem(vaultItem, userKey, itemId, now);

    // ─── Step 3: Simulate API call — serialize to JSON (as fetch would) ───
    const requestBody = JSON.stringify({
      id: itemId,
      type: 'login',
      encryptedData,
      folderId: undefined,
      tags: [],
      favorite: false,
      revisionDate: now,
    });

    // ─── Step 4: Server receives, stores, returns ───
    const serverBody = JSON.parse(requestBody);
    const serverNow = new Date().toISOString(); // server's own timestamp
    const storedItem = {
      id: (serverBody.id as string) || crypto.randomUUID(),
      userId: 'user-123',
      type: serverBody.type,
      encryptedData: serverBody.encryptedData,
      folderId: serverBody.folderId ?? null,
      tags: serverBody.tags ? JSON.stringify(serverBody.tags) : null,
      favorite: serverBody.favorite ? 1 : 0,
      revisionDate: (serverBody.revisionDate as string) || serverNow,
      createdAt: serverNow,
      deletedAt: null,
    };

    // ─── Step 5: Vault.loadVault fetches items (simulate JSON round-trip) ───
    const apiResponse = JSON.parse(JSON.stringify({ items: [storedItem], folders: [] }));
    const item = apiResponse.items[0];

    // ─── Step 6: Decrypt — exactly as Vault.tsx does ───
    const decrypted = await decryptVaultItem(
      item.encryptedData,
      userKey,
      item.id,
      item.revisionDate
    );

    expect(decrypted.name).toBe('My Login');
    expect((decrypted as LoginItem).username).toBe('testuser');
    expect((decrypted as LoginItem).password).toBe('testpass123');
  });

  it('simulates key derivation round-trip (register → unlock)', async () => {
    const { generateUserKey, encryptUserKey, decryptUserKey, deriveKey, toBase64, fromBase64 } =
      await import('@lockbox/crypto');

    const password = 'my-test-password-123';
    const kdfConfig = { type: 'argon2id' as const, iterations: 3, memory: 65536, parallelism: 4 };

    // ─── Registration ───
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltB64 = toBase64(salt);
    const masterKey1 = await deriveKey(password, salt, kdfConfig);
    const userKey1 = generateUserKey();
    const encryptedUserKey = await encryptUserKey(userKey1, masterKey1);

    // ─── Simulate server storage → JSON round-trip ───
    const serverStored = JSON.parse(
      JSON.stringify({
        encryptedUserKey,
        kdfConfig,
        salt: saltB64,
      })
    );

    // ─── Login / Unlock — re-derive keys from stored data ───
    const salt2 = fromBase64(serverStored.salt);
    const masterKey2 = await deriveKey(password, salt2, serverStored.kdfConfig);
    const userKey2 = await decryptUserKey(serverStored.encryptedUserKey, masterKey2);

    // Keys must match
    expect(userKey1.length).toBe(userKey2.length);
    expect(Array.from(userKey1)).toEqual(Array.from(userKey2));

    // ─── Now verify vault item encrypt/decrypt works across key derivation ───
    const now = new Date().toISOString();
    const itemId = crypto.randomUUID();
    const item: LoginItem = {
      id: itemId,
      type: 'login',
      name: 'Cross-session Test',
      username: 'user',
      password: 'pass',
      uris: [],
      tags: [],
      favorite: false,
      createdAt: now,
      updatedAt: now,
      revisionDate: now,
    };

    // Encrypt with original key
    const encrypted = await encryptVaultItem(item, userKey1, itemId, now);

    // Decrypt with re-derived key
    const decrypted = await decryptVaultItem(encrypted, userKey2, itemId, now);
    expect(decrypted.name).toBe('Cross-session Test');
  });
});
