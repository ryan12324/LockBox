/**
 * Session management for Lockbox CLI.
 * Stores session token in ~/.lockbox/session.json.
 * NEVER stores master password or encryption keys to disk.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface Session {
  token: string;
  userId: string;
  email: string;
  apiUrl: string;
}

const LOCKBOX_DIR = path.join(os.homedir(), '.lockbox');
const SESSION_FILE = path.join(LOCKBOX_DIR, 'session.json');

/** Ensure the ~/.lockbox directory exists with restrictive permissions. */
function ensureDir(): void {
  if (!fs.existsSync(LOCKBOX_DIR)) {
    fs.mkdirSync(LOCKBOX_DIR, { recursive: true, mode: 0o700 });
  }
}

/** Read the current session from disk. Returns null if no session exists. */
export function getSession(): Session | null {
  try {
    if (!fs.existsSync(SESSION_FILE)) return null;
    const data = fs.readFileSync(SESSION_FILE, 'utf-8');
    const parsed: unknown = JSON.parse(data);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'token' in parsed &&
      'userId' in parsed &&
      'email' in parsed &&
      'apiUrl' in parsed
    ) {
      return parsed as Session;
    }
    return null;
  } catch {
    return null;
  }
}

/** Save a session to disk. Only stores token and metadata — NEVER keys. */
export function saveSession(session: Session): void {
  ensureDir();
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), {
    mode: 0o600,
  });
}

/** Clear the session file from disk. */
export function clearSession(): void {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
    }
  } catch {
    // Ignore errors during cleanup
  }
}

/** Get the API URL from the session, CLI flag, or environment variable. */
export function getApiUrl(flagUrl?: string): string {
  if (flagUrl) return flagUrl;
  const session = getSession();
  if (session?.apiUrl) return session.apiUrl;
  if (process.env['LOCKBOX_API_URL']) return process.env['LOCKBOX_API_URL'];
  throw new Error(
    'No API URL configured. Use --api-url flag or set LOCKBOX_API_URL environment variable.'
  );
}
