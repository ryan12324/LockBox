import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { deriveKey, decryptUserKey, fromBase64 } from '@lockbox/crypto';
import { Button, Input } from '@lockbox/design';
import AuthShell from '../components/AuthShell.js';
import { useAuthStore } from '../store/auth.js';
import { useToast } from '../providers/ToastProvider.js';

export default function Unlock() {
  const navigate = useNavigate();
  const { session, setKeys, logout } = useAuthStore();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!session) return <Navigate to="/login" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setLoading(true);
    try {
      const masterKey = await deriveKey(password, fromBase64(session.salt), session.kdfConfig);
      const userKey = await decryptUserKey(session.encryptedUserKey, masterKey);
      setKeys(masterKey, userKey);
      navigate('/vault');
    } catch {
      toast('That master password did not unlock this vault.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Vault locked"
      title="Unlock on this device"
      description={`Signed in as ${session.email}. Enter your master password to restore access.`}
      footer={<Button type="button" variant="ghost" size="sm" onClick={logout}>Sign out and use another account</Button>}
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <Input name="masterPassword" type="password" required autoFocus autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} label="Master password" placeholder="Enter your master password" />
        <Button type="submit" size="lg" loading={loading}>Unlock vault</Button>
      </form>
    </AuthShell>
  );
}
