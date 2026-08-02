import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { deriveKey, decryptUserKey, fromBase64 } from '@lockbox/crypto';
import { Button, Input } from '@lockbox/design';
import AuthShell from '../components/AuthShell.js';
import { useAuthStore } from '../store/auth.js';
import { useToast } from '../providers/ToastProvider.js';
import { api } from '../lib/api.js';
import {
  authenticateNativeBiometric,
  getNativeBiometricStatus,
  nativeBiometricScope,
  type NativeBiometricStatus,
} from '../lib/native-biometric.js';
import { clearNativeDeviceState } from '../lib/native-device-state.js';

const EMPTY_BIOMETRIC_STATUS: NativeBiometricStatus = {
  supported: false,
  enrolled: false,
  replacementRequired: false,
  biometryType: 'none',
};

export default function Unlock() {
  const navigate = useNavigate();
  const { session, setKeys, unlockWithUserKey, logout } = useAuthStore();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState(EMPTY_BIOMETRIC_STATUS);

  useEffect(() => {
    if (!session) return;
    const scope = nativeBiometricScope(session.userId);
    getNativeBiometricStatus(scope)
      .then(setBiometricStatus)
      .catch(() => setBiometricStatus(EMPTY_BIOMETRIC_STATUS));
  }, [session]);

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

  async function handleBiometricUnlock() {
    if (!session) return;
    setLoading(true);
    try {
      const userKey = await authenticateNativeBiometric(
        nativeBiometricScope(session.userId),
        'Unlock your Authwell vault'
      );
      if (!userKey) {
        toast('Biometric authentication did not unlock this vault.', 'error');
        return;
      }
      unlockWithUserKey(userKey);
      navigate('/vault');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Biometric unlock failed.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    if (session) await api.auth.logout(session.token).catch(() => {});
    try {
      await clearNativeDeviceState();
    } catch {
      toast('Signed out, but some protected device data could not be cleared.', 'warning');
    }
    logout();
  }

  const biometricName = biometricStatus.biometryType === 'face'
    ? 'Face ID'
    : biometricStatus.biometryType === 'fingerprint'
      ? 'Touch ID or fingerprint'
      : 'biometrics';

  return (
    <AuthShell
      eyebrow="Vault locked"
      title="Unlock on this device"
      description={`Signed in as ${session.email}. Unlock with ${biometricStatus.enrolled ? biometricName : 'your master password'} to restore access.`}
      footer={<Button type="button" variant="ghost" size="sm" onClick={() => void handleSignOut()}>Sign out and use another account</Button>}
    >
      {biometricStatus.enrolled && (
        <Button type="button" size="lg" loading={loading} onClick={() => void handleBiometricUnlock()}>
          Unlock with {biometricName}
        </Button>
      )}
      <form onSubmit={handleSubmit} className="auth-form">
        <Input name="masterPassword" type="password" required autoFocus autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} label="Master password" placeholder="Enter your master password" />
        <Button type="submit" size="lg" loading={loading}>Unlock vault</Button>
      </form>
    </AuthShell>
  );
}
