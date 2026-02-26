import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  deriveKey,
  generateUserKey,
  encryptUserKey,
  makeAuthHash,
  generateRecoveryKey,
  toBase64,
} from '@lockbox/crypto';
import { evaluateStrength } from '@lockbox/generator';
import { api } from '../lib/api.js';
import { generateEmergencyKitPDF } from '../lib/emergency-kit.js';
import { useAuthStore } from '../store/auth.js';
import type { KdfConfig } from '@lockbox/types';

const DEFAULT_KDF: KdfConfig = {
  type: 'argon2id',
  iterations: 3,
  memory: 65536,
  parallelism: 4,
};

export default function Register() {
  const navigate = useNavigate();
  const { setSession, setKeys } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const strength = password ? evaluateStrength(password) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      // 1. Generate salt
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const saltB64 = toBase64(salt);

      // 2. Derive master key
      const masterKey = await deriveKey(password, salt, DEFAULT_KDF);

      // 3. Generate user key
      const userKey = generateUserKey();

      // 4. Encrypt user key
      const encryptedUserKey = await encryptUserKey(userKey, masterKey);

      // 5. Make auth hash
      const authHash = await makeAuthHash(masterKey, password);

      // 6. Generate recovery key
      const recoveryKey = generateRecoveryKey();

      // 7. Register
      const res = await api.auth.register({
        email,
        authHash,
        encryptedUserKey,
        kdfConfig: DEFAULT_KDF,
        salt: saltB64,
      }) as { token: string; user: { id: string; email: string } };

      // 8. Generate emergency kit PDF
      generateEmergencyKitPDF(email, recoveryKey);

      // 9. Store session + keys
      setSession({
        token: res.token,
        userId: res.user.id,
        email: res.user.email,
        encryptedUserKey,
        kdfConfig: DEFAULT_KDF,
        salt: saltB64,
      });
      setKeys(masterKey, userKey);

      navigate('/vault');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  const strengthColors = ['bg-red-500/80', 'bg-orange-500/80', 'bg-yellow-500/80', 'bg-blue-500/80', 'bg-green-500/80'];
  const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">🔐 Lockbox</h1>
          <p className="mt-2 text-white/50">Create your secure vault</p>
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
              placeholder="Strong master password"
            />
            {strength && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full ${i <= strength.score ? strengthColors[strength.score] : 'bg-white/10'}`}
                    />
                  ))}
                </div>
                <p className="text-xs text-white/40 mt-1">
                  {strengthLabels[strength.score]}
                  {strength.feedback.length > 0 && ` — ${strength.feedback[0]}`}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">
              Confirm Password
            </label>
            <input
              name="confirmPassword"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-white/[0.2]"
              placeholder="Confirm master password"
            />
          </div>

          <div className="bg-amber-500/10 border border-amber-400/20 rounded-lg p-3 text-amber-300 backdrop-blur-sm text-xs">
            ⚠️ Your master password cannot be recovered. An emergency kit PDF will be downloaded — store it safely.
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-indigo-600/80 hover:bg-indigo-500/90 disabled:opacity-40 text-white backdrop-blur-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Creating vault...' : 'Create Vault'}
          </button>

          <p className="text-center text-sm text-white/50">
            Already have an account?{' '}
            <Link to="/login" className="text-indigo-300 hover:text-indigo-200 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
