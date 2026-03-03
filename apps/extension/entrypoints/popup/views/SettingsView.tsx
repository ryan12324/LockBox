import React, { useState, useEffect } from 'react';
import { Button, Input, Select, Card } from '@lockbox/design';
import { sendMessage } from './shared.js';

export function SettingsView({ onBack }: { onBack: () => void }) {
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [twoFaSetupData, setTwoFaSetupData] = useState<{
    secret: string;
    otpauthUri: string;
    backupCodes: string[];
  } | null>(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [twoFaError, setTwoFaError] = useState('');
  const [twoFaSuccess, setTwoFaSuccess] = useState('');
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [travelMode, setTravelMode] = useState(false);
  const [travelLoading, setTravelLoading] = useState(false);
  const [travelError, setTravelError] = useState('');
  const [aliasProvider, setAliasProvider] = useState('simplelogin');
  const [aliasApiKey, setAliasApiKey] = useState('');
  const [aliasTesting, setAliasTesting] = useState(false);
  const [aliasResult, setAliasResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [lockTimeout, setLockTimeout] = useState(30);
  const [lockTimeoutSaving, setLockTimeoutSaving] = useState(false);

  useEffect(() => {
    sendMessage<{ minutes: number }>({ type: 'get-lock-timeout' })
      .then((res) => setLockTimeout(res.minutes))
      .catch(() => {});
  }, []);

  async function handleLockTimeoutChange(minutes: number) {
    setLockTimeout(minutes);
    setLockTimeoutSaving(true);
    try {
      await sendMessage<{ success: boolean }>({ type: 'set-lock-timeout', minutes });
    } catch {
      sendMessage<{ minutes: number }>({ type: 'get-lock-timeout' })
        .then((res) => setLockTimeout(res.minutes))
        .catch(() => {});
    } finally {
      setLockTimeoutSaving(false);
    }
  }
  async function handleSetup2FA() {
    setTwoFaLoading(true);
    setTwoFaError('');
    try {
      const res = await sendMessage<{
        success: boolean;
        secret?: string;
        otpauthUri?: string;
        backupCodes?: string[];
        error?: string;
      }>({ type: 'setup-2fa' });
      if (res.success && res.otpauthUri) {
        setTwoFaSetupData({
          secret: res.secret!,
          otpauthUri: res.otpauthUri,
          backupCodes: res.backupCodes ?? [],
        });
      } else {
        setTwoFaError(res.error ?? 'Failed to setup 2FA');
      }
    } catch {
      setTwoFaError('Failed to setup 2FA');
    } finally {
      setTwoFaLoading(false);
    }
  }

  async function handleVerify2FA() {
    if (!twoFaCode.trim()) return;
    setTwoFaLoading(true);
    setTwoFaError('');
    try {
      const res = await sendMessage<{ success: boolean; error?: string }>({
        type: 'verify-2fa',
        code: twoFaCode.trim(),
      });
      if (res.success) {
        setTwoFaEnabled(true);
        setTwoFaSetupData(null);
        setTwoFaCode('');
        setTwoFaSuccess('2FA enabled successfully');
        if (twoFaSetupData?.backupCodes.length) setShowBackupCodes(true);
      } else {
        setTwoFaError(res.error ?? 'Invalid code');
      }
    } catch {
      setTwoFaError('Verification failed');
    } finally {
      setTwoFaLoading(false);
    }
  }

  async function handleDisable2FA() {
    if (!disableCode.trim()) return;
    setTwoFaLoading(true);
    setTwoFaError('');
    try {
      const res = await sendMessage<{ success: boolean; error?: string }>({
        type: 'disable-2fa',
        code: disableCode.trim(),
      });
      if (res.success) {
        setTwoFaEnabled(false);
        setShowDisable(false);
        setDisableCode('');
        setTwoFaSuccess('2FA disabled');
      } else {
        setTwoFaError(res.error ?? 'Invalid code');
      }
    } catch {
      setTwoFaError('Failed to disable 2FA');
    } finally {
      setTwoFaLoading(false);
    }
  }

  async function handleTravelToggle() {
    setTravelLoading(true);
    setTravelError('');
    try {
      const res = await sendMessage<{ success: boolean; enabled?: boolean; error?: string }>({
        type: 'set-travel-mode',
        enabled: !travelMode,
      });
      if (res.success) {
        setTravelMode(res.enabled ?? !travelMode);
      } else {
        setTravelError(res.error ?? 'Failed to update');
      }
    } catch {
      setTravelError('Failed to update travel mode');
    } finally {
      setTravelLoading(false);
    }
  }

  async function handleAliasSave() {
    setAliasTesting(true);
    setAliasResult(null);
    try {
      const res = await sendMessage<{ success: boolean; alias?: string; error?: string }>({
        type: 'generate-alias',
        provider: aliasProvider,
        apiKey: aliasApiKey,
      });
      setAliasResult(
        res.success
          ? { success: true }
          : { success: false, error: res.error ?? 'Connection failed' }
      );
    } catch {
      setAliasResult({ success: false, error: 'Test failed' });
    } finally {
      setAliasTesting(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-border)]">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ←
        </Button>
        <span className="text-sm font-semibold text-[var(--color-text)]">⚙️ Settings</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        <div>
          <h3 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wider mb-2">
            ⏰ Auto-Lock Timeout
          </h3>
          <Card variant="surface" padding="sm">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-[var(--color-text)] font-medium">
                  Lock after inactivity
                </div>
                <div className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">
                  {lockTimeout === 0
                    ? 'Never auto-lock'
                    : `Locks after ${lockTimeout} min of idle time`}
                </div>
              </div>
              <Select
                value={String(lockTimeout)}
                onChange={(e) => handleLockTimeoutChange(Number(e.target.value))}
                disabled={lockTimeoutSaving}
                options={[
                  { value: '1', label: '1 min' },
                  { value: '5', label: '5 min' },
                  { value: '15', label: '15 min' },
                  { value: '30', label: '30 min' },
                  { value: '60', label: '1 hour' },
                  { value: '120', label: '2 hours' },
                  { value: '240', label: '4 hours' },
                  { value: '0', label: 'Never' },
                ]}
              />
            </div>
          </Card>
        </div>

        <div className="border-t border-[var(--color-border)] pt-4">
          <h3 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wider mb-2">
            🔐 Two-Factor Authentication
          </h3>
          {twoFaError && (
            <div className="px-3 py-2 bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-sm)] text-[var(--color-error)] text-xs mb-2">
              {twoFaError}
            </div>
          )}
          {twoFaSuccess && (
            <div className="px-3 py-2 bg-[var(--color-success-subtle)] border border-[var(--color-success)] rounded-[var(--radius-sm)] text-[var(--color-success)] text-xs mb-2">
              {twoFaSuccess}
            </div>
          )}
          {twoFaEnabled ? (
            <div className="flex flex-col gap-2">
              <Card variant="surface" padding="sm">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--color-success)] text-sm">✓</span>
                  <span className="text-xs text-[var(--color-text)]">2FA is enabled</span>
                </div>
              </Card>
              {showDisable ? (
                <div className="flex flex-col gap-2 p-3 bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-sm)]">
                  <div className="text-xs text-[var(--color-error)]">
                    Enter your TOTP code to disable 2FA:
                  </div>
                  <Input
                    type="text"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value)}
                    placeholder="000000"
                    maxLength={6}
                  />
                  <div className="flex gap-1.5">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleDisable2FA}
                      disabled={twoFaLoading}
                      className="flex-1"
                    >
                      {twoFaLoading ? 'Disabling...' : 'Disable 2FA'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setShowDisable(false);
                        setDisableCode('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowDisable(true)}
                  style={{ width: '100%' }}
                >
                  Disable 2FA
                </Button>
              )}
              {showBackupCodes && twoFaSetupData && (
                <Card variant="surface" padding="sm">
                  <div className="text-xs font-semibold text-[var(--color-text)] mb-2">
                    Backup Codes (save these securely)
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {twoFaSetupData.backupCodes.map((code, idx) => (
                      <div
                        key={idx}
                        className="font-mono text-xs text-[var(--color-primary)] bg-[var(--color-bg-subtle)] px-2 py-1 rounded-[var(--radius-sm)]"
                      >
                        {code}
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowBackupCodes(false)}
                    style={{ marginTop: 8 }}
                  >
                    Hide codes
                  </Button>
                </Card>
              )}
            </div>
          ) : twoFaSetupData ? (
            <div className="flex flex-col gap-2">
              <Card variant="surface" padding="sm">
                <div className="text-xs font-semibold text-[var(--color-text)] mb-1">
                  Scan with authenticator app:
                </div>
                <div className="font-mono text-[10px] text-[var(--color-primary)] break-all bg-[var(--color-bg-subtle)] p-2 rounded-[var(--radius-sm)]">
                  {twoFaSetupData.otpauthUri}
                </div>
                <div className="text-[10px] text-[var(--color-text-tertiary)] mt-1">
                  Manual key: {twoFaSetupData.secret}
                </div>
              </Card>
              <Input
                type="text"
                label="Verification Code"
                value={twoFaCode}
                onChange={(e) => setTwoFaCode(e.target.value)}
                placeholder="Enter 6-digit code"
                maxLength={6}
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleVerify2FA}
                disabled={twoFaLoading || twoFaCode.length < 6}
                style={{ width: '100%' }}
              >
                {twoFaLoading ? 'Verifying...' : 'Verify & Enable'}
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSetup2FA}
              disabled={twoFaLoading}
              style={{ width: '100%' }}
            >
              {twoFaLoading ? 'Setting up...' : 'Enable 2FA'}
            </Button>
          )}
        </div>

        <div className="border-t border-[var(--color-border)] pt-4">
          <h3 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wider mb-2">
            ✈️ Travel Mode
          </h3>
          {travelError && (
            <div className="px-3 py-2 bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-sm)] text-[var(--color-error)] text-xs mb-2">
              {travelError}
            </div>
          )}
          <Card variant="surface" padding="sm">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-[var(--color-text)] font-medium">Travel Mode</div>
                <div className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">
                  {travelMode ? 'Only travel-safe folders will sync' : 'All folders are synced'}
                </div>
              </div>
              <Button
                variant={travelMode ? 'primary' : 'secondary'}
                size="sm"
                onClick={handleTravelToggle}
                disabled={travelLoading}
              >
                {travelMode ? 'On' : 'Off'}
              </Button>
            </div>
          </Card>
          {travelMode && (
            <div className="mt-2 px-3 py-2 bg-[var(--color-warning-subtle)] border border-[var(--color-warning)] rounded-[var(--radius-sm)] text-[var(--color-warning)] text-xs">
              ⚠️ Only travel-safe folders will sync while travel mode is active. Disable when you
              return.
            </div>
          )}
        </div>

        <div className="border-t border-[var(--color-border)] pt-4">
          <h3 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wider mb-2">
            ✉️ Email Aliases
          </h3>
          <div className="flex flex-col gap-2">
            <Select
              label="Provider"
              value={aliasProvider}
              onChange={(e) => {
                setAliasProvider(e.target.value);
                setAliasResult(null);
              }}
              options={[
                { value: 'simplelogin', label: 'SimpleLogin' },
                { value: 'anonaddy', label: 'AnonAddy' },
              ]}
            />
            <Input
              type="password"
              label="API Key"
              value={aliasApiKey}
              onChange={(e) => setAliasApiKey(e.target.value)}
              placeholder="Enter API key"
            />
            {aliasResult && (
              <div
                className={`p-2 rounded-[var(--radius-sm)] text-xs border ${aliasResult.success ? 'bg-[var(--color-success-subtle)] border-[var(--color-success)] text-[var(--color-success)]' : 'bg-[var(--color-error-subtle)] border-[var(--color-error)] text-[var(--color-error)]'}`}
              >
                {aliasResult.success ? '✓ Connection successful' : `✕ ${aliasResult.error}`}
              </div>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={handleAliasSave}
              disabled={aliasTesting}
              style={{ width: '100%' }}
            >
              {aliasTesting ? 'Testing...' : 'Test & Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
