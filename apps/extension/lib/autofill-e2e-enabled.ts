import type { LoginItem } from '@lockbox/types';
import type { AutofillE2eControlResult } from './autofill-e2e.js';

const ITEM_ID = 'authwell-autofill-e2e-login';
let fixture: LoginItem | null = null;

export function handleAutofillE2eControl(message: unknown): AutofillE2eControlResult {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    return { handled: false };
  }
  const candidate = message as Record<string, unknown>;
  if (candidate.type === 'e2e-reset-autofill') {
    fixture = null;
    return { handled: true, response: { success: true } };
  }
  if (candidate.type !== 'e2e-seed-autofill') return { handled: false };

  let origin: URL;
  try {
    origin = new URL(String(candidate.origin ?? ''));
  } catch {
    return {
      handled: true,
      response: { success: false, error: 'A valid test origin is required' },
    };
  }
  if (
    origin.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
  ) {
    return {
      handled: true,
      response: {
        success: false,
        error: 'AutoFill E2E is restricted to loopback origins',
      },
    };
  }

  const username = typeof candidate.username === 'string' ? candidate.username : '';
  const password = typeof candidate.password === 'string' ? candidate.password : '';
  const totp = typeof candidate.totp === 'string' ? candidate.totp : undefined;
  if (!username || !password || username.length > 10_000 || password.length > 100_000) {
    return {
      handled: true,
      response: { success: false, error: 'The AutoFill fixture is incomplete' },
    };
  }

  const now = new Date().toISOString();
  fixture = {
    id: ITEM_ID,
    type: 'login',
    name: 'Authwell AutoFill E2E',
    username,
    password,
    uris: [origin.origin],
    ...(totp ? { totp } : {}),
    tags: ['autofill-e2e'],
    favorite: false,
    createdAt: now,
    updatedAt: now,
    revisionDate: now,
  };
  return {
    handled: true,
    response: { success: true, itemId: fixture.id },
    enableInlineAutofill: true,
  };
}

export function getAutofillE2eItem(): LoginItem | null {
  return fixture;
}

export function resetAutofillE2e(): void {
  fixture = null;
}

export function updateAutofillE2ePassword(itemId: string, password: string): boolean {
  if (!fixture || fixture.id !== itemId) return false;
  fixture = { ...fixture, password };
  return true;
}
