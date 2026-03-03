import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deriveKey, decryptUserKey, fromBase64 } from '@lockbox/crypto';
import { Button, Input, Card, Aura } from '@lockbox/design';
import { useAuthStore } from '../store/auth.js';
import { useToast } from '../providers/ToastProvider.js';

export default function Unlock() {
  const navigate = useNavigate();
  const { session, setKeys, logout } = useAuthStore();
  const { toast } = useToast();

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!session) {
    navigate('/login');
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const salt = fromBase64(session!.salt);
      const masterKey = await deriveKey(password, salt, session!.kdfConfig);
      const userKey = await decryptUserKey(session!.encryptedUserKey, masterKey);

      setKeys(masterKey, userKey);
      navigate('/vault');
    } catch {
      toast('Incorrect master password', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      <Aura state="idle" position="center" />
      <div className="w-full max-w-md" style={{ position: 'relative', zIndex: 1 }}>
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Vault Locked</h1>
          <p className="mt-2 text-[var(--color-text-tertiary)]">
            Signed in as <strong>{session.email}</strong>
          </p>
        </div>

        <Card variant="raised" padding="lg">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              name="masterPassword"
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              label="Master Password"
              placeholder="Enter master password to unlock"
            />

            <Button type="submit" variant="primary" loading={loading} style={{ width: '100%' }}>
              Unlock Vault
            </Button>

            <Button type="button" variant="ghost" onClick={logout} style={{ width: '100%' }}>
              Sign out and use a different account
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
