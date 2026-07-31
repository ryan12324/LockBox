import React, { useEffect, useState } from 'react';
import { Button, Input } from '@lockbox/design';
import { sendMessage } from './shared.js';

type UnlockResult = {
  success: boolean;
  requires2FA?: boolean;
  error?: string;
};

export function LockedView({ onUnlock }: { onUnlock: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [awaitingTwoFactor, setAwaitingTwoFactor] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    chrome.storage.local.get('email').then((result) => {
      if (result.email) setEmail(result.email as string);
    });
  }, []);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await sendMessage<UnlockResult>({
        type: 'unlock',
        email,
        password,
      });
      if (result.success) {
        onUnlock();
      } else if (result.requires2FA) {
        setPassword('');
        setAwaitingTwoFactor(true);
      } else {
        setError(result.error ?? 'The email or master password is incorrect.');
      }
    } catch {
      setError('The extension background service did not respond. Close and reopen Lockbox.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerification(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await sendMessage<UnlockResult>({
        type: 'validate-login-2fa',
        code: verificationCode.trim(),
      });
      if (result.success) {
        onUnlock();
      } else {
        setError(result.error ?? 'That verification code was not accepted.');
      }
    } catch {
      setError('The extension background service did not respond. Close and reopen Lockbox.');
    } finally {
      setLoading(false);
    }
  }

  async function cancelVerification() {
    await sendMessage<{ success: boolean }>({ type: 'cancel-login-2fa' }).catch(() => {});
    setAwaitingTwoFactor(false);
    setUseBackupCode(false);
    setVerificationCode('');
    setError('');
  }

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="text-center">
        <div className="text-[32px] mb-2" aria-hidden="true">🔐</div>
        <h1 className="text-lg font-bold text-[var(--color-text)]">Lockbox</h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
          {awaitingTwoFactor ? 'Verify this sign-in' : 'Sign in to your vault'}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="px-3 py-2 bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-sm)] text-[var(--color-error)] text-xs"
        >
          {error}
        </div>
      )}

      {awaitingTwoFactor ? (
        <form onSubmit={handleVerification} className="flex flex-col gap-3">
          <Input
            type="text"
            label={useBackupCode ? 'Backup code' : 'Authenticator code'}
            required
            autoFocus
            autoComplete="one-time-code"
            inputMode={useBackupCode ? 'text' : 'numeric'}
            pattern={useBackupCode ? '[A-Fa-f0-9]{16}' : '[0-9]{6}'}
            maxLength={useBackupCode ? 16 : 6}
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
            placeholder={useBackupCode ? '16-character code' : '6-digit code'}
          />

          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? 'Verifying…' : 'Verify and unlock'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setUseBackupCode((current) => !current);
              setVerificationCode('');
              setError('');
            }}
            style={{ width: '100%' }}
          >
            {useBackupCode ? 'Use authenticator code' : 'Use a backup code'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={cancelVerification}
            style={{ width: '100%' }}
          >
            Back to sign in
          </Button>
        </form>
      ) : (
        <form onSubmit={handleCredentials} className="flex flex-col gap-3">
          <Input
            type="email"
            label="Email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />

          <Input
            type="password"
            label="Master password"
            required
            autoComplete="current-password"
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
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      )}
    </div>
  );
}
