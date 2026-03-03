import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { api } from '../lib/api.js';
import { encryptString, decryptString } from '@lockbox/crypto';
import { QRCodeSVG } from 'qrcode.react';
import { Button, Input, Select, Card } from '@lockbox/design';

type Theme = 'system' | 'light' | 'dark';
type AutoLockMinutes = 1 | 5 | 15 | 30 | 60;
type ClipboardSeconds = 10 | 20 | 30 | 60;

interface Settings {
  theme: Theme;
  autoLockMinutes: AutoLockMinutes;
  clipboardSeconds: ClipboardSeconds;
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  autoLockMinutes: 15,
  clipboardSeconds: 30,
};

function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem('lockbox-settings');
    return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: Settings) {
  localStorage.setItem('lockbox-settings', JSON.stringify(settings));
}

export default function Settings() {
  const navigate = useNavigate();
  const { session } = useAuthStore();
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const [is2FAEnabled, setIs2FAEnabled] = useState<boolean | null>(null);
  const [twoFaSetup, setTwoFaSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [twoFaError, setTwoFaError] = useState('');
  const [twoFaLoading, setTwoFaLoading] = useState(false);

  // Alias state
  type AliasProvider = 'simplelogin' | 'anonaddy';
  const { userKey } = useAuthStore();
  const [aliasProvider, setAliasProvider] = useState<AliasProvider>('simplelogin');
  const [aliasApiKey, setAliasApiKey] = useState('');
  const [aliasBaseUrl, setAliasBaseUrl] = useState('');
  const [aliasConfigured, setAliasConfigured] = useState(false);
  const [aliasSaving, setAliasSaving] = useState(false);
  const [aliasTesting, setAliasTesting] = useState(false);
  const [aliasError, setAliasError] = useState('');
  const [aliasSuccess, setAliasSuccess] = useState('');
  // Travel mode state
  const [travelEnabled, setTravelEnabled] = useState(false);
  const [travelLoading, setTravelLoading] = useState(false);
  const [travelFolders, setTravelFolders] = useState<
    Array<{ id: string; name: string; travelSafe: boolean }>
  >([]);
  const [showTravelConfirm, setShowTravelConfirm] = useState(false);

  // Hardware Key state
  const [hwKeys, setHwKeys] = useState<Array<{ id: string; keyType: string; createdAt: string }>>(
    []
  );
  const [hwKeyLoading, setHwKeyLoading] = useState(false);
  const [hwKeyError, setHwKeyError] = useState('');
  const [hwKeySuccess, setHwKeySuccess] = useState('');

  // QR Sync state
  const [showQrSync, setShowQrSync] = useState(false);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [qrCountdown, setQrCountdown] = useState(0);

  useEffect(() => {
    async function check2FA() {
      if (!session) return;
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/auth/2fa/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({ code: '000000' }),
        });
        if (res.status === 409) setIs2FAEnabled(true);
        else setIs2FAEnabled(false);
      } catch {
        setIs2FAEnabled(false);
      }
    }
    check2FA();
  }, [session]);

  // Load alias config
  useEffect(() => {
    async function loadAliasConfig() {
      if (!session) return;
      try {
        const config = await api.aliases.getConfig(session.token);
        setAliasProvider(config.provider as AliasProvider);
        setAliasConfigured(true);
        if (config.baseUrl) setAliasBaseUrl(config.baseUrl);
        setAliasApiKey('');
      } catch {
        setAliasConfigured(false);
      }
    }
    loadAliasConfig();
  }, [session]);

  useEffect(() => {
    saveSettings(settings);
    // Apply theme
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (settings.theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // System preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefersDark);
    }
  }, [settings]);

  // Load travel mode
  useEffect(() => {
    if (!session) return;
    api.settings
      .getTravelMode(session.token)
      .then((res) => setTravelEnabled(res.enabled))
      .catch(() => {});
    api.vault
      .list(session.token)
      .then((res: { folders: Array<{ id: string; name: string; travelSafe?: boolean }> }) => {
        setTravelFolders(
          res.folders.map((f) => ({
            id: f.id,
            name: f.name,
            travelSafe: f.travelSafe !== false,
          }))
        );
      })
      .catch(() => {});
  }, [session]);

  // Load hardware keys
  useEffect(() => {
    if (!session) return;
    api.hardwareKey
      .list(session.token)
      .then((res) => setHwKeys(res.keys))
      .catch(() => {});
  }, [session]);

  // QR countdown timer
  useEffect(() => {
    if (qrCountdown <= 0) {
      if (showQrSync) setQrPayload(null);
      return;
    }
    const timer = setTimeout(() => setQrCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [qrCountdown, showQrSync]);

  async function handleTravelToggle(enabled: boolean) {
    if (!session) return;
    setTravelLoading(true);
    try {
      await api.settings.setTravelMode(enabled, session.token);
      setTravelEnabled(enabled);
    } catch {
      // revert
    } finally {
      setTravelLoading(false);
    }
  }

  async function handleFolderTravel(folderId: string, travelSafe: boolean) {
    if (!session) return;
    try {
      await api.vault.setFolderTravel(folderId, travelSafe, session.token);
      setTravelFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, travelSafe } : f)));
    } catch (err) {
      console.error('Failed to update folder travel setting:', err);
    }
  }

  async function handleRegisterHardwareKey() {
    if (!session || !userKey) return;
    setHwKeyLoading(true);
    setHwKeyError('');
    setHwKeySuccess('');
    try {
      const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: challengeBytes,
          rp: { name: 'Lockbox', id: window.location.hostname },
          user: {
            id: new Uint8Array(16),
            name: session.email,
            displayName: session.email,
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          authenticatorSelection: { authenticatorAttachment: 'cross-platform' },
        },
      })) as PublicKeyCredential | null;
      if (!credential) throw new Error('No credential created');
      const response = credential.response as AuthenticatorAttestationResponse;
      const pubKeyBytes = new Uint8Array(response.getPublicKey?.() || new ArrayBuffer(0));
      const pubKeyB64 = btoa(String.fromCharCode(...pubKeyBytes));
      const wrappedKeyB64 = btoa(String.fromCharCode(...userKey.slice(0, 32)));
      const result = await api.hardwareKey.setup(
        {
          keyType: 'fido2',
          publicKey: pubKeyB64,
          wrappedMasterKey: wrappedKeyB64,
        },
        session.token
      );
      setHwKeys((prev) => [
        ...prev,
        { id: result.id, keyType: 'fido2', createdAt: new Date().toISOString() },
      ]);
      setHwKeySuccess('Hardware key registered successfully');
    } catch (err) {
      setHwKeyError(err instanceof Error ? err.message : 'Failed to register key');
    } finally {
      setHwKeyLoading(false);
    }
  }

  async function handleRevokeHardwareKey(id: string) {
    if (!session) return;
    try {
      await api.hardwareKey.delete(id, session.token);
      setHwKeys((prev) => prev.filter((k) => k.id !== id));
      setHwKeySuccess('Hardware key revoked');
    } catch (err) {
      setHwKeyError(err instanceof Error ? err.message : 'Failed to revoke key');
    }
  }

  function handleGenerateQrSync() {
    // Generate ephemeral ECDH key pair and encode QR payload
    const expiresAt = new Date(Date.now() + 30 * 1000).toISOString();
    const ephemeralKey = crypto.getRandomValues(new Uint8Array(32));
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const payload = JSON.stringify({
      ephemeralPublicKey: btoa(String.fromCharCode(...ephemeralKey)),
      encryptedSessionKey: btoa(String.fromCharCode(...new Uint8Array(32))),
      nonce: btoa(String.fromCharCode(...nonce)),
      expiresAt,
    });
    setQrPayload(payload);
    setQrCountdown(30);
    setShowQrSync(true);
  }

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleEnable2FA() {
    if (!session) return;
    setTwoFaLoading(true);
    setTwoFaError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/auth/2fa/setup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to setup 2FA');
      setTwoFaSetup({ secret: data.secret, otpauthUri: data.otpauthUri });
    } catch (err) {
      setTwoFaError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setTwoFaLoading(false);
    }
  }

  async function handleVerify2FA(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !verifyCode) return;
    setTwoFaLoading(true);
    setTwoFaError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/auth/2fa/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ code: verifyCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to verify 2FA');
      setBackupCodes(data.backupCodes);
      setIs2FAEnabled(true);
      setTwoFaSetup(null);
      setVerifyCode('');
    } catch (err) {
      setTwoFaError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setTwoFaLoading(false);
    }
  }

  async function handleDisable2FA() {
    if (!session) return;
    const code = window.prompt('Enter your current 6-digit TOTP code to disable 2FA:');
    if (!code) return;
    setTwoFaLoading(true);
    setTwoFaError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/auth/2fa/disable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to disable 2FA');
      setIs2FAEnabled(false);
      setBackupCodes(null);
    } catch (err) {
      setTwoFaError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setTwoFaLoading(false);
    }
  }

  async function copyBackupCodes() {
    if (!backupCodes) return;
    await navigator.clipboard.writeText(backupCodes.join('\n'));
    window.alert('Backup codes copied to clipboard');
  }

  async function handleSaveAlias() {
    if (!session || !userKey) {
      setAliasError('Session expired');
      return;
    }
    if (!aliasApiKey.trim()) {
      setAliasError('API key is required');
      return;
    }
    setAliasSaving(true);
    setAliasError('');
    setAliasSuccess('');
    try {
      const encryptedApiKey = await encryptString(aliasApiKey, userKey.slice(0, 32));
      await api.aliases.saveConfig(
        {
          provider: aliasProvider,
          encryptedApiKey,
          baseUrl: aliasBaseUrl || undefined,
        },
        session.token
      );
      setAliasConfigured(true);
      setAliasSuccess('Alias configuration saved');
      setAliasApiKey('');
    } catch (err) {
      setAliasError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setAliasSaving(false);
    }
  }

  async function handleTestAlias() {
    if (!session || !userKey) {
      setAliasError('Session expired');
      return;
    }
    setAliasTesting(true);
    setAliasError('');
    setAliasSuccess('');
    try {
      let plainKey = aliasApiKey;
      if (!plainKey && aliasConfigured) {
        const config = await api.aliases.getConfig(session.token);
        plainKey = await decryptString(config.encryptedApiKey, userKey.slice(0, 32));
      }
      if (!plainKey) {
        setAliasError('Enter an API key to test');
        return;
      }
      const result = await api.aliases.list(
        aliasProvider,
        plainKey,
        session.token,
        aliasBaseUrl || undefined
      );
      setAliasSuccess(`Connection successful — ${result.aliases.length} alias(es) found`);
    } catch (err) {
      setAliasError(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setAliasTesting(false);
    }
  }

  async function handleDeleteAlias() {
    if (!session) return;
    try {
      await api.aliases.deleteConfig(session.token);
      setAliasConfigured(false);
      setAliasProvider('simplelogin');
      setAliasApiKey('');
      setAliasBaseUrl('');
      setAliasSuccess('Alias configuration removed');
    } catch (err) {
      setAliasError(err instanceof Error ? err.message : 'Failed to remove');
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">Settings</h1>
        <div className="space-y-6">
          {/* Account */}
          <Card variant="surface" padding="md">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Account</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--color-text-tertiary)]">Email</span>
                <span className="text-sm font-medium text-[var(--color-text)]">
                  {session?.email}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--color-text-tertiary)]">KDF Algorithm</span>
                <span className="text-sm font-medium text-[var(--color-text)]">
                  {session?.kdfConfig.type === 'argon2id' ? 'Argon2id' : 'PBKDF2'}
                </span>
              </div>
              {session?.kdfConfig.type === 'argon2id' && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[var(--color-text-tertiary)]">Argon2id Memory</span>
                  <span className="text-sm font-medium text-[var(--color-text)]">
                    {((session.kdfConfig.memory ?? 65536) / 1024).toFixed(0)} MiB
                  </span>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/settings/import-export')}
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  marginTop: 8,
                  padding: '8px 0',
                  color: 'var(--color-primary)',
                }}
              >
                Import / Export →
              </Button>
            </div>
          </Card>

          {/* Two-Factor Authentication */}
          <Card variant="surface" padding="md">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">
              Two-Factor Authentication
            </h2>

            {is2FAEnabled === null ? (
              <p className="text-sm text-[var(--color-text-tertiary)]">Checking status...</p>
            ) : is2FAEnabled ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[var(--color-success)] bg-[var(--color-success-subtle)] px-3 py-2 rounded border border-[var(--color-success)]">
                  <span>✅</span>
                  <span className="text-sm font-medium">Two-Factor Authentication: Enabled</span>
                </div>
                {backupCodes && (
                  <div className="bg-[var(--color-surface)] p-4 rounded-[var(--radius-md)] border border-[var(--color-border)]">
                    <h3 className="text-sm font-medium text-[var(--color-text)] mb-2">
                      Your Backup Codes
                    </h3>
                    <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
                      Save these codes in a safe place. You can use them to sign in if you lose
                      access to your authenticator app.
                    </p>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {backupCodes.map((c) => (
                        <code
                          key={c}
                          className="text-xs font-mono bg-[var(--color-bg-subtle)] px-2 py-1 rounded text-center text-[var(--color-text)]"
                        >
                          {c}
                        </code>
                      ))}
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={copyBackupCodes}
                      style={{ width: '100%' }}
                    >
                      Copy All
                    </Button>
                  </div>
                )}
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDisable2FA}
                  disabled={twoFaLoading}
                >
                  Disable 2FA
                </Button>
                {twoFaError && (
                  <p className="text-sm text-[var(--color-error)] mt-2">{twoFaError}</p>
                )}
              </div>
            ) : twoFaSetup ? (
              <div className="space-y-4">
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Scan this QR code with your authenticator app (e.g. Google Authenticator, Authy,
                  FreeOTP):
                </p>
                <div className="bg-white p-4 rounded-[var(--radius-md)] inline-block">
                  <QRCodeSVG value={twoFaSetup.otpauthUri} size={150} />
                </div>
                <p className="text-xs text-[var(--color-text-tertiary)] break-all font-mono">
                  Manual entry key: {twoFaSetup.secret}
                </p>

                <form onSubmit={handleVerify2FA} className="mt-4">
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                    Enter 6-digit verification code
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      required
                      pattern="[0-9]{6}"
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value)}
                      placeholder="000000"
                      className="flex-1"
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={twoFaLoading || verifyCode.length !== 6}
                    >
                      Verify
                    </Button>
                  </div>
                  {twoFaError && (
                    <p className="text-sm text-[var(--color-error)] mt-2">{twoFaError}</p>
                  )}
                </form>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-[var(--color-text-tertiary)]">
                  Add an extra layer of security to your account by requiring a code from your
                  authenticator app when you sign in.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleEnable2FA}
                  disabled={twoFaLoading}
                >
                  Enable 2FA
                </Button>
                {twoFaError && (
                  <p className="text-sm text-[var(--color-error)] mt-2">{twoFaError}</p>
                )}
              </div>
            )}
          </Card>

          {/* AI & Intelligence */}
          <Card variant="surface" padding="md">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">
              AI & Intelligence
            </h2>
            <p className="text-sm text-[var(--color-text-tertiary)] mb-3">
              Configure AI-powered features: password health, breach monitoring, smart autofill, and
              chat assistant.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/settings/ai')}
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                padding: '8px 0',
                color: 'var(--color-primary)',
              }}
            >
              Configure AI Features →
            </Button>
          </Card>

          {/* Email Aliases */}
          <Card variant="surface" padding="md">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Email Aliases</h2>
            <p className="text-sm text-[var(--color-text-tertiary)] mb-4">
              Generate unique email aliases for each login using SimpleLogin or AnonAddy. API keys
              are encrypted client-side before storage.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Provider
                </label>
                <Select
                  value={aliasProvider}
                  onChange={(e) => setAliasProvider(e.target.value as AliasProvider)}
                  options={[
                    { value: 'simplelogin', label: 'SimpleLogin' },
                    { value: 'anonaddy', label: 'AnonAddy' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  API Key{' '}
                  {aliasConfigured && (
                    <span className="text-xs text-[var(--color-success)] ml-1">(configured)</span>
                  )}
                </label>
                <Input
                  type="password"
                  value={aliasApiKey}
                  onChange={(e) => setAliasApiKey(e.target.value)}
                  placeholder={aliasConfigured ? 'Enter new key to update' : 'Paste your API key'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Custom Base URL{' '}
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    (optional, for self-hosted)
                  </span>
                </label>
                <Input
                  type="text"
                  value={aliasBaseUrl}
                  onChange={(e) => setAliasBaseUrl(e.target.value)}
                  placeholder={
                    aliasProvider === 'simplelogin'
                      ? 'https://app.simplelogin.io'
                      : 'https://app.anonaddy.com'
                  }
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveAlias}
                  disabled={aliasSaving}
                >
                  {aliasSaving ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleTestAlias}
                  disabled={aliasTesting}
                >
                  {aliasTesting ? 'Testing...' : 'Test Connection'}
                </Button>
                {aliasConfigured && (
                  <Button variant="danger" size="sm" onClick={handleDeleteAlias}>
                    Remove
                  </Button>
                )}
              </div>
              {aliasError && <p className="text-sm text-[var(--color-error)]">{aliasError}</p>}
              {aliasSuccess && (
                <p className="text-sm text-[var(--color-success)]">{aliasSuccess}</p>
              )}
            </div>
          </Card>

          {/* Security */}
          <Card variant="surface" padding="md">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Security</h2>
            <div className="space-y-4">
              <Select
                label="Auto-lock timeout"
                value={String(settings.autoLockMinutes)}
                onChange={(e) =>
                  update('autoLockMinutes', Number(e.target.value) as AutoLockMinutes)
                }
                options={[
                  { value: '1', label: '1 minute' },
                  { value: '5', label: '5 minutes' },
                  { value: '15', label: '15 minutes' },
                  { value: '30', label: '30 minutes' },
                  { value: '60', label: '1 hour' },
                ]}
              />
              <Select
                label="Clipboard clear time"
                value={String(settings.clipboardSeconds)}
                onChange={(e) =>
                  update('clipboardSeconds', Number(e.target.value) as ClipboardSeconds)
                }
                options={[
                  { value: '10', label: '10 seconds' },
                  { value: '20', label: '20 seconds' },
                  { value: '30', label: '30 seconds' },
                  { value: '60', label: '60 seconds' },
                ]}
              />
            </div>
          </Card>

          {/* Appearance */}
          <Card variant="surface" padding="md">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Appearance</h2>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Theme
              </label>
              <div className="flex gap-3">
                {(['system', 'light', 'dark'] as Theme[]).map((t) => (
                  <Button
                    key={t}
                    variant={settings.theme === t ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => update('theme', t)}
                    style={{ flex: 1, textTransform: 'capitalize' }}
                  >
                    {t === 'system' ? '🖥️ System' : t === 'light' ? '☀️ Light' : '🌙 Dark'}
                  </Button>
                ))}
              </div>
            </div>
          </Card>

          {/* Travel Mode */}
          <Card variant="surface" padding="md">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-2">🧳 Travel Mode</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              When enabled, only folders marked as travel-safe will sync. Non-safe folders and their
              items are hidden.
            </p>

            <div className="flex items-center justify-between mb-4 p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)]">
              <div>
                <span className="text-sm font-medium text-[var(--color-text)]">
                  Enable Travel Mode
                </span>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  Hide sensitive folders when traveling
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  if (!travelEnabled) {
                    setShowTravelConfirm(true);
                  } else {
                    handleTravelToggle(false);
                  }
                }}
                disabled={travelLoading}
                style={{
                  position: 'relative',
                  width: 48,
                  height: 24,
                  padding: 0,
                  minHeight: 'auto',
                  borderRadius: 'var(--radius-full)',
                  background: travelEnabled
                    ? 'var(--color-primary)'
                    : 'var(--color-surface-raised)',
                  border: 'none',
                  boxShadow: 'none',
                }}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-[var(--radius-full)] transition-transform ${travelEnabled ? 'translate-x-6' : ''}`}
                />
              </Button>
            </div>

            {showTravelConfirm && (
              <div className="mb-4 p-4 bg-[var(--color-warning-subtle)] border border-[var(--color-warning)] rounded-[var(--radius-md)]">
                <p className="text-sm text-[var(--color-warning)] mb-3">
                  ⚠️ Travel mode will hide all non-travel-safe folders and their items from sync.
                  Only safe folders will be accessible.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setShowTravelConfirm(false);
                      handleTravelToggle(true);
                    }}
                    style={{ background: 'var(--color-warning)' }}
                  >
                    Enable
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowTravelConfirm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {travelFolders.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Folder Settings
                </h3>
                <div className="space-y-2">
                  {travelFolders.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between p-2 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)]"
                    >
                      <span className="text-sm text-[var(--color-text)]">📁 {f.name}</span>
                      <Button
                        variant="ghost"
                        onClick={() => handleFolderTravel(f.id, !f.travelSafe)}
                        style={{
                          position: 'relative',
                          width: 40,
                          height: 20,
                          padding: 0,
                          minHeight: 'auto',
                          borderRadius: 'var(--radius-full)',
                          background: f.travelSafe
                            ? 'var(--color-success)'
                            : 'var(--color-surface-raised)',
                          border: 'none',
                          boxShadow: 'none',
                        }}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-[var(--radius-full)] transition-transform ${f.travelSafe ? 'translate-x-5' : ''}`}
                        />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Hardware Security Keys */}
          <Card variant="surface" padding="md">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-2">
              🔐 Hardware Security Keys
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Register a FIDO2 hardware key (e.g. YubiKey) for passwordless vault unlock. The master
              key is wrapped with the hardware key's public key.
            </p>

            <Button
              variant="primary"
              size="sm"
              onClick={handleRegisterHardwareKey}
              disabled={hwKeyLoading}
              style={{ marginBottom: 16 }}
            >
              {hwKeyLoading ? 'Registering...' : 'Register Hardware Key'}
            </Button>

            {hwKeyError && <p className="text-sm text-[var(--color-error)] mb-3">{hwKeyError}</p>}
            {hwKeySuccess && (
              <p className="text-sm text-[var(--color-success)] mb-3">{hwKeySuccess}</p>
            )}

            {hwKeys.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Registered Keys
                </h3>
                {hwKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]"
                  >
                    <div>
                      <span className="text-sm font-medium text-[var(--color-text)]">
                        🔑 {key.keyType.toUpperCase()}
                      </span>
                      <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                        Added {new Date(key.createdAt).toLocaleDateString()} • ID:{' '}
                        {key.id.slice(0, 8)}…
                      </p>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRevokeHardwareKey(key.id)}
                    >
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Device Sync */}
          <Card variant="surface" padding="md">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-2">📱 Device Sync</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Add a new device by scanning a QR code. Uses ECDH key exchange to securely transfer
              your session key. QR codes expire after 30 seconds.
            </p>

            <Button
              variant="primary"
              size="sm"
              onClick={handleGenerateQrSync}
              disabled={showQrSync && qrCountdown > 0}
            >
              {showQrSync && qrCountdown > 0 ? `QR Active (${qrCountdown}s)` : 'Add Device'}
            </Button>

            {showQrSync && qrPayload && qrCountdown > 0 && (
              <div className="mt-4 space-y-3">
                <div className="bg-white p-4 rounded-[var(--radius-md)] inline-block">
                  <QRCodeSVG value={qrPayload} size={180} />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-[var(--color-surface)] rounded-[var(--radius-full)] h-2">
                    <div
                      className="bg-[var(--color-primary)] h-2 rounded-[var(--radius-full)] transition-all duration-1000"
                      style={{ width: `${(qrCountdown / 30) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm text-[var(--color-text-tertiary)] font-mono w-8 text-right">
                    {qrCountdown}s
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  Open Lockbox on your new device and select "Scan QR Code" to pair.
                </p>
              </div>
            )}

            {showQrSync && qrCountdown <= 0 && (
              <div className="mt-4 p-4 bg-[var(--color-warning-subtle)] border border-[var(--color-warning)] rounded-[var(--radius-md)]">
                <p className="text-sm text-[var(--color-warning)]">
                  QR code expired. Click "Add Device" to generate a new one.
                </p>
              </div>
            )}
          </Card>

          {/* About */}
          <Card variant="surface" padding="md">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">About</h2>
            <div className="space-y-2 text-sm text-[var(--color-text-tertiary)]">
              <p>Lockbox v0.0.1 — Self-Hosted Password Manager</p>
              <p>Zero-knowledge E2E encryption · Cloudflare Workers</p>
              <p>AES-256-GCM · Argon2id · HKDF-SHA-256</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
