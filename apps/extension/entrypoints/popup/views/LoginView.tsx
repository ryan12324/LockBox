import React, { useEffect, useState } from 'react';
import { Button, Icon, Input } from '@lockbox/design';
import { clearServerConnection } from '../../../lib/storage.js';
import { sendMessage } from './shared.js';

type UnlockResult = {
  success: boolean;
  requires2FA?: boolean;
  error?: string;
};

export function LockedView({
  onUnlock,
  onServerReset,
}: {
  onUnlock: () => void;
  onServerReset: () => void;
}) {
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

  async function changeServer() {
    await sendMessage({ type: 'lock' }).catch(() => {});
    await clearServerConnection();
    onServerReset();
  }

  return (
    <div className="extension-auth">
      <div className="extension-auth__heading">
        <img className="extension-auth__logo" src="/brand/lockbox-logo-horizontal.png" alt="Lockbox" />
        <p>{awaitingTwoFactor ? 'Two-factor verification' : 'Vault locked'}</p>
        <h1>{awaitingTwoFactor ? 'Verify this sign-in' : 'Unlock Lockbox'}</h1>
        <small>{awaitingTwoFactor ? 'Confirm your second factor to finish unlocking.' : 'Your vault decrypts in the extension after sign-in.'}</small>
      </div>

      {error && (
        <div role="alert" className="extension-auth__error">
          <Icon name="alert-circle" size={18} /> <span>{error}</span>
        </div>
      )}

      {awaitingTwoFactor ? (
        <form onSubmit={handleVerification} className="extension-auth__form">
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
            loading={loading}
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
          >
            {useBackupCode ? 'Use authenticator code' : 'Use a backup code'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={cancelVerification}
          >
            Back to sign in
          </Button>
        </form>
      ) : (
        <form onSubmit={handleCredentials} className="extension-auth__form">
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
            loading={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void changeServer()}
          >
            Use a different web vault
          </Button>
        </form>
      )}
    </div>
  );
}
