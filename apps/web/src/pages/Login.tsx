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
        token: string;
        user: {
          id: string;
          email: string;
          kdfConfig: KdfConfig;
          salt: string;
          encryptedUserKey: string;
        };
      };

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
      </div>
    </div>
  );
}
