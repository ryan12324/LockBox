// Test utility factories for lockbox tests

export function createTestEncryptionKey(): Uint8Array {
  // Deterministic 32-byte key for tests (NOT for production)
  return new Uint8Array(32).fill(0x42);
}

export function createTestVaultItem(overrides?: Partial<{
  id: string, type: string, name: string, tags: string[], favorite: boolean,
  revisionDate: string, createdAt: string, updatedAt: string
}>) {
  return {
    id: 'test-id-' + Math.random().toString(36).slice(2),
    type: 'login' as const,
    name: 'Test Item',
    tags: [] as string[],
    favorite: false,
    revisionDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestLoginItem() {
  return {
    ...createTestVaultItem({ type: 'login' }),
    username: 'test@example.com',
    password: 'TestPassword123!',
    uris: ['https://example.com'],
    totp: undefined as string | undefined,
  };
}
