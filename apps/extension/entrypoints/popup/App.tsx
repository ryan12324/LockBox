/**
 * Lockbox extension popup.
 * Compact 360x480px UI with locked/unlocked states.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { generatePassword, generatePassphrase, evaluateStrength } from '@lockbox/generator';
import { totp as generateTOTP, getRemainingSeconds } from '@lockbox/totp';
import type { VaultItem, LoginItem } from '@lockbox/types';
import { getApiBaseUrl, setApiBaseUrl } from '../../lib/storage.js';

type Tab = 'site' | 'vault' | 'generator' | 'totp';

/** Send a message to the background service worker. */
async function sendMessage<T>(message: object): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

// ─── Setup Screen ──────────────────────────────────────────────────────────

function SetupView({ onComplete }: { onComplete: () => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const trimmed = url.trim().replace(/\/+$/, '');
    if (!trimmed) {
      setError('Please enter your vault URL');
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      setError('Invalid URL. Example: https://lockbox-api.you.workers.dev');
      return;
    }

    if (parsed.protocol !== 'https:') {
      setError('URL must use HTTPS');
      return;
    }

    setSaving(true);
    try {
      await setApiBaseUrl(parsed.origin);
      onComplete();
    } catch {
      setError('Failed to save URL');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔐</div>
        <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>Lockbox</h1>
        <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>Connect to your server</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: '#dc2626' }}>
            {error}
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>Vault URL</label>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://lockbox-api.you.workers.dev"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
          />
          <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
            The URL of your self-hosted Lockbox vault
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{ padding: '10px', background: saving ? '#94a3b8' : '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
        >
          {saving ? 'Saving...' : 'Continue'}
        </button>
      </form>
    </div>
  );
}

// ─── Locked State ─────────────────────────────────────────────────────────────

function LockedView({ onUnlock }: { onUnlock: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await sendMessage<{ success: boolean; error?: string }>({
        type: 'unlock',
        email,
        password,
      });
      if (result.success) {
        onUnlock();
      } else {
        setError(result.error ?? 'Invalid credentials');
      }
    } catch {
      setError('Failed to connect to background service');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔐</div>
        <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>Lockbox</h1>
        <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>Sign in to your vault</p>
      </div>

      <form onSubmit={handleUnlock} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: '#dc2626' }}>
            {error}
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>Master Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Master password"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{ padding: '10px', background: loading ? '#94a3b8' : '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Unlocking...' : 'Unlock Vault'}
        </button>
      </form>
    </div>
  );
}

// ─── Vault Tab ────────────────────────────────────────────────────────────────

