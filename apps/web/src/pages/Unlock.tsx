import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deriveKey, decryptUserKey, fromBase64 } from '@lockbox/crypto';
import { useAuthStore } from '../store/auth.js';

export default function Unlock() {
  const navigate = useNavigate();
  const { session, setKeys, logout } = useAuthStore();

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!session) {
    navigate('/login');
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const salt = fromBase64(session!.salt);
      const masterKey = await deriveKey(password, salt, session!.kdfConfig);
      const userKey = await decryptUserKey(session!.encryptedUserKey, masterKey);

      setKeys(masterKey, userKey);
      navigate('/vault');
    } catch {
      setError('Incorrect master password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Vault Locked</h1>
          <p className="mt-2 text-[var(--color-text-tertiary)]">
            Signed in as <strong>{session.email}</strong>
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[var(--color-surface-raised)] border border-[var(--color-border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] p-8 space-y-5"
        >
          {error && (
            <div className="bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-md)] p-3 text-[var(--color-error)] text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              Master Password
            </label>
            <input
              name="masterPassword"
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-aura)] focus:border-[var(--color-border-strong)]"
              placeholder="Enter master password to unlock"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-40 text-[var(--color-primary-fg)] font-medium rounded-[var(--radius-md)] transition-colors"
          >
            {loading ? 'Unlocking...' : 'Unlock Vault'}
          </button>

          <button
            type="button"
            onClick={logout}
            className="w-full py-2 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
          >
            Sign out and use a different account
          </button>
        </form>
      </div>
    </div>
  );
}
