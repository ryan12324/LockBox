import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Miniflare } from 'miniflare';
import { base32Encode, totp } from '@lockbox/totp';

import { app } from '../index.js';

type TestEnv = Parameters<typeof app.request>[2];

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const TEST_SALT = toBase64(new Uint8Array(16).fill(3));
const TEST_ENCRYPTED_USER_KEY = `${toBase64(new Uint8Array(12).fill(4))}.${toBase64(
  new Uint8Array(80).fill(5)
)}`;

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

describe('2FA pre-authentication boundary', () => {
  let miniflare: Miniflare;
  let database: D1Database;

  beforeAll(async () => {
    miniflare = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: ['DB'],
    });
    database = (await miniflare.getD1Database('DB')) as unknown as D1Database;

    const migrationsDir = resolve(import.meta.dirname, '../../drizzle');
    const migrationFiles = (await readdir(migrationsDir))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    for (const migrationFile of migrationFiles) {
      const migration = await readFile(resolve(migrationsDir, migrationFile), 'utf8');
      const statements = migration
        .split(/;\s*(?:-->\s*statement-breakpoint)?\s*/)
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const statement of statements) {
        await database.prepare(statement).run();
      }
    }
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  it('cannot use a password-only challenge as a vault session', async () => {
    const env = {
      DB: database,
      AUTH_LIMITER: { limit: async () => ({ success: true }) },
    } as unknown as TestEnv;

    const authHash = toBase64(new Uint8Array(32).fill(6));
    const registerResponse = await app.request(
      '/api/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'twofa@example.com',
          authHash,
          encryptedUserKey: TEST_ENCRYPTED_USER_KEY,
          kdfConfig: { type: 'argon2id', iterations: 3, memory: 65536, parallelism: 4 },
          salt: TEST_SALT,
        }),
      },
      env
    );
    expect(registerResponse.status).toBe(201);
    const registered = (await registerResponse.json()) as { user: { id: string } };

    const secret = new Uint8Array(20).fill(7);
    await database
      .prepare(
        `INSERT INTO user_totp_settings
          (user_id, encrypted_totp_secret, enabled, created_at)
         VALUES (?, ?, 1, ?)`
      )
      .bind(registered.user.id, base32Encode(secret), new Date().toISOString())
      .run();

    const initialSession = await database
      .prepare('SELECT token FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(registered.user.id)
      .first<{ token: string }>();
    const statusResponse = await app.request(
      '/api/auth/2fa/status',
      { headers: { Authorization: `Bearer ${initialSession!.token}` } },
      env
    );
    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toEqual({ enabled: true });

    const loginResponse = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'twofa@example.com', authHash }),
      },
      env
    );
    expect(loginResponse.status).toBe(200);
    const login = (await loginResponse.json()) as {
      requires2FA: boolean;
      tempToken: string;
    };
    expect(login.requires2FA).toBe(true);

    const bypassAttempt = await app.request(
      '/api/vault',
      { headers: { Authorization: `Bearer ${login.tempToken}` } },
      env
    );
    expect(bypassAttempt.status).toBe(401);

    const validationResponse = await app.request(
      '/api/auth/2fa/validate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken: login.tempToken, code: await totp(secret) }),
      },
      env
    );
    expect(validationResponse.status).toBe(200);
    const validation = (await validationResponse.json()) as { token: string };
    expect(validation.token).not.toBe(login.tempToken);

    const authenticatedRequest = await app.request(
      '/api/vault',
      { headers: { Authorization: `Bearer ${validation.token}` } },
      env
    );
    expect(authenticatedRequest.status).toBe(200);

    const replayResponse = await app.request(
      '/api/auth/2fa/validate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken: login.tempToken, code: await totp(secret) }),
      },
      env
    );
    expect(replayResponse.status).toBe(401);

    const limitedLoginResponse = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'twofa@example.com', authHash }),
      },
      env
    );
    const limitedLogin = (await limitedLoginResponse.json()) as { tempToken: string };
    const currentCode = await totp(secret);
    const invalidCode = currentCode === '000000' ? '000001' : '000000';
    for (let attempt = 0; attempt < 5; attempt++) {
      const invalid = await app.request(
        '/api/auth/2fa/validate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tempToken: limitedLogin.tempToken, code: invalidCode }),
        },
        env
      );
      expect(invalid.status).toBe(401);
    }
    const afterAttemptLimit = await app.request(
      '/api/auth/2fa/validate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken: limitedLogin.tempToken, code: await totp(secret) }),
      },
      env
    );
    expect(afterAttemptLimit.status).toBe(401);

    const backupCode = 'a1b2c3d4e5f60718';
    await database
      .prepare(
        'INSERT INTO backup_codes (id, user_id, code_hash, used, created_at) VALUES (?, ?, ?, 0, ?)'
      )
      .bind(
        crypto.randomUUID(),
        registered.user.id,
        await sha256Hex(backupCode),
        new Date().toISOString()
      )
      .run();

    const loginForBackup = async () => {
      const response = await app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'twofa@example.com', authHash }),
        },
        env
      );
      return (await response.json()) as { tempToken: string };
    };
    const validateBackup = (tempToken: string) =>
      app.request(
        '/api/auth/2fa/validate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tempToken, code: backupCode }),
        },
        env
      );

    const firstBackupLogin = await loginForBackup();
    expect((await validateBackup(firstBackupLogin.tempToken)).status).toBe(200);
    const secondBackupLogin = await loginForBackup();
    expect((await validateBackup(secondBackupLogin.tempToken)).status).toBe(401);
  });
});
