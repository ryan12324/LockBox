import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPlugin = vi.hoisted(() => ({
  _pluginName: 'Autofill',
  isEnabled: vi.fn().mockResolvedValue({ enabled: true }),
  requestEnable: vi.fn().mockResolvedValue(undefined),
  getCredentialsForUri: vi.fn().mockResolvedValue({ credentials: [] }),
  saveCredential: vi.fn().mockResolvedValue(undefined),
  removeCredential: vi.fn().mockResolvedValue(undefined),
  getPasskeysForUri: vi.fn().mockResolvedValue({
    passkeys: [
      {
        credentialId: 'cred-abc-123',
        rpId: 'example.com',
        rpName: 'Example',
        userName: 'alice@example.com',
        userDisplayName: 'Alice',
      },
      {
        credentialId: 'cred-def-456',
        rpId: 'example.com',
        rpName: 'Example',
        userName: 'bob@example.com',
        userDisplayName: 'Bob',
      },
    ],
  }),
}));

vi.mock('@capacitor/core', () => ({
  registerPlugin: vi.fn(() => mockPlugin),
}));

import { getPasskeysForUri } from '../plugins/autofill.js';
import type {
  AutofillPasskeyEntry,
  AutofillPasskeysResult,
  AutofillPlugin,
} from '../plugins/autofill.js';

describe('Autofill passkey integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlugin.getPasskeysForUri.mockResolvedValue({
      passkeys: [
        {
          credentialId: 'cred-abc-123',
          rpId: 'example.com',
          rpName: 'Example',
          userName: 'alice@example.com',
          userDisplayName: 'Alice',
        },
        {
          credentialId: 'cred-def-456',
          rpId: 'example.com',
          rpName: 'Example',
          userName: 'bob@example.com',
          userDisplayName: 'Bob',
        },
      ],
    });
  });

  describe('getPasskeysForUri', () => {
    it('returns passkeys matching the URI domain', async () => {
      const passkeys = await getPasskeysForUri('https://example.com/login');
      expect(passkeys).toHaveLength(2);
      expect(passkeys[0].credentialId).toBe('cred-abc-123');
      expect(passkeys[0].rpId).toBe('example.com');
      expect(passkeys[0].userName).toBe('alice@example.com');
      expect(passkeys[1].credentialId).toBe('cred-def-456');
    });

    it('passes URI to the native plugin', async () => {
      await getPasskeysForUri('https://example.com/login');
      expect(mockPlugin.getPasskeysForUri).toHaveBeenCalledWith({
        uri: 'https://example.com/login',
      });
    });

    it('returns empty array when no passkeys match', async () => {
      mockPlugin.getPasskeysForUri.mockResolvedValueOnce({ passkeys: [] });
      const passkeys = await getPasskeysForUri('https://unknown-site.org');
      expect(passkeys).toEqual([]);
    });

    it('returns empty array on native plugin error', async () => {
      mockPlugin.getPasskeysForUri.mockRejectedValueOnce(new Error('Room DB error'));
      const passkeys = await getPasskeysForUri('https://example.com');
      expect(passkeys).toEqual([]);
    });

    it('handles bare domain URIs', async () => {
      await getPasskeysForUri('example.com');
      expect(mockPlugin.getPasskeysForUri).toHaveBeenCalledWith({
        uri: 'example.com',
      });
    });
  });

  describe('AutofillPasskeyEntry type contract', () => {
    it('contains all expected fields', async () => {
      const passkeys = await getPasskeysForUri('https://example.com');
      const entry: AutofillPasskeyEntry = passkeys[0];
      expect(entry).toHaveProperty('credentialId');
      expect(entry).toHaveProperty('rpId');
      expect(entry).toHaveProperty('rpName');
      expect(entry).toHaveProperty('userName');
      expect(entry).toHaveProperty('userDisplayName');
    });

    it('credentialId is a string', async () => {
      const passkeys = await getPasskeysForUri('https://example.com');
      expect(typeof passkeys[0].credentialId).toBe('string');
    });

    it('rpId matches the domain', async () => {
      const passkeys = await getPasskeysForUri('https://example.com');
      expect(passkeys[0].rpId).toBe('example.com');
    });
  });

  describe('AutofillPlugin.getPasskeysForUri interface', () => {
    let Autofill: AutofillPlugin;

    beforeEach(async () => {
      const module = await import('../plugins/autofill.js');
      Autofill = module.Autofill;
    });

    it('resolves with passkeys array', async () => {
      const result: AutofillPasskeysResult = await Autofill.getPasskeysForUri({
        uri: 'https://example.com',
      });
      expect(result).toHaveProperty('passkeys');
      expect(Array.isArray(result.passkeys)).toBe(true);
    });

    it('passkey entries have distinct labels from credentials', async () => {
      const credResult = await Autofill.getCredentialsForUri({
        uri: 'https://example.com',
      });
      const passkeyResult = await Autofill.getPasskeysForUri({
        uri: 'https://example.com',
      });

      for (const pk of passkeyResult.passkeys) {
        expect(pk).toHaveProperty('userName');
        expect(pk).toHaveProperty('rpName');
        expect(pk).not.toHaveProperty('username');
      }

      for (const cred of credResult.credentials) {
        expect(cred).toHaveProperty('username');
        expect(cred).not.toHaveProperty('rpName');
      }
    });
  });

  describe('existing autofill methods still work', () => {
    let Autofill: AutofillPlugin;

    beforeEach(async () => {
      const module = await import('../plugins/autofill.js');
      Autofill = module.Autofill;
    });

    it('isEnabled still returns enabled status', async () => {
      const result = await Autofill.isEnabled();
      expect(result).toHaveProperty('enabled');
      expect(typeof result.enabled).toBe('boolean');
    });

    it('getCredentialsForUri still returns credentials', async () => {
      const result = await Autofill.getCredentialsForUri({
        uri: 'https://example.com',
      });
      expect(result).toHaveProperty('credentials');
      expect(Array.isArray(result.credentials)).toBe(true);
    });

    it('saveCredential still resolves', async () => {
      await expect(
        Autofill.saveCredential({
          id: 'item-1',
          encryptedData: 'blob',
          uri: 'https://example.com',
        })
      ).resolves.toBeUndefined();
    });

    it('removeCredential still resolves', async () => {
      await expect(Autofill.removeCredential({ id: 'item-1' })).resolves.toBeUndefined();
    });
  });
});
