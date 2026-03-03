import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const PRF_OUTPUT_32_BYTES = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ALT_PRF_OUTPUT = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

const mockFido2Plugin = vi.hoisted(() => ({
  isAvailable: vi.fn().mockResolvedValue({ available: true }),
  register: vi.fn().mockResolvedValue({
    keyId: 'cred-id-1',
    publicKey: 'cHViLWtleQ',
    attestation: 'YXR0ZXN0',
    prfEnabled: true,
  }),
  authenticate: vi.fn().mockResolvedValue({
    signature: 'c2ln',
    authenticatorData: 'YXV0aA',
    clientDataJSON: 'Y2xpZW50',
    prfOutput: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  }),
}));

vi.mock('@capacitor/core', () => ({
  registerPlugin: vi.fn(() => mockFido2Plugin),
}));

import { wrapMasterKeyWithPrf, unwrapMasterKeyWithPrf } from '../plugins/fido2';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetMocks(): void {
  vi.clearAllMocks();
  mockFido2Plugin.isAvailable.mockResolvedValue({ available: true });
  mockFido2Plugin.register.mockResolvedValue({
    keyId: 'cred-id-1',
    publicKey: 'cHViLWtleQ',
    attestation: 'YXR0ZXN0',
    prfEnabled: true,
  });
  mockFido2Plugin.authenticate.mockResolvedValue({
    signature: 'c2ln',
    authenticatorData: 'YXV0aA',
    clientDataJSON: 'Y2xpZW50',
    prfOutput: PRF_OUTPUT_32_BYTES,
  });
}

// ─── wrapMasterKeyWithPrf ─────────────────────────────────────────────────────

describe('wrapMasterKeyWithPrf', () => {
  beforeEach(resetMocks);

  it('returns wrappedMasterKey in base64(iv).base64(ciphertext+tag) format', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const result = await wrapMasterKeyWithPrf({
      masterKey,
      credentialId: 'cred-id-1',
      rpId: 'lockbox.dev',
    });

    const parts = result.wrappedMasterKey.split('.');
    expect(parts).toHaveLength(2);

    const ivBytes = atob(parts[0]);
    expect(ivBytes.length).toBe(12);

    const ciphertextBytes = atob(parts[1]);
    expect(ciphertextBytes.length).toBe(32 + 16);
  });

  it('returns deterministic prfSalt derived from context string', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const r1 = await wrapMasterKeyWithPrf({
      masterKey,
      credentialId: 'cred-id-1',
      rpId: 'lockbox.dev',
    });
    resetMocks();
    const r2 = await wrapMasterKeyWithPrf({
      masterKey,
      credentialId: 'cred-id-1',
      rpId: 'lockbox.dev',
    });
    expect(r1.prfSalt).toBe(r2.prfSalt);
  });

  it('produces different ciphertexts for same input due to random IV', async () => {
    const masterKey = new Uint8Array(32).fill(0x42);
    const r1 = await wrapMasterKeyWithPrf({
      masterKey,
      credentialId: 'cred-id-1',
      rpId: 'lockbox.dev',
    });
    resetMocks();
    const r2 = await wrapMasterKeyWithPrf({
      masterKey,
      credentialId: 'cred-id-1',
      rpId: 'lockbox.dev',
    });
    expect(r1.wrappedMasterKey).not.toBe(r2.wrappedMasterKey);
  });

  it('passes prfSalt to authenticate call', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    await wrapMasterKeyWithPrf({
      masterKey,
      credentialId: 'cred-id-1',
      rpId: 'lockbox.dev',
    });
    expect(mockFido2Plugin.authenticate).toHaveBeenCalledWith(
      expect.objectContaining({
        rpId: 'lockbox.dev',
        prfSalt: expect.any(String),
        allowCredentials: [{ id: 'cred-id-1', type: 'public-key' }],
      })
    );
  });

  it('throws descriptive error when PRF not supported', async () => {
    mockFido2Plugin.authenticate.mockResolvedValue({
      signature: 'c2ln',
      authenticatorData: 'YXV0aA',
      clientDataJSON: 'Y2xpZW50',
    });

    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    await expect(
      wrapMasterKeyWithPrf({
        masterKey,
        credentialId: 'cred-id-1',
        rpId: 'lockbox.dev',
      })
    ).rejects.toThrow('FIDO2 PRF extension is not supported by this authenticator');
  });

  it('does not fall back to insecure wrapping when PRF unavailable', async () => {
    mockFido2Plugin.authenticate.mockResolvedValue({
      signature: 'c2ln',
      authenticatorData: 'YXV0aA',
      clientDataJSON: 'Y2xpZW50',
    });

    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const promise = wrapMasterKeyWithPrf({
      masterKey,
      credentialId: 'cred-id-1',
      rpId: 'lockbox.dev',
    });

    await expect(promise).rejects.toThrow();
  });
});

