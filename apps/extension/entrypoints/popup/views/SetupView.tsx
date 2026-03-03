import React, { useState } from 'react';
import { Button, Input } from '@lockbox/design';
import { setApiBaseUrl } from '../../../lib/storage.js';

export function SetupView({ onComplete }: { onComplete: () => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const trimmed = url.trim().replace(/\/+$/, '');
    if (!trimmed) {
      setError('Please enter your vault URL');
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      setError('Invalid URL. Example: https://lockbox-api.you.workers.dev');
      return;
    }

    if (parsed.protocol !== 'https:') {
      setError('URL must use HTTPS');
      return;
    }

    setSaving(true);
    try {
      await setApiBaseUrl(parsed.origin);
      onComplete();
    } catch {
      setError('Failed to save URL');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="text-center">
        <div className="text-[32px] mb-2">🔐</div>
        <h1 className="text-lg font-bold text-[var(--color-text)]">Lockbox</h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Connect to your server</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && (
          <div className="px-3 py-2 bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-sm)] text-[var(--color-error)] text-xs">
            {error}
          </div>
        )}

        <div>
          <Input
            type="text"
            label="Vault URL"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://lockbox-api.you.workers.dev"
          />
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
            The URL of your self-hosted Lockbox vault
          </p>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={saving}
          style={{ width: '100%' }}
        >
          {saving ? 'Saving...' : 'Continue'}
        </Button>
      </form>
    </div>
  );
}
