import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Icon } from '@lockbox/design';
import type { VaultItem } from '@lockbox/types';
import {
  getNativeAutofillStatus,
  getNativePasskeyStatus,
  openNativeAutofillSettings,
  openNativePasskeySettings,
  syncNativeAutofillIndex,
  type NativeAutofillStatus,
  type NativePasskeyStatus,
} from '../lib/native-autofill.js';

interface NativeAutofillSetupProps {
  accountId: string;
  items: VaultItem[];
}

const EMPTY_AUTOFILL: NativeAutofillStatus = { supported: false, enabled: false };
const EMPTY_PASSKEYS: NativePasskeyStatus = { supported: false, enabled: false };

export default function NativeAutofillSetup({ accountId, items }: NativeAutofillSetupProps) {
  const [autofill, setAutofill] = useState<NativeAutofillStatus>(EMPTY_AUTOFILL);
  const [passkeys, setPasskeys] = useState<NativePasskeyStatus>(EMPTY_PASSKEYS);
  const [indexReadyThisSession, setIndexReadyThisSession] = useState(false);
  const [checking, setChecking] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(
    () => sessionStorage.getItem(`authwell:autofill-setup-later:${accountId}`) === 'true'
  );

  const refresh = useCallback(async () => {
    try {
      const [autofillStatus, passkeyStatus] = await Promise.all([
        getNativeAutofillStatus(),
        getNativePasskeyStatus(),
      ]);
      setAutofill(autofillStatus);
      setPasskeys(passkeyStatus);
      if (autofillStatus.indexedAt !== undefined) setIndexReadyThisSession(true);
    } catch {
      setError('Authwell could not check the current device AutoFill settings.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const handleFocus = () => void refresh();
    const handleIndexUpdate = () => {
      setIndexReadyThisSession(true);
      void refresh();
    };
    void refresh();
    window.addEventListener('focus', handleFocus);
    window.addEventListener('authwell:native-autofill-updated', handleIndexUpdate);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('authwell:native-autofill-updated', handleIndexUpdate);
    };
  }, [refresh]);

  const loginCount = useMemo(
    () => items.filter((item) => item.type === 'login').length,
    [items]
  );
  const indexReady = indexReadyThisSession || autofill.indexedAt !== undefined;
  const passkeyReady = !passkeys.supported || passkeys.enabled;
  const complete = autofill.enabled && passkeyReady && indexReady;

  if (checking || hidden || (!autofill.supported && !passkeys.supported) || complete) return null;

  async function runNextStep() {
    setWorking(true);
    setError('');
    try {
      if (!autofill.enabled) {
        await openNativeAutofillSettings();
      } else if (!passkeyReady) {
        await openNativePasskeySettings();
      } else {
        await syncNativeAutofillIndex(items, accountId);
        setIndexReadyThisSession(true);
      }
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Device AutoFill setup could not continue');
    } finally {
      setWorking(false);
    }
  }

  function remindLater() {
    sessionStorage.setItem(`authwell:autofill-setup-later:${accountId}`, 'true');
    setHidden(true);
  }

  const actionLabel = !autofill.enabled
    ? 'Choose Authwell for passwords'
    : !passkeyReady
      ? 'Enable Authwell passkeys'
      : 'Refresh encrypted index';

  return (
    <section className="native-autofill-setup" aria-labelledby="native-autofill-setup-title">
      <span className="native-autofill-setup__mark" aria-hidden="true">
        <Icon name="device-mobile" size={21} />
      </span>
      <div className="native-autofill-setup__body">
        <div className="native-autofill-setup__copy">
          <strong id="native-autofill-setup-title">Finish device AutoFill setup</strong>
          <span>Complete the device settings Authwell needs to offer encrypted logins in apps and browsers.</span>
        </div>
        <ul className="native-autofill-setup__checks" aria-label="Device AutoFill setup status">
          <SetupCheck complete={autofill.enabled} label="Password provider" />
          {passkeys.supported && <SetupCheck complete={passkeys.enabled} label="Passkey provider" />}
          <SetupCheck
            complete={indexReady}
            label={indexReady
              ? `${autofill.indexedCredentials ?? loginCount} logins protected on this device`
              : 'Encrypted login index'}
          />
        </ul>
        {error && <p className="native-autofill-setup__error" role="alert">{error}</p>}
      </div>
      <div className="native-autofill-setup__actions">
        <Button size="sm" onClick={() => void runNextStep()} loading={working}>
          {actionLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={remindLater} disabled={working}>
          Later
        </Button>
      </div>
    </section>
  );
}

function SetupCheck({ complete, label }: { complete: boolean; label: string }) {
  return (
    <li data-complete={complete ? 'true' : 'false'}>
      <Icon name={complete ? 'circle-check' : 'alert-circle'} size={16} />
      <span>{label}: {complete ? 'ready' : 'needs setup'}</span>
    </li>
  );
}
