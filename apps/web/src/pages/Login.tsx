import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { deriveKey, decryptUserKey, makeAuthHash, fromBase64 } from '@lockbox/crypto';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';
import type { KdfConfig } from '@lockbox/types';

export default function Login() {
  const navigate = useNavigate();
  const { setSession, setKeys } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 2FA state
  const [tempToken, setTempToken] = useState('');
  const [masterKeyCache, setMasterKeyCache] = useState<Uint8Array | null>(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [isBackupCode, setIsBackupCode] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Step 1: Fetch KDF params for this email (no auth required)
      // This lets us derive the master key before sending the auth hash
      const kdfRes = await api.auth.kdfParams(email) as {
        kdfConfig: KdfConfig;
        salt: string;
      };

      const { kdfConfig, salt: saltB64 } = kdfRes;
      const salt = fromBase64(saltB64);

      // Step 2: Derive master key from password + salt + kdfConfig
      const masterKey = await deriveKey(password, salt, kdfConfig);

      // Step 3: Derive auth hash (one extra PBKDF2 round of masterKey + password)
      const authHash = await makeAuthHash(masterKey, password);

      // Step 4: Login with derived auth hash
      const loginRes = await api.auth.login({ email, authHash }) as {
        token?: string;
        user?: {
          id: string;
          email: string;
          kdfConfig: KdfConfig;
          salt: string;
          encryptedUserKey: string;
        };
        requires2FA?: boolean;
        tempToken?: string;
      };

      if (loginRes.requires2FA && loginRes.tempToken) {
        setTempToken(loginRes.tempToken);
        setMasterKeyCache(masterKey);
        setLoading(false);
        return;
      }

      if (!loginRes.token || !loginRes.user) {
        throw new Error('Invalid response');
      }

      // Step 5: Decrypt user key with master key
      const userKey = await decryptUserKey(loginRes.user.encryptedUserKey, masterKey);

      setSession({
        token: loginRes.token,
        userId: loginRes.user.id,
        email: loginRes.user.email,
        encryptedUserKey: loginRes.user.encryptedUserKey,
        kdfConfig: loginRes.user.kdfConfig,
        salt: loginRes.user.salt,
      });
      setKeys(masterKey, userKey);
      navigate('/vault');
    } catch (err) {
      if (err instanceof Error && err.message.includes('401')) {
        setError('Invalid email or password');
      } else if (err instanceof Error) {
        setError(err.message || 'Login failed. Please try again.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      if (!tempToken) setLoading(false);
    }
  }

  async function handle2FASubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/auth/2fa/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, code: twoFaCode }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid 2FA code');

      const { token, user } = data;

      if (!masterKeyCache) throw new Error('Master key lost. Please reload and try again.');

      const userKey = await decryptUserKey(user.encryptedUserKey, masterKeyCache);

      setSession({
        token,
        userId: user.id,
        email: user.email,
        encryptedUserKey: user.encryptedUserKey,
        kdfConfig: user.kdfConfig,
        salt: user.salt,
      });
      setKeys(masterKeyCache, userKey);
      navigate('/vault');
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Verification failed');
      }
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">🔐 Lockbox</h1>
          <p className="mt-2 text-white/50">Sign in to your vault</p>
        </div>

        {tempToken ? (
          <form onSubmit={handle2FASubmit} className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-8 space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-400/20 rounded-lg p-3 text-red-300 backdrop-blur-sm text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">
                {isBackupCode ? 'Backup Code' : 'Authenticator Code'}
              </label>
              <input
                name="twoFaCode"
                type="text"
                required
                value={twoFaCode}
                onChange={(e) => setTwoFaCode(e.target.value)}
                className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-white/[0.2]"
                placeholder={isBackupCode ? "8-character code" : "6-digit code"}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-indigo-600/80 hover:bg-indigo-500/90 disabled:opacity-40 text-white backdrop-blur-sm font-medium rounded-lg transition-colors"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsBackupCode(!isBackupCode);
                setTwoFaCode('');
                setError('');
              }}
              className="w-full py-2 text-sm text-indigo-300 hover:text-indigo-200 hover:underline text-center"
            >
              {isBackupCode ? 'Use authenticator app' : 'Use backup code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTempToken('');
                setMasterKeyCache(null);
                setTwoFaCode('');
                setError('');
              }}
              className="w-full py-2 text-sm text-white/50 hover:text-white/70 hover:underline text-center"
            >
              Cancel
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-8 space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-400/20 rounded-lg p-3 text-red-300 backdrop-blur-sm text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">
                Email
              </label>
              <input
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-white/[0.2]"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">
                Master Password
              </label>
              <input
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-white/[0.2]"
                placeholder="Master password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-indigo-600/80 hover:bg-indigo-500/90 disabled:opacity-40 text-white backdrop-blur-sm font-medium rounded-lg transition-colors"
            >
              {loading ? 'Unlocking vault...' : 'Sign In'}
            </button>

            <p className="text-center text-sm text-white/50">
              Don't have an account?{' '}
              <Link to="/register" className="text-indigo-300 hover:text-indigo-200 hover:underline">
                Create vault
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
