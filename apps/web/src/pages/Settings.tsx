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
  const [travelEnabled, setTravelEnabled] = useState(false);
  const [travelLoading, setTravelLoading] = useState(false);
  const [travelFolders, setTravelFolders] = useState<
    Array<{ id: string; name: string; travelSafe: boolean }>
  >([]);
  const [showTravelConfirm, setShowTravelConfirm] = useState(false);

  const [hwKeys, setHwKeys] = useState<Array<{ id: string; keyType: string; createdAt: string }>>(
    []
  );
  const [hwKeyLoading, setHwKeyLoading] = useState(false);
  const [hwKeyError, setHwKeyError] = useState('');
  const [hwKeySuccess, setHwKeySuccess] = useState('');

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
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (settings.theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefersDark);
    }
  }, [settings]);

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

  useEffect(() => {
    if (!session) return;
    api.hardwareKey
      .list(session.token)
      .then((res) => setHwKeys(res.keys))
      .catch(() => {});
  }, [session]);

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

  const sectionHeading: React.CSSProperties = {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: 16,
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 500,
    color: 'var(--color-text-tertiary)',
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 500,
    color: 'var(--color-text)',
  };

  const descStyle: React.CSSProperties = {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-tertiary)',
    marginBottom: 16,
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <h1
          style={{
            fontSize: 'var(--font-size-2xl)',
            fontWeight: 700,
            color: 'var(--color-text)',
            marginBottom: 20,
          }}
        >
          Settings
        </h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card variant="surface" padding="lg">
            <h2 style={sectionHeading}>Account</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={rowStyle}>
                <span style={labelStyle}>Email</span>
                <span style={valueStyle}>{session?.email}</span>
              </div>
              <div style={rowStyle}>
                <span style={labelStyle}>KDF Algorithm</span>
                <span style={valueStyle}>
                  {session?.kdfConfig.type === 'argon2id' ? 'Argon2id' : 'PBKDF2'}
                </span>
              </div>
              {session?.kdfConfig.type === 'argon2id' && (
                <div style={rowStyle}>
                  <span style={labelStyle}>Argon2id Memory</span>
                  <span style={valueStyle}>
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

          <Card variant="surface" padding="lg">
            <h2 style={sectionHeading}>Two-Factor Authentication</h2>

            {is2FAEnabled === null ? (
              <p style={{ ...descStyle, marginBottom: 0 }}>Checking status...</p>
            ) : is2FAEnabled ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: 'var(--color-success)',
                    background: 'var(--color-success-subtle)',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <span>✅</span>
                  <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
                    Two-Factor Authentication: Enabled
                  </span>
                </div>
                {backupCodes && (
                  <Card variant="surface" padding="lg">
                    <h3
                      style={{
                        fontSize: 'var(--font-size-base)',
                        fontWeight: 600,
                        color: 'var(--color-text)',
                        marginBottom: 8,
                      }}
                    >
                      Your Backup Codes
                    </h3>
                    <p style={{ ...descStyle, marginBottom: 12 }}>
                      Save these codes in a safe place. You can use them to sign in if you lose
                      access to your authenticator app.
                    </p>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 8,
                        marginBottom: 14,
                      }}
                    >
                      {backupCodes.map((c) => (
                        <code
                          key={c}
                          style={{
                            fontSize: 'var(--font-size-sm)',
                            fontFamily: 'var(--font-mono, monospace)',
                            background: 'var(--color-bg-subtle)',
                            padding: '6px 10px',
                            borderRadius: 'var(--radius-sm)',
                            textAlign: 'center',
                            color: 'var(--color-text)',
                          }}
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
                  </Card>
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
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-error)' }}>
                    {twoFaError}
                  </p>
                )}
              </div>
            ) : twoFaSetup ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-secondary)',
                    margin: 0,
                  }}
                >
                  Scan this QR code with your authenticator app (e.g. Google Authenticator, Authy,
                  FreeOTP):
                </p>
                <Card
                  variant="frost"
                  padding="lg"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    alignSelf: 'center',
                    background: 'white',
                  }}
                >
                  <QRCodeSVG value={twoFaSetup.otpauthUri} size={150} />
                </Card>
                <p
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-tertiary)',
                    wordBreak: 'break-all',
                    fontFamily: 'var(--font-mono, monospace)',
                    margin: 0,
                  }}
                >
                  Manual entry key: {twoFaSetup.secret}
                </p>

                <form onSubmit={handleVerify2FA}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 500,
                      color: 'var(--color-text-secondary)',
                      marginBottom: 8,
                    }}
                  >
                    Enter 6-digit verification code
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Input
                      type="text"
                      required
                      pattern="[0-9]{6}"
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value)}
                      placeholder="000000"
                      style={{ flex: 1 }}
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
                    <p
                      style={{
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-error)',
                        marginTop: 8,
                      }}
                    >
                      {twoFaError}
                    </p>
                  )}
                </form>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ ...descStyle, marginBottom: 0 }}>
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
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-error)' }}>
                    {twoFaError}
                  </p>
                )}
              </div>
            )}
          </Card>

          <Card variant="surface" padding="lg">
            <h2 style={sectionHeading}>AI & Intelligence</h2>
            <p style={descStyle}>
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

          <Card variant="surface" padding="lg">
            <h2 style={sectionHeading}>Email Aliases</h2>
            <p style={descStyle}>
              Generate unique email aliases for each login using SimpleLogin or AnonAddy. API keys
              are encrypted client-side before storage.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 8,
                  }}
                >
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
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 8,
                  }}
                >
                  API Key{' '}
                  {aliasConfigured && (
                    <span
                      style={{
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-success)',
                        marginLeft: 4,
                      }}
                    >
                      (configured)
                    </span>
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
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 8,
                  }}
                >
                  Custom Base URL{' '}
                  <span
                    style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}
                  >
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
              <div style={{ display: 'flex', gap: 8 }}>
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
              {aliasError && (
                <p
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-error)',
                    margin: 0,
                  }}
                >
                  {aliasError}
                </p>
              )}
              {aliasSuccess && (
                <p
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-success)',
                    margin: 0,
                  }}
                >
                  {aliasSuccess}
                </p>
              )}
            </div>
          </Card>

          <Card variant="surface" padding="lg">
            <h2 style={sectionHeading}>Security</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

          <Card variant="surface" padding="lg">
            <h2 style={sectionHeading}>Appearance</h2>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 500,
                  color: 'var(--color-text-secondary)',
                  marginBottom: 10,
                }}
              >
                Theme
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
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

          <Card
            variant="surface"
            padding="lg"
            style={{
              borderLeft: '4px solid var(--color-warning)',
            }}
          >
            <h2 style={{ ...sectionHeading, marginBottom: 8 }}>🧳 Travel Mode</h2>
            <p
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: 16,
              }}
            >
              When enabled, only folders marked as travel-safe will sync. Non-safe folders and their
              items are hidden.
            </p>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
                padding: 14,
                background: 'var(--color-bg-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div>
                <span style={valueStyle}>Enable Travel Mode</span>
                <p
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-tertiary)',
                    marginTop: 2,
                    margin: 0,
                    marginBlockStart: 2,
                  }}
                >
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
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: 2,
                    width: 20,
                    height: 20,
                    background: 'white',
                    borderRadius: 'var(--radius-full)',
                    transition: 'transform 150ms ease',
                    transform: travelEnabled ? 'translateX(24px)' : 'translateX(0)',
                  }}
                />
              </Button>
            </div>

            {showTravelConfirm && (
              <div
                style={{
                  marginBottom: 16,
                  padding: 16,
                  background: 'var(--color-warning-subtle)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <p
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-warning)',
                    marginBottom: 12,
                  }}
                >
                  ⚠️ Travel mode will hide all non-travel-safe folders and their items from sync.
                  Only safe folders will be accessible.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
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
                <h3
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 10,
                  }}
                >
                  Folder Settings
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {travelFolders.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: 'var(--color-bg-subtle)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text)' }}>
                        📁 {f.name}
                      </span>
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
                          style={{
                            position: 'absolute',
                            top: 2,
                            left: 2,
                            width: 16,
                            height: 16,
                            background: 'white',
                            borderRadius: 'var(--radius-full)',
                            transition: 'transform 150ms ease',
                            transform: f.travelSafe ? 'translateX(20px)' : 'translateX(0)',
                          }}
                        />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card variant="surface" padding="lg">
            <h2 style={{ ...sectionHeading, marginBottom: 8 }}>🔐 Hardware Security Keys</h2>
            <p
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: 16,
              }}
            >
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

            {hwKeyError && (
              <p
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-error)',
                  marginBottom: 12,
                }}
              >
                {hwKeyError}
              </p>
            )}
            {hwKeySuccess && (
              <p
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-success)',
                  marginBottom: 12,
                }}
              >
                {hwKeySuccess}
              </p>
            )}

            {hwKeys.length > 0 && (
              <div>
                <h3
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 10,
                  }}
                >
                  Registered Keys
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {hwKeys.map((key) => (
                    <div
                      key={key.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 14,
                        background: 'var(--color-bg-subtle)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <div>
                        <span style={valueStyle}>🔑 {key.keyType.toUpperCase()}</span>
                        <p
                          style={{
                            fontSize: 'var(--font-size-sm)',
                            color: 'var(--color-text-tertiary)',
                            marginTop: 2,
                            margin: 0,
                            marginBlockStart: 2,
                          }}
                        >
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
              </div>
            )}
          </Card>

          <Card variant="surface" padding="lg">
            <h2 style={{ ...sectionHeading, marginBottom: 8 }}>📱 Device Sync</h2>
            <p
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: 16,
              }}
            >
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
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Card
                  variant="frost"
                  padding="lg"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    alignSelf: 'center',
                    background: 'white',
                  }}
                >
                  <QRCodeSVG value={qrPayload} size={180} />
                </Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      flex: 1,
                      background: 'var(--color-surface)',
                      borderRadius: 'var(--radius-full)',
                      height: 8,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        background: 'var(--color-primary)',
                        height: 8,
                        borderRadius: 'var(--radius-full)',
                        transition: 'width 1s linear',
                        width: `${(qrCountdown / 30) * 100}%`,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-tertiary)',
                      fontFamily: 'var(--font-mono, monospace)',
                      width: 32,
                      textAlign: 'right',
                    }}
                  >
                    {qrCountdown}s
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-tertiary)',
                    margin: 0,
                  }}
                >
                  Open Lockbox on your new device and select "Scan QR Code" to pair.
                </p>
              </div>
            )}

            {showQrSync && qrCountdown <= 0 && (
              <div
                style={{
                  marginTop: 16,
                  padding: 16,
                  background: 'var(--color-warning-subtle)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <p
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-warning)',
                    margin: 0,
                  }}
                >
                  QR code expired. Click "Add Device" to generate a new one.
                </p>
              </div>
            )}
          </Card>

          <Card variant="surface" padding="lg">
            <h2 style={sectionHeading}>About</h2>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              <p style={{ margin: 0 }}>Lockbox v0.0.1 — Self-Hosted Password Manager</p>
              <p style={{ margin: 0 }}>Zero-knowledge E2E encryption · Cloudflare Workers</p>
              <p style={{ margin: 0 }}>AES-256-GCM · Argon2id · HKDF-SHA-256</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