// ─── unwrapMasterKeyWithPrf ───────────────────────────────────────────────────

describe('unwrapMasterKeyWithPrf', () => {
  beforeEach(resetMocks);

  it('round-trips: wrap then unwrap recovers original master key', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await wrapMasterKeyWithPrf({
      masterKey,
      credentialId: 'cred-id-1',
      rpId: 'lockbox.dev',
    });
    resetMocks();

    const recovered = await unwrapMasterKeyWithPrf({
      wrappedMasterKey: wrapped.wrappedMasterKey,
      prfSalt: wrapped.prfSalt,
      credentialId: 'cred-id-1',
      rpId: 'lockbox.dev',
    });

    expect(recovered).toEqual(masterKey);
  });

  it('round-trips with different master key sizes', async () => {
    for (const size of [16, 32, 64]) {
      resetMocks();
      const masterKey = crypto.getRandomValues(new Uint8Array(size));
      const wrapped = await wrapMasterKeyWithPrf({
        masterKey,
        credentialId: 'cred-id-1',
        rpId: 'lockbox.dev',
      });
      resetMocks();
      const recovered = await unwrapMasterKeyWithPrf({
        wrappedMasterKey: wrapped.wrappedMasterKey,
        prfSalt: wrapped.prfSalt,
        credentialId: 'cred-id-1',
        rpId: 'lockbox.dev',
      });
      expect(recovered).toEqual(masterKey);
    }
  });

  it('throws descriptive error when PRF not supported during unwrap', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await wrapMasterKeyWithPrf({
      masterKey,
      credentialId: 'cred-id-1',
      rpId: 'lockbox.dev',
    });

    mockFido2Plugin.authenticate.mockResolvedValue({
      signature: 'c2ln',
      authenticatorData: 'YXV0aA',
      clientDataJSON: 'Y2xpZW50',
    });

    await expect(
      unwrapMasterKeyWithPrf({
        wrappedMasterKey: wrapped.wrappedMasterKey,
        prfSalt: wrapped.prfSalt,
        credentialId: 'cred-id-1',
        rpId: 'lockbox.dev',
      })
    ).rejects.toThrow('FIDO2 PRF extension is not supported by this authenticator');
  });

  it('throws on invalid wrapped key format (missing dot)', async () => {
    await expect(
      unwrapMasterKeyWithPrf({
        wrappedMasterKey: 'no-dot-separator',
        prfSalt: 'AAAA',
        credentialId: 'cred-id-1',
        rpId: 'lockbox.dev',
      })
    ).rejects.toThrow('Invalid wrapped master key format');
  });

  it('fails to unwrap with different PRF output (wrong key)', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await wrapMasterKeyWithPrf({
      masterKey,
      credentialId: 'cred-id-1',
      rpId: 'lockbox.dev',
    });

    mockFido2Plugin.authenticate.mockResolvedValue({
      signature: 'c2ln',
      authenticatorData: 'YXV0aA',
      clientDataJSON: 'Y2xpZW50',
      prfOutput: ALT_PRF_OUTPUT,
    });

    await expect(
      unwrapMasterKeyWithPrf({
        wrappedMasterKey: wrapped.wrappedMasterKey,
        prfSalt: wrapped.prfSalt,
        credentialId: 'cred-id-1',
        rpId: 'lockbox.dev',
      })
    ).rejects.toThrow();
  });

  it('passes prfSalt to authenticate call', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await wrapMasterKeyWithPrf({
      masterKey,
      credentialId: 'cred-id-1',
      rpId: 'lockbox.dev',
    });
    resetMocks();

    await unwrapMasterKeyWithPrf({
      wrappedMasterKey: wrapped.wrappedMasterKey,
      prfSalt: wrapped.prfSalt,
      credentialId: 'cred-id-1',
      rpId: 'lockbox.dev',
    });

    expect(mockFido2Plugin.authenticate).toHaveBeenCalledWith(
      expect.objectContaining({
        prfSalt: wrapped.prfSalt,
        allowCredentials: [{ id: 'cred-id-1', type: 'public-key' }],
      })
    );
  });
});
