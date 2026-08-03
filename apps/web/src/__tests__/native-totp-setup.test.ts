import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoginItem } from '@lockbox/types';
import {
  getPendingNativeCredentialSaves,
  getPendingNativeTotpSetups,
  syncNativeAutofillIndex,
} from '../lib/native-autofill.js';
import {
  parseNativeTotpSetupUri,
  totpSetupFingerprint,
} from '../lib/native-totp-setup.js';

afterEach(() => {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  vi.restoreAllMocks();
});

describe('native iOS verification-code setup', () => {
  it('normalizes a standard otpauth TOTP link without exposing the secret in metadata', () => {
    const proposals = parseNativeTotpSetupUri(
      'otpauth://totp/GitHub:ryan%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA256&digits=8&period=30'
    );
    expect(proposals).toEqual([expect.objectContaining({
      name: 'GitHub',
      username: 'ryan@example.com',
    })]);
    expect(proposals[0].totp).toContain('secret=JBSWY3DPEHPK3PXP');
  });

  it('deduplicates equivalent raw and URI-form authenticator keys', () => {
    expect(totpSetupFingerprint('JBSWY3DPEHPK3PXP')).toBe(
      totpSetupFingerprint(
        'otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&algorithm=SHA1&digits=6&period=30'
      )
    );
    expect(totpSetupFingerprint('%%%')).toBeNull();
  });

  it('imports bounded Google Authenticator migration payloads', () => {
    const otp = concat(
      bytesField(1, Uint8Array.from({ length: 20 }, (_, index) => index + 1)),
      textField(2, 'ryan@example.com'),
      textField(3, 'example.com'),
      integerField(4, 2),
      integerField(5, 2),
      integerField(6, 2)
    );
    const migration = bytesField(1, otp);
    const encoded = btoa(String.fromCharCode(...migration));
    const [proposal] = parseNativeTotpSetupUri(
      `otpauth-migration://offline?data=${encodeURIComponent(encoded)}`
    );
    expect(proposal).toEqual(expect.objectContaining({
      name: 'example.com',
      username: 'ryan@example.com',
      suggestedUri: 'https://example.com',
    }));
    expect(proposal.totp).toContain('algorithm=SHA256');
    expect(proposal.totp).toContain('digits=8');
  });

  it.each([
    'https://example.com/setup',
    'otpauth://hotp/Example:user?secret=JBSWY3DPEHPK3PXP&counter=1',
    'otpauth-migration://offline?data=not-base64',
  ])('rejects unsafe or unsupported setup link %s', (value) => {
    expect(() => parseNativeTotpSetupUri(value)).toThrow();
  });

  it('indexes TOTP only through the iOS native bridge and reads both outboxes', async () => {
    const calls: Array<{ method: string; options: Record<string, unknown> }> = [];
    (window as unknown as { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => true,
      isPluginAvailable: () => true,
      getPlatform: () => 'ios',
      nativePromise: async (_plugin: string, method: string, options: Record<string, unknown>) => {
        calls.push({ method, options });
        if (method === 'replaceCredentialIndex') return { indexed: 1 };
        if (method === 'replacePasskeyIndex') return { indexed: 0 };
        if (method === 'replaceTotpIndex') return { indexed: 1 };
        if (method === 'getPendingCredentialSaves') return { saves: [{ id: 'save', createdAt: 'now' }] };
        if (method === 'getPendingTotpSetups') {
          return { setups: [{ id: 'totp', createdAt: 'now', scheme: 'otpauth' }] };
        }
        return {};
      },
    };
    const now = new Date().toISOString();
    const login: LoginItem = {
      id: 'login-1',
      type: 'login',
      name: 'Example',
      username: 'ryan@example.com',
      password: 'password',
      uris: ['https://example.com'],
      totp: 'otpauth://totp/Example:ryan?secret=JBSWY3DPEHPK3PXP&issuer=Example',
      tags: [],
      favorite: false,
      createdAt: now,
      updatedAt: now,
      revisionDate: now,
    };
    await expect(syncNativeAutofillIndex([login], 'account-1', new Uint8Array(32).fill(7)))
      .resolves.toEqual({ passwords: 1, passkeys: 0, oneTimeCodes: 1 });
    expect(calls.find((call) => call.method === 'replaceTotpIndex')?.options).toEqual({
      accountId: 'account-1',
      totps: [expect.objectContaining({ id: 'login-1', username: 'ryan@example.com' })],
    });
    await expect(getPendingNativeCredentialSaves()).resolves.toHaveLength(1);
    await expect(getPendingNativeTotpSetups()).resolves.toHaveLength(1);
  });
});

function integerField(field: number, value: number): Uint8Array {
  return Uint8Array.from([...varint(field << 3), ...varint(value)]);
}

function bytesField(field: number, value: Uint8Array): Uint8Array {
  return Uint8Array.from([...varint((field << 3) | 2), ...varint(value.length), ...value]);
}

function textField(field: number, value: string): Uint8Array {
  return bytesField(field, new TextEncoder().encode(value));
}

function varint(value: number): number[] {
  const result: number[] = [];
  let remaining = value;
  do {
    const byte = remaining & 0x7f;
    remaining >>>= 7;
    result.push(remaining > 0 ? byte | 0x80 : byte);
  } while (remaining > 0);
  return result;
}

function concat(...values: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(values.reduce((length, value) => length + value.length, 0));
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}
