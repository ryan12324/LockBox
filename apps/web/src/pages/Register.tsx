import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deriveKey, generateUserKey, encryptUserKey, makeAuthHash, toBase64 } from '@lockbox/crypto';
import { evaluateStrength } from '@lockbox/generator';
import { Button, Icon, Input } from '@lockbox/design';
import type { KdfConfig } from '@lockbox/types';
import AuthShell from '../components/AuthShell.js';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';
import { useToast } from '../providers/ToastProvider.js';

const DEFAULT_KDF: KdfConfig = { type: 'argon2id', iterations: 3, memory: 65536, parallelism: 4 };
const strengthLabels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
const strengthColors = [
  'var(--color-error)',
  'var(--color-warning)',
  'var(--color-warning)',
  'var(--color-primary)',
  'var(--color-success)',
];

export default function Register() {
  const navigate = useNavigate();
  const { setSession, setKeys } = useAuthStore();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const strength = password ? evaluateStrength(password) : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      toast('The master passwords do not match.', 'error');
      return;
    }
    if (password.length < 12) {
      toast('Use at least 12 characters for your master password.', 'error');
      return;
    }

    setLoading(true);
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const saltB64 = toBase64(salt);
      const masterKey = await deriveKey(password, salt, DEFAULT_KDF);
      const userKey = generateUserKey();
      const encryptedUserKey = await encryptUserKey(userKey, masterKey);
      const authHash = await makeAuthHash(masterKey, password);
      const response = (await api.auth.register({
        email,
        authHash,
        encryptedUserKey,
        kdfConfig: DEFAULT_KDF,
        salt: saltB64,
      })) as { token: string; user: { id: string; email: string } };

      setSession({
        token: response.token,
        userId: response.user.id,
        email: response.user.email,
        encryptedUserKey,
        kdfConfig: DEFAULT_KDF,
        salt: saltB64,
      });
      setKeys(masterKey, userKey);
      navigate('/vault');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Your vault could not be created.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Create your vault"
      title="Make one password count"
      description="Your master password protects the encryption key for everything you store in Lockbox."
      icon="shield-check"
      footer={<>Already have a vault? <Link to="/login">Sign in</Link></>}
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <Input name="email" type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} label="Email" placeholder="you@example.com" />
        <div>
          <Input name="password" type="password" required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} label="Master password" placeholder="At least 12 characters" minLength={12} />
          {strength && (
            <div className="password-strength" style={{ '--strength-color': strengthColors[strength.score] } as CSSProperties}>
              <div className="password-strength__track" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((index) => <span key={index} className="password-strength__segment" data-filled={index <= strength.score ? 'true' : undefined} />)}
              </div>
              <p><strong>{strengthLabels[strength.score]}.</strong>{strength.feedback[0] ? ` ${strength.feedback[0]}` : ''}</p>
            </div>
          )}
        </div>
        <Input name="confirmPassword" type="password" required autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} label="Confirm master password" placeholder="Enter it again" minLength={12} />
        <div className="auth-notice">
          <Icon name="alert-triangle" size={20} />
          <span><strong>No recovery in v1.</strong> Losing this master password means losing access to the vault. A real recovery key and emergency kit is committed for v2.</span>
        </div>
        <Button type="submit" size="lg" loading={loading}>Create vault</Button>
      </form>
    </AuthShell>
  );
}
