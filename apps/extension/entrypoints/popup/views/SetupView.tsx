import React, { useState } from 'react';
import { Button, Icon, Input } from '@lockbox/design';
import { discoverLockboxServer } from '../../../lib/discovery.js';
import { setServerConnection } from '../../../lib/storage.js';

export function SetupView({ onComplete }: { onComplete: () => void }) {
  const [url, setUrl] = useState('https://vault.authwell.app');
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

    setSaving(true);
    try {
      const connection = await discoverLockboxServer(trimmed);
      await setServerConnection(connection);
      onComplete();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Authwell could not discover the server for that web vault.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="extension-auth">
      <div className="extension-auth__heading">
        <img
          className="extension-auth__logo"
          src="/brand/authwell-logo-horizontal.png"
          alt="Authwell"
        />
        <p>Set up Authwell</p>
        <h1>Connect your web vault</h1>
        <small>Authwell will discover and verify its API automatically.</small>
      </div>

      <form onSubmit={handleSubmit} className="extension-auth__form">
        {error && (
          <div className="extension-auth__error" role="alert">
            <Icon name="alert-circle" size={18} /> <span>{error}</span>
          </div>
        )}

        <div>
          <Input
            type="text"
            label="Web vault URL"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://vault.example.com"
          />
          <p className="extension-auth__hint">
            Use the same address you open to access the Authwell web app.
          </p>
        </div>

        <Button type="submit" variant="primary" size="sm" loading={saving}>
          {saving ? 'Checking connection…' : 'Connect vault'}
        </Button>
      </form>
    </div>
  );
}
