import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Mock fs, path, and os before importing session module
vi.mock('node:fs');
vi.mock('node:os', () => ({
  default: { homedir: () => '/mock-home' },
  homedir: () => '/mock-home',
}));

const SESSION_DIR = path.join('/mock-home', '.lockbox');
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');

// Import after mocks are set up
const { getSession, saveSession, clearSession, getApiUrl } = await import('../lib/session.js');

describe('session management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['LOCKBOX_API_URL'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getSession', () => {
    it('returns null when session file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const session = getSession();
      expect(session).toBeNull();
    });

    it('returns session data when valid session file exists', () => {
      const mockSession = {
        token: 'test-token',
        userId: 'user-123',
        email: 'test@example.com',
        apiUrl: 'https://api.lockbox.dev',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockSession));

      const session = getSession();
      expect(session).toEqual(mockSession);
    });

    it('returns null for malformed JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('not json');

      const session = getSession();
      expect(session).toBeNull();
    });

    it('returns null for incomplete session data', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ token: 'test' }));

      const session = getSession();
      expect(session).toBeNull();
    });

    it('returns null when readFileSync throws', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const session = getSession();
      expect(session).toBeNull();
    });
  });

  describe('saveSession', () => {
    it('creates directory and writes session file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const session = {
        token: 'test-token',
        userId: 'user-123',
        email: 'test@example.com',
        apiUrl: 'https://api.lockbox.dev',
      };

      saveSession(session);

      expect(fs.mkdirSync).toHaveBeenCalledWith(SESSION_DIR, {
        recursive: true,
        mode: 0o700,
      });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        SESSION_FILE,
        JSON.stringify(session, null, 2),
        { mode: 0o600 }
      );
    });

    it('skips directory creation when it already exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      saveSession({
        token: 'test',
        userId: 'u',
        email: 'e',
        apiUrl: 'https://api.test',
      });

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('clearSession', () => {
    it('removes session file when it exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockReturnValue(undefined);

      clearSession();

      expect(fs.unlinkSync).toHaveBeenCalledWith(SESSION_FILE);
    });

    it('does nothing when session file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      clearSession();

      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('does not throw when unlinkSync fails', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => clearSession()).not.toThrow();
    });
  });

  describe('getApiUrl', () => {
    it('returns flag URL when provided', () => {
      expect(getApiUrl('https://flag.url')).toBe('https://flag.url');
    });

    it('returns session URL when no flag and session exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          token: 't',
          userId: 'u',
          email: 'e',
          apiUrl: 'https://session.url',
        })
      );

      expect(getApiUrl()).toBe('https://session.url');
    });

    it('returns env var when no flag and no session', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      process.env['LOCKBOX_API_URL'] = 'https://env.url';

      expect(getApiUrl()).toBe('https://env.url');
    });

    it('throws when no URL is configured', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => getApiUrl()).toThrow('No API URL configured');
    });
  });
});
