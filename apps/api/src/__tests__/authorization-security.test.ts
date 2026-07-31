import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Miniflare } from 'miniflare';

import { app } from '../index.js';

type TestEnv = Parameters<typeof app.request>[2];

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const TEST_SALT = toBase64(new Uint8Array(16).fill(3));
const TEST_ENCRYPTED_USER_KEY = `${toBase64(new Uint8Array(12).fill(4))}.${toBase64(
  new Uint8Array(80).fill(5)
)}`;
const OWNER_WRAPPED_FOLDER_KEY = toBase64(new Uint8Array(256).fill(6));
const MEMBER_WRAPPED_FOLDER_KEY = toBase64(new Uint8Array(256).fill(7));

function testAuthHash(seed: number): string {
  return toBase64(new Uint8Array(32).fill(seed));
}

describe('authorization and limited-share security boundaries', () => {
  let miniflare: Miniflare;
  let database: D1Database;
  let bucket: R2Bucket;
  let env: TestEnv;
  let ownerToken: string;
  let ownerId: string;
  let memberToken: string;
  let memberId: string;
  let teamId: string;

  async function register(email: string): Promise<{ token: string; userId: string }> {
    const authHash = testAuthHash(email.charCodeAt(0));
    const response = await app.request(
      '/api/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          authHash,
          encryptedUserKey: TEST_ENCRYPTED_USER_KEY,
          kdfConfig: { type: 'argon2id', iterations: 3, memory: 65536, parallelism: 4 },
          salt: TEST_SALT,
        }),
      },
      env
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { token: string; user: { id: string } };
    return { token: body.token, userId: body.user.id };
  }

  beforeAll(async () => {
    miniflare = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: ['DB'],
      r2Buckets: ['ATTACHMENTS'],
    });
    database = (await miniflare.getD1Database('DB')) as unknown as D1Database;
    bucket = (await miniflare.getR2Bucket('ATTACHMENTS')) as unknown as R2Bucket;

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
      for (const statement of statements) await database.prepare(statement).run();
    }

    env = {
      DB: database,
      ATTACHMENTS: bucket,
      AUTH_LIMITER: { limit: async () => ({ success: true }) },
    } as unknown as TestEnv;

    const owner = await register('owner@example.com');
    const member = await register('member@example.com');
    ownerToken = owner.token;
    ownerId = owner.userId;
    memberToken = member.token;
    memberId = member.userId;

    const createTeam = await app.request(
      '/api/teams',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Security team' }),
      },
      env
    );
    expect(createTeam.status).toBe(201);
    teamId = ((await createTeam.json()) as { team: { id: string } }).team.id;
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  it('normalizes account emails and prevents case-variant duplicates', async () => {
    const mixedCaseAuthHash = testAuthHash(8);
    const registration = await app.request(
      '/api/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: '  Mixed.Case@Example.COM ',
          authHash: mixedCaseAuthHash,
          encryptedUserKey: TEST_ENCRYPTED_USER_KEY,
          kdfConfig: { type: 'argon2id', iterations: 3, memory: 65536, parallelism: 4 },
          salt: TEST_SALT,
        }),
      },
      env
    );
    expect(registration.status).toBe(201);
    const registrationBody = (await registration.json()) as { user: { email: string } };
    expect(registrationBody.user.email).toBe('mixed.case@example.com');

    const login = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'MIXED.CASE@EXAMPLE.COM',
          authHash: mixedCaseAuthHash,
        }),
      },
      env
    );
    expect(login.status).toBe(200);

    const duplicate = await app.request(
      '/api/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'mixed.case@example.com',
          authHash: testAuthHash(9),
          encryptedUserKey: TEST_ENCRYPTED_USER_KEY,
          kdfConfig: { type: 'argon2id', iterations: 3, memory: 65536, parallelism: 4 },
          salt: TEST_SALT,
        }),
      },
      env
    );
    expect(duplicate.status).toBe(409);
  });

  it('returns a correctly sized deterministic fake salt for unknown accounts', async () => {
    const requestParams = () =>
      app.request('/api/auth/kdf-params?email=missing%40example.com', {}, env);
    const first = await requestParams();
    const second = await requestParams();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = (await first.json()) as { salt: string };
    const secondBody = (await second.json()) as { salt: string };
    expect(firstBody.salt).toBe(secondBody.salt);
    expect(Uint8Array.from(atob(firstBody.salt), (character) => character.charCodeAt(0))).toHaveLength(16);
  });

  it('rejects malformed or resource-exhausting account crypto parameters', async () => {
    const validBody = {
      email: 'invalid-crypto@example.com',
      authHash: testAuthHash(12),
      encryptedUserKey: TEST_ENCRYPTED_USER_KEY,
      kdfConfig: { type: 'argon2id', iterations: 3, memory: 65536, parallelism: 4 },
      salt: TEST_SALT,
    };
    const invalidBodies = [
      { ...validBody, authHash: toBase64(new Uint8Array(31)) },
      { ...validBody, salt: toBase64(new Uint8Array(15)) },
      { ...validBody, encryptedUserKey: `${toBase64(new Uint8Array(11))}.${toBase64(new Uint8Array(16))}` },
      { ...validBody, kdfConfig: { type: 'argon2id', iterations: 11, memory: 65536, parallelism: 4 } },
      { ...validBody, kdfConfig: { type: 'argon2id', iterations: 3, memory: 1_048_577, parallelism: 4 } },
      { ...validBody, kdfConfig: { type: 'pbkdf2', iterations: 99_999 } },
    ];

    for (const body of invalidBodies) {
      const response = await app.request(
        '/api/auth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        env
      );
      expect(response.status).toBe(400);
    }

    const malformedLogin = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', authHash: 'not-base64' }),
      },
      env
    );
    expect(malformedLogin.status).toBe(401);

    const invalidPasswordChange = await app.request(
      '/api/auth/change-password',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          currentAuthHash: testAuthHash('owner@example.com'.charCodeAt(0)),
          newAuthHash: testAuthHash(13),
          newEncryptedUserKey: TEST_ENCRYPTED_USER_KEY,
          newKdfConfig: { type: 'argon2id', iterations: 3, memory: 7_000, parallelism: 4 },
          newSalt: TEST_SALT,
        }),
      },
      env
    );
    expect(invalidPasswordChange.status).toBe(400);
  });

  it('fails malformed sync changes closed and conflicts on cross-account duplicate IDs', async () => {
    const invalidSince = await app.request(
      '/api/sync?since=not-a-date',
      { headers: { Authorization: `Bearer ${ownerToken}` } },
      env
    );
    expect(invalidSince.status).toBe(400);

    const malformedPush = await app.request(
      '/api/sync/push',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          changes: [
            null,
            { operation: 'create', itemId: 'missing-type', encryptedData: 'aXY.YQ==', revisionDate: '2026-01-01T00:00:00.000Z' },
            { operation: 'update', itemId: 'x', tags: 'not-an-array' },
          ],
        }),
      },
      env
    );
    expect(malformedPush.status).toBe(200);
    const malformedBody = (await malformedPush.json()) as {
      results: Array<{ status: string }>;
    };
    expect(malformedBody.results.map((result) => result.status)).toEqual([
      'conflict',
      'conflict',
      'conflict',
    ]);

    const ownerCreate = await app.request(
      '/api/sync/push',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          changes: [{
            operation: 'create',
            itemId: 'cross-account-duplicate',
            type: 'login',
            encryptedData: 'aXY.YQ==',
            revisionDate: '2026-01-01T00:00:00.000Z',
          }],
        }),
      },
      env
    );
    expect(ownerCreate.status).toBe(200);

    const duplicatePush = await app.request(
      '/api/sync/push',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({
          changes: [{
            operation: 'create',
            itemId: 'cross-account-duplicate',
            type: 'login',
            encryptedData: 'aXY.YQ==',
            revisionDate: '2026-01-01T00:00:00.000Z',
          }],
        }),
      },
      env
    );
    expect(duplicatePush.status).toBe(200);
    expect(await duplicatePush.json()).toMatchObject({
      results: [{ itemId: 'cross-account-duplicate', status: 'conflict' }],
    });
  });

  it('rejects prototype-property and owner role assignment through invites', async () => {
    for (const role of ['constructor', '__proto__', 'owner']) {
      const response = await app.request(
        `/api/teams/${teamId}/invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ownerToken}`,
          },
          body: JSON.stringify({ email: 'member@example.com', role }),
        },
        env
      );
      expect(response.status).toBe(400);
    }
  });

  it('fails closed for a legacy membership containing an unknown role', async () => {
    await database
      .prepare(
        'INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)'
      )
      .bind(teamId, memberId, 'constructor', new Date().toISOString())
      .run();
    const memberSession = await database
      .prepare('SELECT token FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(memberId)
      .first<{ token: string }>();

    const response = await app.request(
      `/api/teams/${teamId}`,
      { headers: { Authorization: `Bearer ${memberSession!.token}` } },
      env
    );
    expect(response.status).toBe(403);

    await database
      .prepare('UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?')
      .bind('member', teamId, memberId)
      .run();
  });

  it('stores supplied wrapped folder keys and returns only the caller key', async () => {
    const createFolder = await app.request(
      '/api/vault/folders',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Shared' }),
      },
      env
    );
    expect(createFolder.status).toBe(201);
    const folderId = ((await createFolder.json()) as { folder: { id: string } }).folder.id;

    const share = await app.request(
      `/api/sharing/folders/${folderId}/share`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          teamId,
          permissionLevel: 'read_only',
          memberKeys: [
            { userId: ownerId, encryptedFolderKey: OWNER_WRAPPED_FOLDER_KEY },
            { userId: memberId, encryptedFolderKey: MEMBER_WRAPPED_FOLDER_KEY },
          ],
        }),
      },
      env
    );
    expect(share.status).toBe(201);

    const memberSession = await database
      .prepare('SELECT token FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(memberId)
      .first<{ token: string }>();
    const keyResponse = await app.request(
      `/api/sharing/folders/${folderId}/keys`,
      { headers: { Authorization: `Bearer ${memberSession!.token}` } },
      env
    );
    expect(keyResponse.status).toBe(200);
    const keyBody = (await keyResponse.json()) as {
      key: { userId: string; encryptedFolderKey: string };
    };
    expect(keyBody.key).toMatchObject({
      userId: memberId,
      encryptedFolderKey: MEMBER_WRAPPED_FOLDER_KEY,
    });

    await database
      .prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?')
      .bind(teamId, memberId)
      .run();

    const staleKeyResponse = await app.request(
      `/api/sharing/folders/${folderId}/keys`,
      { headers: { Authorization: `Bearer ${memberSession!.token}` } },
      env
    );
    const staleItemsResponse = await app.request(
      `/api/sharing/folders/${folderId}/items`,
      { headers: { Authorization: `Bearer ${memberSession!.token}` } },
      env
    );
    expect(staleKeyResponse.status).toBe(403);
    expect(staleItemsResponse.status).toBe(403);

    await database
      .prepare(
        'INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)'
      )
      .bind(teamId, memberId, 'member', new Date().toISOString())
      .run();
  });

  it('validates sharing key material and refuses unsafe key rotation', async () => {
    const generated = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2_048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt']
    );
    const publicKey = JSON.stringify(await crypto.subtle.exportKey('jwk', generated.publicKey));
    const encryptedPrivateKey = `${toBase64(new Uint8Array(12).fill(8))}.${toBase64(
      new Uint8Array(64).fill(9)
    )}`;

    const create = await app.request(
      '/api/auth/keypair',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ publicKey, encryptedPrivateKey }),
      },
      env
    );
    expect(create.status).toBe(201);

    const retry = await app.request(
      '/api/auth/keypair',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ publicKey, encryptedPrivateKey }),
      },
      env
    );
    expect(retry.status).toBe(200);

    const rotate = await app.request(
      '/api/auth/keypair',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          publicKey,
          encryptedPrivateKey: `${toBase64(new Uint8Array(12).fill(10))}.${toBase64(
            new Uint8Array(64).fill(11)
          )}`,
        }),
      },
      env
    );
    expect(rotate.status).toBe(409);

    const malformed = await app.request(
      '/api/auth/keypair',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({ publicKey: '{}', encryptedPrivateKey: 'invalid' }),
      },
      env
    );
    expect(malformed.status).toBe(400);
  });

  it('rejects private or ambiguous alias proxy URLs before storing them', async () => {
    const invalidBaseUrls = [
      'https://127.0.0.1',
      'http://aliases.example.com',
      'https://user:pass@aliases.example.com',
      'https://aliases.example.com?redirect=https://127.0.0.1',
      'https://aliases.local',
    ];

    for (const baseUrl of invalidBaseUrls) {
      const response = await app.request(
        '/api/settings/alias',
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ownerToken}`,
          },
          body: JSON.stringify({
            provider: 'simplelogin',
            encryptedApiKey: 'iv.ciphertext',
            baseUrl,
          }),
        },
        env
      );
      expect(response.status, baseUrl).toBe(400);
    }

    const valid = await app.request(
      '/api/settings/alias',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          provider: 'simplelogin',
          encryptedApiKey: 'iv.ciphertext',
          baseUrl: 'https://aliases.example.com/api/',
        }),
      },
      env
    );
    expect(valid.status).toBe(200);

    const stored = await app.request(
      '/api/settings/alias',
      { headers: { Authorization: `Bearer ${ownerToken}` } },
      env
    );
    expect(stored.status).toBe(200);
    expect(await stored.json()).toMatchObject({
      provider: 'simplelogin',
      encryptedApiKey: 'iv.ciphertext',
      baseUrl: 'https://aliases.example.com/api',
    });
  });

  it('syncs a restored ciphertext even when its AAD revision moves backwards', async () => {
    const originalRevision = '2025-01-01T00:00:00.000Z';
    const updatedRevision = '2026-01-01T00:00:00.000Z';
    const create = await app.request(
      '/api/vault/items',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          id: 'restore-sync-item',
          type: 'login',
          encryptedData: 'aXY.Y2lwaGVyLW9yaWdpbmFs',
          revisionDate: originalRevision,
        }),
      },
      env
    );
    expect(create.status).toBe(201);

    const update = await app.request(
      '/api/vault/items/restore-sync-item',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          encryptedData: 'aXY.Y2lwaGVyLXVwZGF0ZWQ=',
          revisionDate: updatedRevision,
          expectedRevisionDate: originalRevision,
        }),
      },
      env
    );
    expect(update.status).toBe(200);

    const cursorResponse = await app.request(
      '/api/sync',
      { headers: { Authorization: `Bearer ${ownerToken}` } },
      env
    );
    const cursor = ((await cursorResponse.json()) as { serverTimestamp: string }).serverTimestamp;

    const versions = await app.request(
      '/api/vault/items/restore-sync-item/versions',
      { headers: { Authorization: `Bearer ${ownerToken}` } },
      env
    );
    const versionBody = (await versions.json()) as {
      versions: Array<{ id: string; encryptedData: string; revisionDate: string }>;
    };
    expect(versionBody.versions[0]).toMatchObject({
      encryptedData: 'aXY.Y2lwaGVyLW9yaWdpbmFs',
      revisionDate: originalRevision,
    });

    const restore = await app.request(
      `/api/vault/items/restore-sync-item/versions/${versionBody.versions[0].id}/restore`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${ownerToken}` },
      },
      env
    );
    expect(restore.status).toBe(200);

    const delta = await app.request(
      `/api/sync?since=${encodeURIComponent(cursor)}`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
      env
    );
    expect(delta.status).toBe(200);
    const deltaBody = (await delta.json()) as {
      added: Array<{ id: string; revisionDate: string }>;
      modified: Array<{ id: string; revisionDate: string }>;
    };
    const synced = [...deltaBody.added, ...deltaBody.modified].find(
      (item) => item.id === 'restore-sync-item'
    );
    expect(synced?.revisionDate).toBe(originalRevision);
  });

  it('snapshots and restores ciphertext metadata across direct and sync updates', async () => {
    const createFolder = async (name: string) => {
      const response = await app.request(
        '/api/vault/folders',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ownerToken}`,
          },
          body: JSON.stringify({ name }),
        },
        env
      );
      expect(response.status).toBe(201);
      return ((await response.json()) as { folder: { id: string } }).folder.id;
    };

    const originalFolderId = await createFolder('History original');
    const updatedFolderId = await createFolder('History updated');
    const itemId = 'metadata-history-item';
    const originalRevision = '2025-03-01T00:00:00.000Z';
    const updatedRevision = '2025-04-01T00:00:00.000Z';
    const syncedRevision = '2025-05-01T00:00:00.000Z';

    const create = await app.request(
      '/api/vault/items',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          id: itemId,
          type: 'login',
          encryptedData: 'aXY.b3JpZ2luYWw=',
          revisionDate: originalRevision,
          folderId: originalFolderId,
          tags: ['original'],
          favorite: false,
        }),
      },
      env
    );
    expect(create.status).toBe(201);

    const update = await app.request(
      `/api/vault/items/${itemId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          encryptedData: 'aXY.dXBkYXRlZA==',
          revisionDate: updatedRevision,
          folderId: updatedFolderId,
          tags: ['updated'],
          favorite: true,
          expectedRevisionDate: originalRevision,
        }),
      },
      env
    );
    expect(update.status).toBe(200);

    const staleUpdate = await app.request(
      `/api/vault/items/${itemId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          encryptedData: 'aXY.c3RhbGU=',
          revisionDate: '2025-04-15T00:00:00.000Z',
          expectedRevisionDate: originalRevision,
        }),
      },
      env
    );
    expect(staleUpdate.status).toBe(409);
    expect(await staleUpdate.json()).toMatchObject({
      error: 'Item changed on another client',
      item: { revisionDate: updatedRevision },
    });

    const syncUpdate = await app.request(
      '/api/sync/push',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          changes: [{
            operation: 'update',
            itemId,
            encryptedData: 'aXY.c3luY2Vk',
            revisionDate: syncedRevision,
            folderId: null,
            tags: ['synced'],
            favorite: false,
            expectedRevisionDate: updatedRevision,
          }],
        }),
      },
      env
    );
    expect(syncUpdate.status).toBe(200);
    expect(await syncUpdate.json()).toMatchObject({ results: [{ status: 'ok' }] });

    const history = await app.request(
      `/api/vault/items/${itemId}/versions`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
      env
    );
    expect(history.status).toBe(200);
    const historyBody = (await history.json()) as {
      versions: Array<{
        id: string;
        revisionDate: string;
        folderId: string | null;
        tags: string[];
        favorite: boolean;
      }>;
    };
    const original = historyBody.versions.find(
      (version) => version.revisionDate === originalRevision
    );
    const beforeSync = historyBody.versions.find(
      (version) => version.revisionDate === updatedRevision
    );
    expect(original).toMatchObject({
      folderId: originalFolderId,
      tags: ['original'],
      favorite: false,
    });
    expect(beforeSync).toMatchObject({
      folderId: updatedFolderId,
      tags: ['updated'],
      favorite: true,
    });

    const restore = await app.request(
      `/api/vault/items/${itemId}/versions/${original!.id}/restore`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      },
      env
    );
    expect(restore.status).toBe(200);
    expect(await restore.json()).toMatchObject({
      item: {
        encryptedData: 'aXY.b3JpZ2luYWw=',
        revisionDate: originalRevision,
        folderId: originalFolderId,
        tags: ['original'],
        favorite: false,
      },
    });
  });

  it('fails closed on shared vault data while travel mode is enabled', async () => {
    const createTeam = await app.request(
      '/api/teams',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Travel security team' }),
      },
      env
    );
    expect(createTeam.status).toBe(201);
    const travelTeamId = ((await createTeam.json()) as { team: { id: string } }).team.id;
    await database
      .prepare('INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
      .bind(travelTeamId, memberId, 'member', new Date().toISOString())
      .run();

    const createFolder = await app.request(
      '/api/vault/folders',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Shared travel-sensitive folder' }),
      },
      env
    );
    const sharedFolderId = ((await createFolder.json()) as { folder: { id: string } }).folder.id;

    const share = await app.request(
      `/api/sharing/folders/${sharedFolderId}/share`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          teamId: travelTeamId,
          permissionLevel: 'read_only',
          memberKeys: [
            { userId: ownerId, encryptedFolderKey: OWNER_WRAPPED_FOLDER_KEY },
            { userId: memberId, encryptedFolderKey: MEMBER_WRAPPED_FOLDER_KEY },
          ],
        }),
      },
      env
    );
    expect(share.status).toBe(201);

    const createSharedItem = await app.request(
      '/api/vault/items',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          id: 'travel-shared-item',
          type: 'login',
          encryptedData: 'aXY.c2hhcmVk',
          revisionDate: '2025-06-01T00:00:00.000Z',
          folderId: sharedFolderId,
        }),
      },
      env
    );
    expect(createSharedItem.status).toBe(201);

    const createPersonalItem = await app.request(
      '/api/vault/items',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({
          id: 'travel-personal-root-item',
          type: 'login',
          encryptedData: 'aXY.cGVyc29uYWw=',
          revisionDate: '2025-06-01T00:00:00.000Z',
        }),
      },
      env
    );
    expect(createPersonalItem.status).toBe(201);

    const enable = await app.request(
      '/api/settings/travel-mode',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({ enabled: true }),
      },
      env
    );
    expect(enable.status).toBe(200);

    const sync = await app.request(
      '/api/sync',
      { headers: { Authorization: `Bearer ${memberToken}` } },
      env
    );
    expect(sync.status).toBe(200);
    const syncBody = (await sync.json()) as {
      added: Array<{ id: string }>;
      sharedItems: unknown[];
      sharedFolders: unknown[];
    };
    expect(syncBody.added.some((item) => item.id === 'travel-personal-root-item')).toBe(true);
    expect(syncBody.sharedItems).toEqual([]);
    expect(syncBody.sharedFolders).toEqual([]);

    await app.request(
      '/api/settings/travel-mode',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({ enabled: false }),
      },
      env
    );
  });

  it('returns canonical public vault and folder shapes without internal ownership fields', async () => {
    const createFolder = await app.request(
      '/api/vault/folders',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Canonical folder' }),
      },
      env
    );
    expect(createFolder.status).toBe(201);
    const folderBody = (await createFolder.json()) as { folder: Record<string, unknown> };
    expect(folderBody.folder).toMatchObject({
      name: 'Canonical folder',
      travelSafe: true,
    });
    expect(folderBody.folder).not.toHaveProperty('userId');
    const folderId = folderBody.folder.id as string;

    const createItem = await app.request(
      '/api/vault/items',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          id: 'canonical-public-item',
          type: 'login',
          encryptedData: 'aXY.Y2lwaGVydGV4dA',
          revisionDate: '2026-02-01T00:00:00.000Z',
          folderId,
          tags: ['work'],
          favorite: true,
        }),
      },
      env
    );
    expect(createItem.status).toBe(201);
    const itemBody = (await createItem.json()) as { item: Record<string, unknown> };
    expect(itemBody.item).toMatchObject({
      id: 'canonical-public-item',
      folderId,
      tags: ['work'],
      favorite: true,
      deletedAt: null,
    });
    expect(itemBody.item).not.toHaveProperty('userId');
    expect(itemBody.item).not.toHaveProperty('serverModifiedAt');

    const list = await app.request(
      '/api/vault',
      { headers: { Authorization: `Bearer ${ownerToken}` } },
      env
    );
    const listBody = (await list.json()) as {
      items: Array<Record<string, unknown>>;
      folders: Array<Record<string, unknown>>;
    };
    const listedItem = listBody.items.find((item) => item.id === 'canonical-public-item');
    const listedFolder = listBody.folders.find((folder) => folder.id === folderId);
    expect(listedItem).toMatchObject({ tags: ['work'], favorite: true });
    expect(listedItem).not.toHaveProperty('userId');
    expect(listedFolder).toMatchObject({ travelSafe: true });
    expect(listedFolder).not.toHaveProperty('userId');
  });

  it('atomically enforces one-time links and allows maxViews=0 as unlimited', async () => {
    const createLink = async (id: string, tokenBytes: Uint8Array, maxViews: number) => {
      const response = await app.request(
        '/api/share-links',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ownerToken}`,
          },
          body: JSON.stringify({
            id,
            encryptedItem: 'aXY.Y2lwaGVydGV4dA',
            tokenHash: await sha256Hex(tokenBytes),
            itemName: 'Shared item',
            maxViews,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }),
        },
        env
      );
      expect(response.status).toBe(201);
    };

    const oneTimeToken = new Uint8Array(16).fill(9);
    const oneTimeId = '1'.repeat(32);
    await createLink(oneTimeId, oneTimeToken, 1);
    const redeemOnce = () =>
      app.request(
        `/api/share-links/${oneTimeId}/redeem`,
        { headers: { Authorization: `Bearer ${toBase64(oneTimeToken)}` } },
        env
      );
    const concurrent = await Promise.all([redeemOnce(), redeemOnce()]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([200, 410]);

    const unlimitedToken = new Uint8Array(16).fill(10);
    const unlimitedId = '2'.repeat(32);
    await createLink(unlimitedId, unlimitedToken, 0);
    for (let index = 0; index < 2; index++) {
      const response = await app.request(
        `/api/share-links/${unlimitedId}/redeem`,
        { headers: { Authorization: `Bearer ${toBase64(unlimitedToken)}` } },
        env
      );
      expect(response.status).toBe(200);
    }
  });

  it('rejects malformed share bearer tokens without throwing', async () => {
    const response = await app.request(
      `/api/share-links/${'3'.repeat(32)}/redeem`,
      { headers: { Authorization: 'Bearer not-base64!!!' } },
      env
    );
    expect(response.status).toBe(401);
  });

  it('stores document plaintext quota and purges all auxiliary item storage', async () => {
    const itemId = 'document-storage-item';
    const create = await app.request(
      '/api/vault/items',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          id: itemId,
          type: 'document',
          encryptedData: 'aXY.Y2lwaGVyLWRvY3VtZW50',
          revisionDate: '2026-01-01T00:00:00.000Z',
        }),
      },
      env
    );
    expect(create.status).toBe(201);

    const plaintextSize = 10;
    const envelope = new Uint8Array(plaintextSize + 33);
    const form = new FormData();
    form.append('file', new Blob([envelope]), 'document.lockbox');
    form.append('plaintextSize', String(plaintextSize));
    const upload = await app.request(
      `/api/vault/items/${itemId}/document`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: form,
      },
      env
    );
    expect(upload.status).toBe(200);
    expect(await upload.json()).toMatchObject({ success: true, size: plaintextSize });

    const quota = await app.request(
      '/api/vault/documents/quota',
      { headers: { Authorization: `Bearer ${ownerToken}` } },
      env
    );
    expect(await quota.json()).toEqual({ used: plaintextSize, limit: 500 * 1024 * 1024 });

    const attachmentId = crypto.randomUUID();
    await bucket.put(`${ownerId}/${itemId}/${attachmentId}`, new Uint8Array([1, 2, 3]));
    await database
      .prepare(
        'INSERT INTO attachments (id, item_id, user_id, encrypted_name, encrypted_mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        attachmentId,
        itemId,
        ownerId,
        'aXY.bmFtZQ',
        'aXY.bWltZQ',
        3,
        new Date().toISOString()
      )
      .run();

    const update = await app.request(
      `/api/vault/items/${itemId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          encryptedData: 'aXY.Y2lwaGVyLWRvY3VtZW50LTI',
          revisionDate: '2026-01-02T00:00:00.000Z',
          expectedRevisionDate: '2026-01-01T00:00:00.000Z',
        }),
      },
      env
    );
    expect(update.status).toBe(200);

    const remove = await app.request(
      `/api/vault/items/${itemId}/permanent`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${ownerToken}` } },
      env
    );
    expect(remove.status).toBe(200);

    expect(await bucket.head(`docs/${ownerId}/${itemId}`)).toBeNull();
    expect(await bucket.head(`${ownerId}/${itemId}/${attachmentId}`)).toBeNull();
    const attachmentCount = await database
      .prepare('SELECT count(*) AS count FROM attachments WHERE item_id = ?')
      .bind(itemId)
      .first<{ count: number }>();
    const versionCount = await database
      .prepare('SELECT count(*) AS count FROM vault_item_versions WHERE item_id = ?')
      .bind(itemId)
      .first<{ count: number }>();
    expect(attachmentCount?.count).toBe(0);
    expect(versionCount?.count).toBe(0);
  });

  it('deletes a team with shared folders without leaving member key access', async () => {
    const createTeam = await app.request(
      '/api/teams',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Disposable team' }),
      },
      env
    );
    const disposableTeamId = ((await createTeam.json()) as { team: { id: string } }).team.id;
    await database
      .prepare(
        'INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)'
      )
      .bind(disposableTeamId, memberId, 'member', new Date().toISOString())
      .run();

    const createFolder = await app.request(
      '/api/vault/folders',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Folder survives team deletion' }),
      },
      env
    );
    const folderId = ((await createFolder.json()) as { folder: { id: string } }).folder.id;
    const share = await app.request(
      `/api/sharing/folders/${folderId}/share`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          teamId: disposableTeamId,
          permissionLevel: 'read_write',
          memberKeys: [
            { userId: ownerId, encryptedFolderKey: OWNER_WRAPPED_FOLDER_KEY },
            { userId: memberId, encryptedFolderKey: MEMBER_WRAPPED_FOLDER_KEY },
          ],
        }),
      },
      env
    );
    expect(share.status).toBe(201);

    const removeTeam = await app.request(
      `/api/teams/${disposableTeamId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${ownerToken}` } },
      env
    );
    expect(removeTeam.status).toBe(200);

    const shareCount = await database
      .prepare('SELECT count(*) AS count FROM shared_folders WHERE team_id = ?')
      .bind(disposableTeamId)
      .first<{ count: number }>();
    const memberKeyCount = await database
      .prepare(
        'SELECT count(*) AS count FROM shared_folder_keys WHERE folder_id = ? AND user_id = ?'
      )
      .bind(folderId, memberId)
      .first<{ count: number }>();
    const ownerKeyCount = await database
      .prepare(
        'SELECT count(*) AS count FROM shared_folder_keys WHERE folder_id = ? AND user_id = ?'
      )
      .bind(folderId, ownerId)
      .first<{ count: number }>();
    const folderCount = await database
      .prepare('SELECT count(*) AS count FROM folders WHERE id = ?')
      .bind(folderId)
      .first<{ count: number }>();
    expect(shareCount?.count).toBe(0);
    expect(memberKeyCount?.count).toBe(0);
    expect(ownerKeyCount?.count).toBe(1);
    expect(folderCount?.count).toBe(1);
  });
});
