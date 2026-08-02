import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { decryptUserKey, deriveKey, fromBase64, makeAuthHash } from '@lockbox/crypto';
import { Button, Input } from '@lockbox/design';
import type { KdfConfig } from '@lockbox/types';
import AuthShell from '../components/AuthShell.js';
import { api, ApiError } from '../lib/api.js';
import { isNativeLockboxApp } from '../lib/server-connection.js';
import { useToast } from '../providers/ToastProvider.js';
import { useAuthStore } from '../store/auth.js';

type AuthenticatedLogin = {
  token: string;
  user: { id: string; email: string; kdfConfig: KdfConfig; salt: string; encryptedUserKey: string };
};
type LoginResponse = AuthenticatedLogin | { requires2FA: true; tempToken: string };

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
  const nativeApp = isNativeLockboxApp();

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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const kdf = await api.auth.kdfParams(email);
      const masterKey = await deriveKey(password, fromBase64(kdf.salt), kdf.kdfConfig);
      const authHash = await makeAuthHash(masterKey, password);
      const response = (await api.auth.login({ email, authHash })) as LoginResponse;
      if ('requires2FA' in response) {
        setTempToken(response.tempToken);
        setMasterKeyCache(masterKey);
        setPassword('');
        return;
      }
      await finishLogin(response, masterKey);
    } catch (error) {
      toast(
        error instanceof ApiError && error.status === 401
          ? 'The email or master password is incorrect.'
          : error instanceof Error
            ? error.message
            : 'Sign-in failed. Please try again.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handle2FASubmit(event: FormEvent) {
    event.preventDefault();
    if (!masterKeyCache) {
      cancelTwoFactor();
      toast('This sign-in expired. Enter your master password again.', 'error');
      return;
    }
    setLoading(true);
    try {
      await finishLogin(await api.twoFactor.validate(tempToken, twoFaCode.trim()), masterKeyCache);
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

  const verifying = Boolean(tempToken);
  return (
    <AuthShell
      eyebrow={verifying ? 'Two-factor verification' : 'Private by design'}
      title={verifying ? 'Verify this sign-in' : 'Welcome back'}
      description={
        verifying
          ? 'Confirm the code from your second factor to open this vault.'
          : 'Sign in to decrypt and manage your vault on this device.'
      }
      footer={
        !verifying ? (
          <>
            <span>
              New to Authwell? <Link to="/register">Create a vault</Link>
            </span>
            {nativeApp && (
              <span className="auth-panel__footer-action">
                <Link to="/setup">Use a different Authwell server</Link>
              </span>
            )}
          </>
        ) : undefined
      }
    >
      {verifying ? (
        <form onSubmit={handle2FASubmit} className="auth-form">
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
            onChange={(event) => setTwoFaCode(event.target.value)}
            label={isBackupCode ? 'Backup code' : 'Authenticator code'}
            placeholder={isBackupCode ? '16-character code' : '6-digit code'}
          />
          <Button type="submit" size="lg" loading={loading}>
            Verify and sign in
          </Button>
          <div className="auth-form__actions">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsBackupCode((current) => !current);
                setTwoFaCode('');
              }}
            >
              {isBackupCode ? 'Use authenticator code' : 'Use a backup code'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={cancelTwoFactor}>
              Back to sign in
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="auth-form">
          <Input
            name="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            label="Email"
            placeholder="you@example.com"
          />
          <Input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            label="Master password"
            placeholder="Enter your master password"
          />
          <Button type="submit" size="lg" loading={loading}>
            Sign in
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
