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
import { Button, Input, Card, Aura } from '@lockbox/design';
import { api } from '../lib/api.js';
import { generateEmergencyKitPDF } from '../lib/emergency-kit.js';
import { useAuthStore } from '../store/auth.js';
import { useToast } from '../providers/ToastProvider.js';
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
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const strength = password ? evaluateStrength(password) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast('Passwords do not match', 'error');
      return;
    }
    if (password.length < 8) {
      toast('Password must be at least 8 characters', 'error');
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
      toast(err instanceof Error ? err.message : 'Registration failed', 'error');
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
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      <Aura state="idle" position="center" />
      <div className="w-full max-w-md" style={{ position: 'relative', zIndex: 1 }}>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[var(--color-text)]">🔐 Lockbox</h1>
          <p className="mt-2 text-[var(--color-text-tertiary)]">Create your secure vault</p>
        </div>

        <Card variant="raised" padding="lg">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              label="Email"
              placeholder="you@example.com"
            />

            <div>
              <Input
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                label="Master Password"
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

            <Input
              name="confirmPassword"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              label="Confirm Password"
              placeholder="Confirm master password"
            />

            <div className="bg-[var(--color-warning-subtle)] border border-[var(--color-warning)] rounded-[var(--radius-md)] p-3 text-[var(--color-warning)] text-xs">
              ⚠️ Your master password cannot be recovered. An emergency kit PDF will be downloaded —
              store it safely.
            </div>

            <Button type="submit" variant="primary" loading={loading} style={{ width: '100%' }}>
              Create Vault
            </Button>

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
        </Card>
      </div>
    </div>
  );
}
