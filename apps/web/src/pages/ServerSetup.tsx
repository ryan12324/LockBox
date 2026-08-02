import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Input } from '@lockbox/design';
import AuthShell from '../components/AuthShell.js';
import { discoverLockboxServer } from '../lib/discovery.js';
import { getServerConnection, setServerConnection } from '../lib/server-connection.js';

export default function ServerSetup({
  onComplete,
}: {
  onComplete: () => void | Promise<void>;
}) {
  const navigate = useNavigate();
  const currentConnection = getServerConnection();
  const [url, setUrl] = useState(currentConnection?.webBaseUrl ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!url.trim()) {
      setError('Enter your Authwell web vault URL.');
      return;
    }

    setSaving(true);
    try {
      const connection = await discoverLockboxServer(url.trim());
      setServerConnection(connection);
      await onComplete();
      navigate('/login', { replace: true });
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
    <AuthShell
      eyebrow={currentConnection ? 'Server connection' : 'Set up Authwell'}
      title={currentConnection ? 'Change your web vault' : 'Connect your web vault'}
      description="Enter the same address you use to open Authwell on the web. The app will discover and verify its API automatically."
      icon="world"
      footer={currentConnection ? <Link to="/login">Keep current server</Link> : undefined}
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <div>
          <Input
            name="webVaultUrl"
            type="text"
            required
            autoFocus
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            label="Web vault URL"
            placeholder="https://vault.example.com"
            error={error || undefined}
          />
          <p className="auth-form__hint">
            Use the web vault address, not a copied sign-in or item URL.
          </p>
        </div>
        <Button type="submit" size="lg" loading={saving}>
          {saving ? 'Checking connection…' : 'Connect vault'}
        </Button>
      </form>
    </AuthShell>
  );
}
