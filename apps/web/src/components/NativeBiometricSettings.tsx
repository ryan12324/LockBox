import { useEffect, useState } from 'react';
import { Button, Card, Icon } from '@lockbox/design';
import {
  clearNativeBiometric,
  enrollNativeBiometric,
  getNativeBiometricStatus,
  nativeBiometricScope,
  type NativeBiometricStatus,
} from '../lib/native-biometric.js';

interface NativeBiometricSettingsProps {
  accountId: string;
  passwordVerified: boolean;
  userKey: Uint8Array;
}

const EMPTY_STATUS: NativeBiometricStatus = {
  supported: false,
  enrolled: false,
  replacementRequired: false,
  biometryType: 'none',
};

export default function NativeBiometricSettings({
  accountId,
  passwordVerified,
  userKey,
}: NativeBiometricSettingsProps) {
  const scope = nativeBiometricScope(accountId);
  const [status, setStatus] = useState<NativeBiometricStatus>(EMPTY_STATUS);
  const [checking, setChecking] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getNativeBiometricStatus(scope)
      .then((next) => {
        if (active) setStatus(next);
      })
      .catch(() => {
        if (active) setError('Authwell could not check biometric unlock on this device.');
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [scope]);

  if (checking || !status.supported) return null;

  const methodName = status.biometryType === 'face'
    ? 'Face ID'
    : status.biometryType === 'fingerprint'
      ? 'Touch ID or fingerprint'
      : 'biometrics';

  async function toggleEnrollment() {
    setWorking(true);
    setError('');
    try {
      if (status.enrolled) {
        await clearNativeBiometric();
      } else {
        if (!passwordVerified) {
          throw new Error('Unlock once with your master password before enabling biometric unlock.');
        }
        await enrollNativeBiometric(userKey, scope);
      }
      setStatus(await getNativeBiometricStatus(scope));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Biometric settings could not be updated');
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card variant="surface" padding="lg">
      <h2 style={{ margin: '0 0 8px', fontSize: 'var(--font-size-lg)' }}>
        Biometric unlock
      </h2>
      <p style={{ margin: '0 0 16px', color: 'var(--color-text-secondary)' }}>
        Protect this vault key with {methodName} so you can reopen a locked session without entering
        your master password. The key remains bound to this device.
      </p>
      {status.replacementRequired && (
        <p role="status" style={{ color: 'var(--color-warning)' }}>
          <Icon name="alert-circle" size={16} /> A biometric key from another Authwell account will
          be replaced.
        </p>
      )}
      {error && <p role="alert" style={{ color: 'var(--color-error)' }}>{error}</p>}
      {!status.enrolled && !passwordVerified && (
        <p role="status" style={{ color: 'var(--color-text-tertiary)' }}>
          Lock this vault and unlock it once with your master password before enabling biometrics.
        </p>
      )}
      <Button
        type="button"
        variant={status.enrolled ? 'secondary' : 'primary'}
        size="sm"
        loading={working}
        disabled={!status.enrolled && !passwordVerified}
        onClick={() => void toggleEnrollment()}
      >
        {status.enrolled ? 'Disable biometric unlock' : `Enable ${methodName}`}
      </Button>
    </Card>
  );
}
