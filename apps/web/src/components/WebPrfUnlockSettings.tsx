import { useEffect, useState } from 'react';
import { Button, Card, Icon } from '@lockbox/design';
import { deviceUnlockScope } from '../lib/device-unlock-scope.js';
import { isNativeLockboxApp } from '../lib/server-connection.js';
import {
  clearWebPrfUnlock,
  enrollWebPrfUnlock,
  getWebPrfUnlockStatus,
  type WebPrfUnlockStatus,
} from '../lib/web-prf-unlock.js';

interface WebPrfUnlockSettingsProps {
  accountId: string;
  accountLabel: string;
  passwordVerified: boolean;
  userKey: Uint8Array;
}

const EMPTY_STATUS: WebPrfUnlockStatus = {
  supported: false,
  enrolled: false,
  replacementRequired: false,
};

export default function WebPrfUnlockSettings({
  accountId,
  accountLabel,
  passwordVerified,
  userKey,
}: WebPrfUnlockSettingsProps) {
  const scope = deviceUnlockScope(accountId);
  const [status, setStatus] = useState<WebPrfUnlockStatus>(EMPTY_STATUS);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setStatus(getWebPrfUnlockStatus(scope));
  }, [scope]);

  if (isNativeLockboxApp()) return null;

  async function toggleEnrollment() {
    setWorking(true);
    setError('');
    try {
      if (status.enrolled) {
        clearWebPrfUnlock();
      } else {
        if (!passwordVerified) {
          throw new Error('Unlock once with your master password before enabling passkey unlock.');
        }
        await enrollWebPrfUnlock(userKey, scope, accountLabel);
      }
      setStatus(getWebPrfUnlockStatus(scope));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Passkey unlock could not be updated');
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card variant="surface" padding="lg">
      <h2 style={{ margin: '0 0 8px', fontSize: 'var(--font-size-lg)' }}>
        Passkey vault unlock
      </h2>
      <p style={{ margin: '0 0 16px', color: 'var(--color-text-secondary)' }}>
        WebAuthn PRF derives a wrapping key from your passkey and uses it to unwrap this browser's
        encrypted vault key. It does not merely authenticate your account, and it never stores your
        master password.
      </p>
      {!status.supported && (
        <p role="status" style={{ color: 'var(--color-text-tertiary)' }}>
          <Icon name="alert-circle" size={16} /> This browser cannot use secure WebAuthn passkey
          unlock. Your master password remains required.
        </p>
      )}
      {status.replacementRequired && (
        <p role="status" style={{ color: 'var(--color-warning)' }}>
          <Icon name="alert-circle" size={16} /> Enabling this account will replace the local vault
          wrapper for another Authwell account in this browser.
        </p>
      )}
      {error && <p role="alert" style={{ color: 'var(--color-error)' }}>{error}</p>}
      {!status.enrolled && status.supported && !passwordVerified && (
        <p role="status" style={{ color: 'var(--color-text-tertiary)' }}>
          Lock this vault and unlock it once with your master password before enabling passkey
          unlock.
        </p>
      )}
      {status.supported && (
        <Button
          type="button"
          variant={status.enrolled ? 'secondary' : 'primary'}
          size="sm"
          loading={working}
          disabled={!status.enrolled && !passwordVerified}
          onClick={() => void toggleEnrollment()}
        >
          {status.enrolled ? 'Disable passkey unlock on this device' : 'Enable passkey unlock'}
        </Button>
      )}
      {status.enrolled && (
        <p style={{ margin: '12px 0 0', color: 'var(--color-text-tertiary)' }}>
          Disabling removes the wrapped vault key from this browser. Remove the passkey itself in
          your operating system's credential settings if you no longer want it listed there.
        </p>
      )}
    </Card>
  );
}
