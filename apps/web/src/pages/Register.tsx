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
      const res = (await api.auth.register({
        email,
        authHash,
        encryptedUserKey,
        kdfConfig: DEFAULT_KDF,
        salt: saltB64,
      })) as { token: string; user: { id: string; email: string } };

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

  const strengthColors = [
    'bg-[var(--color-error)]',
    'bg-[var(--color-warning)]',
    'bg-[var(--color-warning)]',
    'bg-[var(--color-primary)]',
    'bg-[var(--color-success)]',
  ];
  const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[var(--color-text)]">🔐 Lockbox</h1>
          <p className="mt-2 text-[var(--color-text-tertiary)]">Create your secure vault</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[var(--color-surface-raised)] border border-[var(--color-border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] p-8 space-y-5"
        >
          {error && (
            <div className="bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-md)] p-3 text-[var(--color-error)] text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              Email
            </label>
            <input
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-aura)] focus:border-[var(--color-border-strong)]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              Master Password
            </label>
            <input
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-aura)] focus:border-[var(--color-border-strong)]"
              placeholder="Strong master password"
            />
            {strength && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full ${i <= strength.score ? strengthColors[strength.score] : 'bg-[var(--color-surface-raised)]'}`}
                    />
                  ))}
                </div>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                  {strengthLabels[strength.score]}
                  {strength.feedback.length > 0 && ` — ${strength.feedback[0]}`}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              Confirm Password
            </label>
            <input
              name="confirmPassword"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-aura)] focus:border-[var(--color-border-strong)]"
              placeholder="Confirm master password"
            />
          </div>

          <div className="bg-[var(--color-warning-subtle)] border border-[var(--color-warning)] rounded-[var(--radius-md)] p-3 text-[var(--color-warning)] text-xs">
            ⚠️ Your master password cannot be recovered. An emergency kit PDF will be downloaded —
            store it safely.
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-40 text-[var(--color-primary-fg)] font-medium rounded-[var(--radius-md)] transition-colors"
          >
            {loading ? 'Creating vault...' : 'Create Vault'}
          </button>

          <p className="text-center text-sm text-[var(--color-text-tertiary)]">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] hover:underline"
            >
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
