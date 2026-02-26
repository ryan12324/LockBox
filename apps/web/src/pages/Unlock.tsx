import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deriveKey, decryptUserKey, fromBase64 } from '@lockbox/crypto';
import { useAuthStore } from '../store/auth.js';

export default function Unlock() {
  const navigate = useNavigate();
  const { session, setKeys, logout } = useAuthStore();

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!session) {
    navigate('/login');
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const salt = fromBase64(session!.salt);
      const masterKey = await deriveKey(password, salt, session!.kdfConfig);
      const userKey = await decryptUserKey(session!.encryptedUserKey, masterKey);

      setKeys(masterKey, userKey);
      navigate('/vault');
    } catch {
      setError('Incorrect master password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-white">Vault Locked</h1>
          <p className="mt-2 text-white/50">
            Signed in as <strong>{session.email}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-8 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-400/20 rounded-lg p-3 text-red-300 backdrop-blur-sm text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">
              Master Password
            </label>
            <input
              name="masterPassword"
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-white/[0.2]"
              placeholder="Enter master password to unlock"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-indigo-600/80 hover:bg-indigo-500/90 disabled:opacity-40 text-white backdrop-blur-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Unlocking...' : 'Unlock Vault'}
          </button>

          <button
            type="button"
            onClick={logout}
            className="w-full py-2 text-sm text-white/40 hover:text-white/60"
          >
            Sign out and use a different account
          </button>
        </form>
      </div>
    </div>
  );
}
