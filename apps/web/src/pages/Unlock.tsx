import { useEffect, useRef, useState, type FormEvent } from 'react';
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
import { deviceUnlockScope } from '../lib/device-unlock-scope.js';
import {
  getWebPrfUnlockStatus,
  unlockWithWebPrf,
  type WebPrfUnlockStatus,
} from '../lib/web-prf-unlock.js';
import {
  DeviceUnlockSessionError,
  validateDeviceUnlockSession,
} from '../lib/device-unlock-session.js';
import { isNativeLockboxApp } from '../lib/server-connection.js';

const EMPTY_BIOMETRIC_STATUS: NativeBiometricStatus = {
  supported: false,
  enrolled: false,
  replacementRequired: false,
  biometryType: 'none',
};

const EMPTY_WEB_PRF_STATUS: WebPrfUnlockStatus = {
  supported: false,
  enrolled: false,
  replacementRequired: false,
};

export default function Unlock() {
  const navigate = useNavigate();
  const { session, setKeys, unlockWithUserKey, logout } = useAuthStore();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState(EMPTY_BIOMETRIC_STATUS);
  const [webPrfStatus, setWebPrfStatus] = useState(EMPTY_WEB_PRF_STATUS);
  const automaticallyPromptedScope = useRef<string | null>(null);
  const nativeApp = isNativeLockboxApp();

  useEffect(() => {
    if (!session) return;
    let active = true;
    const scope = nativeBiometricScope(session.userId);
    setWebPrfStatus(getWebPrfUnlockStatus(scope));
    getNativeBiometricStatus(scope)
      .then((status) => {
        if (!active) return;
        setBiometricStatus(status);
        if (nativeApp && status.enrolled && automaticallyPromptedScope.current !== scope) {
          automaticallyPromptedScope.current = scope;
          void handleDeviceUnlock(status);
        }
      })
      .catch(() => {
        if (active) setBiometricStatus(EMPTY_BIOMETRIC_STATUS);
      });
    return () => {
      active = false;
    };
  }, [session, nativeApp]);

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

  async function handleDeviceUnlock(status = biometricStatus) {
    if (!session) return;
    setLoading(true);
    try {
      // A local key wrapper must never outlive server-side session revocation.
      // Validate first so a revoked token always returns the user to full login.
      await validateDeviceUnlockSession(session.token, session.userId);

      const scope = deviceUnlockScope(session.userId);
      const userKey = status.enrolled
        ? await authenticateNativeBiometric(scope, 'Unlock your Authwell vault')
        : await unlockWithWebPrf(scope);
      if (!userKey) {
        toast('Device authentication did not unlock this vault. Enter your master password.', 'error');
        return;
      }
      unlockWithUserKey(userKey);
      navigate('/vault');
    } catch (reason) {
      if (reason instanceof DeviceUnlockSessionError && reason.revoked) {
        logout();
        navigate('/login');
        toast(reason.message, 'error');
      } else {
        toast(
          reason instanceof Error
            ? reason.message
            : 'Device unlock failed. Enter your master password.',
          'error'
        );
      }
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
  const deviceUnlockEnrolled = biometricStatus.enrolled || webPrfStatus.enrolled;
  const deviceUnlockName = biometricStatus.enrolled ? biometricName : 'your passkey';

  return (
    <AuthShell
      eyebrow="Vault locked"
      title="Unlock on this device"
      description={`Signed in as ${session.email}. Unlock with ${deviceUnlockEnrolled ? deviceUnlockName : 'your master password'} to restore access.`}
      footer={<Button type="button" variant="ghost" size="sm" onClick={() => void handleSignOut()}>Sign out and use another account</Button>}
    >
      {deviceUnlockEnrolled && (
        <Button type="button" size="lg" loading={loading} onClick={() => void handleDeviceUnlock()}>
          Unlock with {deviceUnlockName}
        </Button>
      )}
      <form onSubmit={handleSubmit} className="auth-form">
        <Input name="masterPassword" type="password" required autoFocus={!nativeApp} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} label="Master password" placeholder="Enter your master password" />
        <Button type="submit" size="lg" loading={loading}>Unlock vault</Button>
      </form>
    </AuthShell>
  );
}
