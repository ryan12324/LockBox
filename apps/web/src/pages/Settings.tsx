import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { QRCodeSVG } from 'qrcode.react';

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

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>
        <div className="space-y-6">
          {/* Account */}
          <section className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Account</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/50">Email</span>
                <span className="text-sm font-medium text-white">{session?.email}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/50">KDF Algorithm</span>
                <span className="text-sm font-medium text-white">
                  {session?.kdfConfig.type === 'argon2id' ? 'Argon2id' : 'PBKDF2'}
                </span>
              </div>
              {session?.kdfConfig.type === 'argon2id' && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/50">Argon2id Memory</span>
                  <span className="text-sm font-medium text-white">
                    {((session.kdfConfig.memory ?? 65536) / 1024).toFixed(0)} MiB
                  </span>
                </div>
              )}
              <button
                onClick={() => navigate('/settings/import-export')}
                className="w-full mt-2 py-2 text-sm text-indigo-300 hover:text-indigo-200 hover:underline text-left"
              >
                Import / Export →
              </button>
            </div>
          </section>

          {/* Two-Factor Authentication */}
          <section className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Two-Factor Authentication</h2>
            
            {is2FAEnabled === null ? (
              <p className="text-sm text-white/50">Checking status...</p>
            ) : is2FAEnabled ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-400 bg-green-500/10 px-3 py-2 rounded border border-green-500/20">
                  <span>✅</span>
                  <span className="text-sm font-medium">Two-Factor Authentication: Enabled</span>
                </div>
                {backupCodes && (
                  <div className="bg-white/[0.05] p-4 rounded-lg border border-white/[0.1]">
                    <h3 className="text-sm font-medium text-white mb-2">Your Backup Codes</h3>
                    <p className="text-xs text-white/50 mb-3">
                      Save these codes in a safe place. You can use them to sign in if you lose access to your authenticator app.
                    </p>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {backupCodes.map((c) => (
                        <code key={c} className="text-xs font-mono bg-black/30 px-2 py-1 rounded text-center text-white/80">{c}</code>
                      ))}
                    </div>
                    <button onClick={copyBackupCodes} className="w-full py-1.5 text-xs bg-indigo-600/80 hover:bg-indigo-500/90 text-white rounded">
                      Copy All
                    </button>
                  </div>
                )}
                <button
                  onClick={handleDisable2FA}
                  disabled={twoFaLoading}
                  className="px-4 py-2 text-sm bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded transition-colors disabled:opacity-50"
                >
                  Disable 2FA
                </button>
                {twoFaError && <p className="text-sm text-red-400 mt-2">{twoFaError}</p>}
              </div>
            ) : twoFaSetup ? (
              <div className="space-y-4">
                <p className="text-sm text-white/70">
                  Scan this QR code with your authenticator app (e.g. Google Authenticator, Authy, FreeOTP):
                </p>
                <div className="bg-white p-4 rounded-lg inline-block">
                  <QRCodeSVG value={twoFaSetup.otpauthUri} size={150} />
                </div>
                <p className="text-xs text-white/50 break-all font-mono">
                  Manual entry key: {twoFaSetup.secret}
                </p>
                
                <form onSubmit={handleVerify2FA} className="mt-4">
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    Enter 6-digit verification code
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      pattern="[0-9]{6}"
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value)}
                      className="flex-1 px-3 py-2 border border-white/[0.12] rounded bg-white/[0.06] text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                      placeholder="000000"
                    />
                    <button
                      type="submit"
                      disabled={twoFaLoading || verifyCode.length !== 6}
                      className="px-4 py-2 bg-indigo-600/80 hover:bg-indigo-500/90 disabled:opacity-40 text-white rounded transition-colors"
                    >
                      Verify
                    </button>
                  </div>
                  {twoFaError && <p className="text-sm text-red-400 mt-2">{twoFaError}</p>}
                </form>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-white/50">
                  Add an extra layer of security to your account by requiring a code from your authenticator app when you sign in.
                </p>
                <button
                  onClick={handleEnable2FA}
                  disabled={twoFaLoading}
                  className="px-4 py-2 text-sm bg-indigo-600/80 hover:bg-indigo-500/90 text-white rounded transition-colors disabled:opacity-50"
                >
                  Enable 2FA
                </button>
                {twoFaError && <p className="text-sm text-red-400 mt-2">{twoFaError}</p>}
              </div>
            )}
          </section>

          {/* AI & Intelligence */}
          <section className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6">
            <h2 className="text-lg font-semibold text-white mb-4">AI & Intelligence</h2>
            <p className="text-sm text-white/50 mb-3">
              Configure AI-powered features: password health, breach monitoring, smart autofill, and chat assistant.
            </p>
            <button
              onClick={() => navigate('/settings/ai')}
              className="w-full py-2 text-sm text-indigo-300 hover:text-indigo-200 hover:underline text-left"
            >
              Configure AI Features →
            </button>
          </section>

          {/* Security */}
          <section className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Security</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Auto-lock timeout
                </label>
                <select
                  value={settings.autoLockMinutes}
                  onChange={(e) => update('autoLockMinutes', Number(e.target.value) as AutoLockMinutes)}
                  className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                >
                  <option value={1}>1 minute</option>
                  <option value={5}>5 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Clipboard clear time
                </label>
                <select
                  value={settings.clipboardSeconds}
                  onChange={(e) => update('clipboardSeconds', Number(e.target.value) as ClipboardSeconds)}
                  className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                >
                  <option value={10}>10 seconds</option>
                  <option value={20}>20 seconds</option>
                  <option value={30}>30 seconds</option>
                  <option value={60}>60 seconds</option>
                </select>
              </div>
            </div>
          </section>

          {/* Appearance */}
          <section className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Appearance</h2>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Theme
              </label>
              <div className="flex gap-3">
                {(['system', 'light', 'dark'] as Theme[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => update('theme', t)}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors capitalize ${
                      settings.theme === t
                        ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-300'
                        : 'border-white/[0.12] text-white/60 hover:border-white/[0.2]'
                    }`}
                  >
                    {t === 'system' ? '🖥️ System' : t === 'light' ? '☀️ Light' : '🌙 Dark'}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* About */}
          <section className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6">
            <h2 className="text-lg font-semibold text-white mb-4">About</h2>
            <div className="space-y-2 text-sm text-white/40">
              <p>Lockbox v0.0.1 — Self-Hosted Password Manager</p>
              <p>Zero-knowledge E2E encryption · Cloudflare Workers</p>
              <p>AES-256-GCM · Argon2id · HKDF-SHA-256</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
