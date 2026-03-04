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
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--color-bg)',
      }}
    >
      <Aura state="idle" position="center" style={{ width: 320, height: 320, opacity: 0.8 }} />

      <div
        className="w-full flex flex-col items-center"
        style={{ position: 'relative', zIndex: 1, maxWidth: 380 }}
      >
        <div className="text-center" style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <div
            className="text-2xl font-bold text-[var(--color-text)]"
            style={{ letterSpacing: '-0.02em' }}
          >
            Vault Locked
          </div>
          <p
            className="text-[var(--color-text-tertiary)]"
            style={{ marginTop: 8, fontSize: 'var(--font-size-sm)' }}
          >
            Signed in as <strong>{session.email}</strong>
          </p>
        </div>

        <Card variant="frost" padding="lg" style={{ width: '100%', boxShadow: 'var(--shadow-xl)' }}>
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
          >
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

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              style={{ width: '100%' }}
            >
              Unlock Vault
            </Button>
          </form>
        </Card>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={logout}
          style={{ marginTop: 20, color: 'var(--color-text-tertiary)' }}
        >
          Sign out and use a different account
        </Button>
      </div>
    </div>
  );
}
