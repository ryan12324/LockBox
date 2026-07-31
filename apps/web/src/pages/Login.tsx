import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { decryptUserKey, deriveKey, fromBase64, makeAuthHash } from '@lockbox/crypto';
import { Aura, Button, Card, Input } from '@lockbox/design';
import type { KdfConfig } from '@lockbox/types';
import { api, ApiError } from '../lib/api.js';
import { useToast } from '../providers/ToastProvider.js';
import { useAuthStore } from '../store/auth.js';

type AuthenticatedLogin = {
  token: string;
  user: {
    id: string;
    email: string;
    kdfConfig: KdfConfig;
    salt: string;
    encryptedUserKey: string;
  };
};

type LoginResponse =
  | AuthenticatedLogin
  | { requires2FA: true; tempToken: string };

export default function Login() {
  const navigate = useNavigate();
  const { setSession, setKeys } = useAuthStore();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [masterKeyCache, setMasterKeyCache] = useState<Uint8Array | null>(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [isBackupCode, setIsBackupCode] = useState(false);

  async function finishLogin(response: AuthenticatedLogin, masterKey: Uint8Array) {
    const userKey = await decryptUserKey(response.user.encryptedUserKey, masterKey);
    setSession({
      token: response.token,
      userId: response.user.id,
      email: response.user.email,
      encryptedUserKey: response.user.encryptedUserKey,
      kdfConfig: response.user.kdfConfig,
      salt: response.user.salt,
    });
    setKeys(masterKey, userKey);
    navigate('/vault');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const kdfRes = (await api.auth.kdfParams(email)) as {
        kdfConfig: KdfConfig;
        salt: string;
      };
      const masterKey = await deriveKey(password, fromBase64(kdfRes.salt), kdfRes.kdfConfig);
      const authHash = await makeAuthHash(masterKey, password);
      const loginRes = (await api.auth.login({ email, authHash })) as LoginResponse;

      if ('requires2FA' in loginRes) {
        setTempToken(loginRes.tempToken);
        setMasterKeyCache(masterKey);
        setPassword('');
        return;
      }
      await finishLogin(loginRes, masterKey);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        toast('The email or master password is incorrect.', 'error');
      } else {
        toast(error instanceof Error ? error.message : 'Sign-in failed. Please try again.', 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handle2FASubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!masterKeyCache) {
      cancelTwoFactor();
      toast('This sign-in expired. Enter your master password again.', 'error');
      return;
    }
    setLoading(true);
    try {
      const response = await api.twoFactor.validate(tempToken, twoFaCode.trim());
      await finishLogin(response, masterKeyCache);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Verification failed. Try again.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function cancelTwoFactor() {
    setTempToken('');
    setMasterKeyCache(null);
    setTwoFaCode('');
    setIsBackupCode(false);
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ position: 'relative', overflow: 'hidden', background: 'var(--color-bg)' }}
    >
      <Aura state="idle" position="center" style={{ width: 400, height: 400, opacity: 0.85 }} />

      <main
        className="w-full flex flex-col items-center"
        style={{ position: 'relative', zIndex: 1, maxWidth: 420 }}
      >
        <div className="text-center" style={{ marginBottom: 32 }}>
          <div
            className="text-4xl font-bold text-[var(--color-text)]"
            style={{ letterSpacing: '-0.02em' }}
          >
            <span aria-hidden="true">🔐</span> Lockbox
          </div>
          <p
            className="text-[var(--color-text-tertiary)]"
            style={{ marginTop: 8, fontSize: 'var(--font-size-md)' }}
          >
            {tempToken ? 'Verify this sign-in' : 'Sign in to your vault'}
          </p>
        </div>

        <Card variant="frost" padding="lg" style={{ width: '100%', boxShadow: 'var(--shadow-xl)' }}>
          {tempToken ? (
            <form
              onSubmit={handle2FASubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
            >
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                {isBackupCode
                  ? 'Enter one of the 16-character backup codes you saved when enabling two-factor authentication.'
                  : 'Enter the 6-digit code from your authenticator app.'}
              </p>
              <Input
                name="twoFaCode"
                type="text"
                required
                autoFocus
                autoComplete="one-time-code"
                inputMode={isBackupCode ? 'text' : 'numeric'}
                pattern={isBackupCode ? '[A-Fa-f0-9]{16}' : '[0-9]{6}'}
                maxLength={isBackupCode ? 16 : 6}
                value={twoFaCode}
                onChange={(e) => setTwoFaCode(e.target.value)}
                label={isBackupCode ? 'Backup code' : 'Authenticator code'}
                placeholder={isBackupCode ? '16-character code' : '6-digit code'}
              />
              <Button type="submit" variant="primary" size="lg" loading={loading} style={{ width: '100%' }}>
                Verify and sign in
              </Button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsBackupCode((current) => !current);
                    setTwoFaCode('');
                  }}
                  style={{ width: '100%' }}
                >
                  {isBackupCode ? 'Use authenticator code' : 'Use a backup code'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelTwoFactor}
                  style={{ width: '100%', color: 'var(--color-text-tertiary)' }}
                >
                  Back to sign in
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <Input
                name="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                label="Email"
                placeholder="you@example.com"
              />
              <Input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                label="Master password"
                placeholder="Master password"
              />
              <Button type="submit" variant="primary" size="lg" loading={loading} style={{ width: '100%' }}>
                Sign in
              </Button>
            </form>
          )}
        </Card>

        <p className="text-center text-sm text-[var(--color-text-tertiary)]" style={{ marginTop: 24 }}>
          Don&apos;t have an account?{' '}
          <Link
            to="/register"
            className="text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] hover:underline"
          >
            Create vault
          </Link>
        </p>
      </main>
    </div>
  );
}
