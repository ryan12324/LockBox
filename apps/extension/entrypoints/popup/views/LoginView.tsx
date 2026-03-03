import React, { useState, useEffect } from 'react';
import { Button, Input } from '@lockbox/design';
import { sendMessage } from './shared.js';

export function LockedView({ onUnlock }: { onUnlock: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load saved email on mount
  useEffect(() => {
    chrome.storage.local.get('email').then((result) => {
      if (result.email) setEmail(result.email as string);
    });
  }, []);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await sendMessage<{ success: boolean; error?: string }>({
        type: 'unlock',
        email,
        password,
      });
      if (result.success) {
        onUnlock();
      } else {
        setError(result.error ?? 'Invalid credentials');
      }
    } catch {
      setError('Failed to connect to background service');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="text-center">
        <div className="text-[32px] mb-2">🔐</div>
        <h1 className="text-lg font-bold text-[var(--color-text)]">Lockbox</h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Sign in to your vault</p>
      </div>

      <form onSubmit={handleUnlock} className="flex flex-col gap-3">
        {error && (
          <div className="px-3 py-2 bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-sm)] text-[var(--color-error)] text-xs">
            {error}
          </div>
        )}

        <Input
          type="email"
          label="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        <Input
          type="password"
          label="Master Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Master password"
        />

        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={loading}
          style={{ width: '100%' }}
        >
          {loading ? 'Unlocking...' : 'Unlock Vault'}
        </Button>
      </form>

      <div className="text-center">
        <div className="text-xs text-[var(--color-text-tertiary)] my-1">or</div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          style={{ width: '100%' }}
          onClick={() => {
            sendMessage<{ success: boolean }>({ type: 'hw-key-unlock' })
              .then((res) => {
                if (res.success) onUnlock();
              })
              .catch(() => {});
          }}
        >
          🔑 Unlock with Hardware Key
        </Button>
      </div>
    </div>
  );
}
