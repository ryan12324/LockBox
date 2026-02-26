import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';

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

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="text-white/40 hover:text-white/70">
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
        </div>

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