function VaultTab({ items }: { items: VaultItem[] }) {
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.type === 'login' && (i as LoginItem).username?.toLowerCase().includes(search.toLowerCase()))
  );

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>
        <input
          type="text"
          placeholder="Search vault..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px', outline: 'none' }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            {search ? 'No matching items' : 'No items in vault'}
          </div>
        ) : (
          filtered.map((item) => (
            <div key={item.id} style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#1e293b' }}>{item.name}</div>
                  {item.type === 'login' && (
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {(item as LoginItem).username}
                    </div>
                  )}
                </div>
                {item.type === 'login' && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => copyToClipboard((item as LoginItem).username, `u-${item.id}`)}
                      title="Copy username"
                      style={{ padding: '3px 6px', fontSize: '10px', border: '1px solid #e2e8f0', borderRadius: '4px', background: copied === `u-${item.id}` ? '#dcfce7' : 'white', cursor: 'pointer' }}
                    >
                      {copied === `u-${item.id}` ? '✓' : '👤'}
                    </button>
                    <button
                      onClick={() => copyToClipboard((item as LoginItem).password, `p-${item.id}`)}
                      title="Copy password"
                      style={{ padding: '3px 6px', fontSize: '10px', border: '1px solid #e2e8f0', borderRadius: '4px', background: copied === `p-${item.id}` ? '#dcfce7' : 'white', cursor: 'pointer' }}
                    >
                      {copied === `p-${item.id}` ? '✓' : '🔑'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Current Site Tab ─────────────────────────────────────────────────────────

function SiteTab({ items }: { items: VaultItem[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔍</div>
        No saved passwords for this site
      </div>
    );
  }

  return (
    <div style={{ overflowY: 'auto' }}>
      {items.map((item) => (
        <div key={item.id} style={{ padding: '12px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginBottom: '6px' }}>{item.name}</div>
          {item.type === 'login' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>{(item as LoginItem).username}</span>
                <button
                  onClick={() => copyToClipboard((item as LoginItem).username, `u-${item.id}`)}
                  style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid #e2e8f0', borderRadius: '4px', background: copied === `u-${item.id}` ? '#dcfce7' : 'white', cursor: 'pointer' }}
                >
                  {copied === `u-${item.id}` ? '✓ Copied' : 'Copy User'}
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>••••••••</span>
                <button
                  onClick={() => copyToClipboard((item as LoginItem).password, `p-${item.id}`)}
                  style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid #e2e8f0', borderRadius: '4px', background: copied === `p-${item.id}` ? '#dcfce7' : 'white', cursor: 'pointer' }}
                >
                  {copied === `p-${item.id}` ? '✓ Copied' : 'Copy Pass'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Generator Tab ────────────────────────────────────────────────────────────

function GeneratorTab() {
  const [mode, setMode] = useState<'password' | 'passphrase'>('password');
  const [length, setLength] = useState(20);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [wordCount, setWordCount] = useState(5);
  const [generated, setGenerated] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = useCallback(() => {
    if (mode === 'password') {
      setGenerated(generatePassword({ length, uppercase, lowercase, digits, symbols }));
    } else {
      setGenerated(generatePassphrase({ wordCount, separator: '-', capitalize: true }));
    }
  }, [mode, length, uppercase, lowercase, digits, symbols, wordCount]);

  useEffect(() => { generate(); }, [generate]);

  const strength = generated ? evaluateStrength(generated) : null;
  const strengthColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];

  async function copy() {
    await navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', gap: '4px' }}>
        {(['password', 'passphrase'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{ flex: 1, padding: '6px', fontSize: '12px', border: '1px solid #e2e8f0', borderRadius: '6px', background: mode === m ? '#4f46e5' : 'white', color: mode === m ? 'white' : '#374151', cursor: 'pointer', fontWeight: mode === m ? 600 : 400 }}
          >
            {m === 'password' ? 'Password' : 'Passphrase'}
          </button>
        ))}
      </div>

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', fontFamily: 'monospace', fontSize: '13px', wordBreak: 'break-all', minHeight: '40px', color: '#1e293b' }}>
        {generated}
      </div>

      {strength && (
        <div>
          <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(strength.score + 1) * 20}%`, background: strengthColors[strength.score], transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
            Entropy: {strength.entropy.toFixed(0)} bits
          </div>
        </div>
      )}

      {mode === 'password' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', color: '#374151' }}>Length: {length}</label>
            <input type="range" min={8} max={64} value={length} onChange={(e) => setLength(Number(e.target.value))} style={{ width: '120px' }} />
          </div>
          {[
            { label: 'A-Z', value: uppercase, set: setUppercase },
            { label: 'a-z', value: lowercase, set: setLowercase },
            { label: '0-9', value: digits, set: setDigits },
            { label: '!@#', value: symbols, set: setSymbols },
          ].map(({ label, value, set }) => (
            <label key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
              {label}
              <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} />
            </label>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', color: '#374151' }}>Words: {wordCount}</label>
          <input type="range" min={3} max={10} value={wordCount} onChange={(e) => setWordCount(Number(e.target.value))} style={{ width: '120px' }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={generate} style={{ flex: 1, padding: '8px', fontSize: '12px', border: '1px solid #e2e8f0', borderRadius: '6px', background: 'white', cursor: 'pointer' }}>
          ↻ Regenerate
        </button>
        <button onClick={copy} style={{ flex: 1, padding: '8px', fontSize: '12px', border: 'none', borderRadius: '6px', background: copied ? '#22c55e' : '#4f46e5', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// ─── TOTP Tab ─────────────────────────────────────────────────────────────────

function TotpItem({ item }: { item: LoginItem }) {
  const [code, setCode] = useState('------');
  const [remaining, setRemaining] = useState(30);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!item.totp) return;

    async function refresh() {
      const result = await sendMessage<{ code: string | null }>({
        type: 'get-totp',
        secret: item.totp,
      });
      if (result.code) setCode(result.code);
      setRemaining(getRemainingSeconds());
    }

    refresh();
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, [item.totp]);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: '12px', fontWeight: 500, color: '#1e293b' }}>{item.name}</div>
        <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'monospace', color: '#4f46e5', letterSpacing: '0.1em', marginTop: '2px' }}>
          {code.slice(0, 3)} {code.slice(3)}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        <div style={{ fontSize: '11px', color: remaining <= 5 ? '#ef4444' : '#64748b' }}>{remaining}s</div>
        <button
          onClick={copy}
          style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid #e2e8f0', borderRadius: '4px', background: copied ? '#dcfce7' : 'white', cursor: 'pointer' }}
        >
          {copied ? '✓' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function TotpTab({ items }: { items: VaultItem[] }) {
  const totpItems = items.filter((i): i is LoginItem => i.type === 'login' && Boolean((i as LoginItem).totp));

  if (totpItems.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔑</div>
        No TOTP codes configured
      </div>
    );
  }

  return (
    <div style={{ overflowY: 'auto' }}>
      {totpItems.map((item) => <TotpItem key={item.id} item={item} />)}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('site');
  const [allItems, setAllItems] = useState<VaultItem[]>([]);
  const [siteItems, setSiteItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if API URL is configured, then check unlock state
    getApiBaseUrl().then((url) => {
      if (!url) {
        setApiConfigured(false);
        setLoading(false);
        return;
      }
      setApiConfigured(true);
      return sendMessage<{ unlocked: boolean }>({ type: 'is-unlocked' })
        .then(({ unlocked: isUnlocked }) => setUnlocked(isUnlocked))
        .finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!unlocked) return;

    // Load vault items
    sendMessage<{ items: VaultItem[] }>({ type: 'get-vault' })
      .then(({ items }) => setAllItems(items))
      .catch(console.error);

    // Get current tab URL and find matching items
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url;
      if (url) {
        sendMessage<{ items: VaultItem[] }>({ type: 'get-matches', url })
          .then(({ items }) => setSiteItems(items))
          .catch(console.error);
      }
    });
  }, [unlocked]);

  async function handleLock() {
    await sendMessage({ type: 'lock' });
    setUnlocked(false);
    setAllItems([]);
    setSiteItems([]);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#94a3b8', fontSize: '13px' }}>
        Loading...
      </div>
    );
  }

  if (!apiConfigured) {
    return <SetupView onComplete={() => setApiConfigured(true)} />;
  }

  if (!unlocked) {
    return <LockedView onUnlock={() => setUnlocked(true)} />;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'site', label: '🌐 Site' },
    { id: 'vault', label: '🔒 Vault' },
    { id: 'generator', label: '⚡ Gen' },
    { id: 'totp', label: '🔑 TOTP' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '480px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #e2e8f0', background: '#4f46e5' }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'white' }}>🔐 Lockbox</span>
        <button
          onClick={handleLock}
          title="Lock vault"
          style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '4px', padding: '4px 8px', color: 'white', fontSize: '12px', cursor: 'pointer' }}
        >
          Lock
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{ flex: 1, padding: '8px 4px', fontSize: '11px', border: 'none', borderBottom: activeTab === tab.id ? '2px solid #4f46e5' : '2px solid transparent', background: 'white', color: activeTab === tab.id ? '#4f46e5' : '#64748b', cursor: 'pointer', fontWeight: activeTab === tab.id ? 600 : 400 }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'site' && <SiteTab items={siteItems} />}
        {activeTab === 'vault' && <VaultTab items={allItems} />}
        {activeTab === 'generator' && <GeneratorTab />}
        {activeTab === 'totp' && <TotpTab items={allItems} />}
      </div>
    </div>
  );
}
