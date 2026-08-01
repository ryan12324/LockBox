import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { api } from '../lib/api.js';
import {
  deriveKey,
  encryptString,
  decryptString,
  encryptUserKey,
  makeAuthHash,
  toBase64,
  toUtf8,
} from '@lockbox/crypto';
import { QRCodeSVG } from 'qrcode.react';
import { Button, Input, Select, Card, Icon } from '@lockbox/design';
import {
  getNativeAutofillStatus,
  getNativePasskeyStatus,
  openNativeAutofillSettings,
  openNativePasskeySettings,
} from '../lib/native-autofill.js';
import { applyThemePreference, type ThemePreference } from '../lib/theme.js';

type AutoLockMinutes = 1 | 5 | 15 | 30 | 60;
type ClipboardSeconds = 10 | 20 | 30 | 60;

interface Settings {
  theme: ThemePreference;
  autoLockMinutes: AutoLockMinutes;
  clipboardSeconds: ClipboardSeconds;
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  autoLockMinutes: 15,
  clipboardSeconds: 30,
};

const ALIAS_API_KEY_AAD = toUtf8('lockbox:alias-api-key:v1');

async function decryptAliasApiKey(encryptedApiKey: string, userKey: Uint8Array): Promise<string> {
  try {
    return await decryptString(encryptedApiKey, userKey.slice(0, 32), ALIAS_API_KEY_AAD);
  } catch {
    // Pre-v1 builds stored this value without AAD. Accept it once so users can
    // test or replace an existing configuration during the upgrade.
    return decryptString(encryptedApiKey, userKey.slice(0, 32));
  }
}

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
  const { session, userKey, masterKey, setSession, setKeys } = useAuthStore();
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const [currentMasterPassword, setCurrentMasterPassword] = useState('');
  const [newMasterPassword, setNewMasterPassword] = useState('');
  const [confirmMasterPassword, setConfirmMasterPassword] = useState('');
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const [is2FAEnabled, setIs2FAEnabled] = useState<boolean | null>(null);
  const [twoFaSetup, setTwoFaSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [twoFaError, setTwoFaError] = useState('');
  const [twoFaLoading, setTwoFaLoading] = useState(false);

  type AliasProvider = 'simplelogin' | 'anonaddy';
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
  const [nativeAutofill, setNativeAutofill] = useState<{
    supported: boolean;
    enabled: boolean;
  }>({ supported: false, enabled: false });
  const [nativePasskeys, setNativePasskeys] = useState<{
    supported: boolean;
    enabled: boolean;
  }>({ supported: false, enabled: false });
  const [nativeAutofillLoading, setNativeAutofillLoading] = useState(false);
  const [nativeAutofillError, setNativeAutofillError] = useState('');

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      Promise.all([getNativeAutofillStatus(), getNativePasskeyStatus()])
        .then(([autofillStatus, passkeyStatus]) => {
          if (mounted) {
            setNativeAutofill(autofillStatus);
            setNativePasskeys(passkeyStatus);
          }
        })
        .catch(() => {});
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      mounted = false;
      window.removeEventListener('focus', refresh);
    };
  }, []);

  useEffect(() => {
    async function check2FA() {
      if (!session) return;
      try {
        const result = await api.twoFactor.status(session.token);
        setIs2FAEnabled(result.enabled);
      } catch {
        setIs2FAEnabled(null);
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
    applyThemePreference(settings.theme);
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

  async function handleOpenAutofillSettings() {
    setNativeAutofillLoading(true);
    setNativeAutofillError('');
    try {
      await openNativeAutofillSettings();
    } catch (error) {
      setNativeAutofillError(
        error instanceof Error ? error.message : 'Could not open Android autofill settings'
      );
    } finally {
      setNativeAutofillLoading(false);
    }
  }

  async function handleOpenPasskeySettings() {
    setNativeAutofillLoading(true);
    setNativeAutofillError('');
    try {
      await openNativePasskeySettings();
    } catch (error) {
      setNativeAutofillError(
        error instanceof Error ? error.message : 'Could not open Android passkey settings'
      );
    } finally {
      setNativeAutofillLoading(false);
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

  async function handleChangeMasterPassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!session || !userKey || !masterKey) {
      setPasswordError('Unlock your vault before changing the master password');
      return;
    }
    if (!currentMasterPassword) {
      setPasswordError('Enter your current master password');
      return;
    }
    if (newMasterPassword.length < 12) {
      setPasswordError('The new master password must contain at least 12 characters');
      return;
    }
    if (newMasterPassword !== confirmMasterPassword) {
      setPasswordError('New master passwords do not match');
      return;
    }
    if (newMasterPassword === currentMasterPassword) {
      setPasswordError('Choose a different master password');
      return;
    }

    setPasswordChanging(true);
    try {
      const newSalt = crypto.getRandomValues(new Uint8Array(16));
      const newMasterKey = await deriveKey(newMasterPassword, newSalt, session.kdfConfig);
      const [currentAuthHash, newEncryptedUserKey, newAuthHash] = await Promise.all([
        makeAuthHash(masterKey, currentMasterPassword),
        encryptUserKey(userKey, newMasterKey),
        makeAuthHash(newMasterKey, newMasterPassword),
      ]);
      const newSaltB64 = toBase64(newSalt);

      await api.auth.changePassword(
        {
          currentAuthHash,
          newAuthHash,
          newEncryptedUserKey,
          newKdfConfig: session.kdfConfig,
          newSalt: newSaltB64,
        },
        session.token
      );

      setSession({
        ...session,
        encryptedUserKey: newEncryptedUserKey,
        salt: newSaltB64,
      });
      setKeys(newMasterKey, userKey);
      setCurrentMasterPassword('');
      setNewMasterPassword('');
      setConfirmMasterPassword('');
      setPasswordSuccess('Master password changed. Other signed-in sessions were revoked.');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change master password');
    } finally {
      setPasswordChanging(false);
    }
  }

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleEnable2FA() {
    if (!session) return;
    setTwoFaLoading(true);
    setTwoFaError('');
    try {
      const data = await api.twoFactor.setup(session.token);
      setTwoFaSetup(data);
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
      const data = await api.twoFactor.verify(verifyCode, session.token);
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
      await api.twoFactor.disable(code, session.token);
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
      const encryptedApiKey = await encryptString(
        aliasApiKey.trim(),
        userKey.slice(0, 32),
        ALIAS_API_KEY_AAD
      );
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
        plainKey = await decryptAliasApiKey(config.encryptedApiKey, userKey);
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
                  <Icon name="circle-check" size={18} />
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
              <div
                style={{
                  borderTop: '1px solid var(--color-border)',
                  paddingTop: 16,
                  marginTop: 4,
                }}
              >
                <h3
                  style={{
                    fontSize: 'var(--font-size-base)',
                    fontWeight: 600,
                    color: 'var(--color-text)',
                    marginBottom: 6,
                  }}
                >
                  Change master password
                </h3>
                <p style={{ ...descStyle, marginBottom: 14 }}>
                  This re-wraps your vault key and revokes every other signed-in session. It does
                  not create a recovery method—if you lose the new password, the vault cannot be
                  recovered.
                </p>
                <form
                  onSubmit={handleChangeMasterPassword}
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  <Input
                    name="currentMasterPassword"
                    type="password"
                    autoComplete="current-password"
                    label="Current master password"
                    value={currentMasterPassword}
                    onChange={(event) => setCurrentMasterPassword(event.target.value)}
                    required
                  />
                  <Input
                    name="newMasterPassword"
                    type="password"
                    autoComplete="new-password"
                    label="New master password"
                    value={newMasterPassword}
                    onChange={(event) => setNewMasterPassword(event.target.value)}
                    minLength={12}
                    required
                  />
                  <Input
                    name="confirmMasterPassword"
                    type="password"
                    autoComplete="new-password"
                    label="Confirm new master password"
                    value={confirmMasterPassword}
                    onChange={(event) => setConfirmMasterPassword(event.target.value)}
                    minLength={12}
                    required
                  />
                  {passwordError && (
                    <p
                      role="alert"
                      style={{
                        margin: 0,
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-error)',
                      }}
                    >
                      {passwordError}
                    </p>
                  )}
                  {passwordSuccess && (
                    <p
                      role="status"
                      style={{
                        margin: 0,
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-success)',
                      }}
                    >
                      {passwordSuccess}
                    </p>
                  )}
                  <Button type="submit" variant="secondary" size="sm" disabled={passwordChanging}>
                    {passwordChanging ? 'Changing password...' : 'Change master password'}
                  </Button>
                </form>
              </div>
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
                {(['system', 'light', 'dark'] as ThemePreference[]).map((t) => (
                  <Button
                    key={t}
                    variant={settings.theme === t ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => update('theme', t)}
                    style={{ flex: 1, textTransform: 'capitalize' }}
                  >
                    <Icon
                      name={t === 'system' ? 'device-desktop' : t === 'light' ? 'sun' : 'moon'}
                      size={17}
                    />
                    {t === 'system' ? 'System' : t === 'light' ? 'Light' : 'Dark'}
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
            <h2
              style={{
                ...sectionHeading,
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Icon name="world" size={19} />
              Travel mode
            </h2>
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
                aria-label={`${travelEnabled ? 'Disable' : 'Enable'} travel mode`}
                aria-pressed={travelEnabled}
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
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-warning)',
                    marginBottom: 12,
                  }}
                >
                  <Icon name="alert-triangle" size={17} style={{ flex: '0 0 auto' }} />
                  <span>
                    Travel mode will hide all non-travel-safe folders and their items from sync.
                    Only safe folders will be accessible.
                  </span>
                </div>
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
                      <span
                        style={{
                          fontSize: 'var(--font-size-sm)',
                          color: 'var(--color-text)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 7,
                        }}
                      >
                        <Icon name="folder" size={16} />
                        {f.name}
                      </span>
                      <Button
                        variant="ghost"
                        onClick={() => handleFolderTravel(f.id, !f.travelSafe)}
                        aria-label={`${f.travelSafe ? 'Exclude' : 'Include'} ${f.name} in travel mode`}
                        aria-pressed={f.travelSafe}
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

          {(nativeAutofill.supported || nativePasskeys.supported) && (
            <Card variant="surface" padding="lg">
              <h2 style={{ ...sectionHeading, marginBottom: 8 }}>Android Autofill & Passkeys</h2>
              <p style={{ ...descStyle, marginBottom: 16 }}>
                Let Android offer your Authwell logins and synced passkeys in apps and browsers.
                Private key material stays encrypted behind strong biometric authentication on this
                device.
              </p>
              <div style={{ display: 'grid', gap: 12 }}>
                {nativeAutofill.supported && (
                  <div>
                    <p
                      role="status"
                      style={{
                        margin: '0 0 8px',
                        fontSize: 'var(--font-size-sm)',
                        color: nativeAutofill.enabled
                          ? 'var(--color-success)'
                          : 'var(--color-text-secondary)',
                      }}
                    >
                      Password autofill: {nativeAutofill.enabled ? 'enabled' : 'not enabled'}
                    </p>
                    <Button
                      type="button"
                      variant={nativeAutofill.enabled ? 'secondary' : 'primary'}
                      size="sm"
                      loading={nativeAutofillLoading}
                      onClick={handleOpenAutofillSettings}
                    >
                      {nativeAutofill.enabled ? 'Open autofill settings' : 'Enable autofill'}
                    </Button>
                  </div>
                )}
                {nativePasskeys.supported && (
                  <div>
                    <p
                      role="status"
                      style={{
                        margin: '0 0 8px',
                        fontSize: 'var(--font-size-sm)',
                        color: nativePasskeys.enabled
                          ? 'var(--color-success)'
                          : 'var(--color-text-secondary)',
                      }}
                    >
                      Passkey provider: {nativePasskeys.enabled ? 'enabled' : 'not enabled'}
                    </p>
                    <Button
                      type="button"
                      variant={nativePasskeys.enabled ? 'secondary' : 'primary'}
                      size="sm"
                      loading={nativeAutofillLoading}
                      onClick={handleOpenPasskeySettings}
                    >
                      {nativePasskeys.enabled ? 'Open passkey settings' : 'Enable passkeys'}
                    </Button>
                  </div>
                )}
              </div>
              {nativeAutofillError && (
                <p
                  role="alert"
                  style={{
                    margin: '12px 0 0',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-error)',
                  }}
                >
                  {nativeAutofillError}
                </p>
              )}
            </Card>
          )}

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
              <p style={{ margin: 0 }}>Authwell v1.0.0 · Self-hosted password manager</p>
              <p style={{ margin: 0 }}>Zero-knowledge E2E encryption · Cloudflare Workers</p>
              <p style={{ margin: 0 }}>AES-256-GCM · Argon2id · HKDF-SHA-256</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
