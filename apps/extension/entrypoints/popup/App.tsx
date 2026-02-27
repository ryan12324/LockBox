/**
 * Lockbox extension popup.
 * Compact 360x480px UI with locked/unlocked states.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { generatePassword, generatePassphrase, evaluateStrength, detectPasswordRules, generateCompliant } from '@lockbox/generator';
import { totp as generateTOTP, getRemainingSeconds } from '@lockbox/totp';
import type {
  VaultItem,
  LoginItem,
  SecureNoteItem,
  CardItem,
  IdentityItem,
  PasskeyItem,
  DocumentItem,
  CustomField,
  Folder,
  VaultItemType,
} from '@lockbox/types';
import { getApiBaseUrl, setApiBaseUrl } from '../../lib/storage.js';
import { loadFeatureFlags, saveFeatureFlags, getProviderConfig, setProviderConfig, testProviderConnection, SecurityCopilot, LifecycleTracker } from '@lockbox/ai';
import type { SearchResult, SecurityAlert } from '@lockbox/ai';
import type { PasswordRules, PasswordFieldMetadata } from '@lockbox/generator';
import type { VaultHealthSummary, PasswordHealthReport, AIFeatureFlags, AIProviderConfig, AIProvider, RotationSchedule } from '@lockbox/types';
type Tab = 'site' | 'vault' | 'shared' | 'generator' | 'totp';

type ViewState =
  | { view: 'tabs' }
  | { view: 'detail'; item: VaultItem }
  | { view: 'add' }
  | { view: 'edit'; item: VaultItem }
  | { view: 'health'; filterBreached?: boolean }
  | { view: 'ai-settings' }
  | { view: 'chat' }
  | { view: 'hw-keys' }
  | { view: 'qr-sync' }
  | { view: 'trash' }
  | { view: 'settings' }
  | { view: 'emergency' }
  | { view: 'history'; item: VaultItem };
async function sendMessage<T>(message: object): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

const typeIcon = (type: string) => ({ login: '🔑', note: '📝', card: '💳', identity: '📛', passkey: '🔑', document: '📄' })[type] ?? '📄';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    <div className="p-6 flex flex-col gap-4">
      <div className="text-center">
        <div className="text-[32px] mb-2">🔐</div>
        <h1 className="text-lg font-bold text-white">Lockbox</h1>
        <p className="text-sm text-white/50 mt-1">
          Connect to your server
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3"
      >
        {error && (
          <div className="px-3 py-2 bg-red-500/10 border border-red-400/20 rounded-md text-red-300 text-xs">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-white/80 mb-1">
            Vault URL
          </label>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://lockbox-api.you.workers.dev"
            className="w-full px-3 py-2 border border-white/[0.12] rounded-md bg-white/[0.06] text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
          />
          <p className="text-xs text-white/40 mt-1">
            The URL of your self-hosted Lockbox vault
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className={`px-3 py-2 text-white text-sm font-medium rounded-md backdrop-blur-sm transition-colors ${saving ? 'bg-white/40 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500/90'}`}
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

  // Load saved email on mount
  useEffect(() => {
    chrome.storage.local.get('email').then((result) => {
      if (result.email) setEmail(result.email as string);
    });
  }, []);

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
    <div className="p-6 flex flex-col gap-4">
      <div className="text-center">
        <div className="text-[32px] mb-2">🔐</div>
        <h1 className="text-lg font-bold text-white">Lockbox</h1>
        <p className="text-sm text-white/50 mt-1">
          Sign in to your vault
        </p>
      </div>

      <form
        onSubmit={handleUnlock}
        className="flex flex-col gap-3"
      >
        {error && (
          <div className="px-3 py-2 bg-red-500/10 border border-red-400/20 rounded-md text-red-300 text-xs">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-white/80 mb-1">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3 py-2 border border-white/[0.12] rounded-md bg-white/[0.06] text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-white/80 mb-1">
            Master Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Master password"
            className="w-full px-3 py-2 border border-white/[0.12] rounded-md bg-white/[0.06] text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`px-3 py-2 text-white text-sm font-medium rounded-md backdrop-blur-sm transition-colors ${loading ? 'bg-white/40 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500/90'}`}
        >
          {loading ? 'Unlocking...' : 'Unlock Vault'}
        </button>
      </form>

      <div className="text-center">
        <div className="text-xs text-white/30 my-1">or</div>
        <button
          type="button"
          onClick={() => {
            sendMessage<{ success: boolean }>({ type: 'hw-key-unlock' })
              .then((res) => { if (res.success) onUnlock(); })
              .catch(() => {});
          }}
          className="px-3 py-2 w-full text-white/70 text-sm font-medium rounded-md border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] transition-colors cursor-pointer"
        >
          🔑 Unlock with Hardware Key
        </button>
      </div>
    </div>
  );
}

// ─── Item Detail View ────────────────────────────────────────────────────────

function ItemDetailView({
  item,
  folders,
  onEdit,
  onDelete,
  onBack,
  onHistory,
}: {
  item: VaultItem;
  folders: Folder[];
  onEdit: () => void;
  onDelete: () => void;
  onBack: () => void;
  onHistory: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
  const [showCardNumber, setShowCardNumber] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [totpRemaining, setTotpRemaining] = useState(0);
  const [attachments, setAttachments] = useState<Array<{ id: string; fileName: string; fileSize: number; mimeType: string; createdAt: string }>>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<Array<{ id: string; revisionDate: string; createdAt: string; data: VaultItem | null }>>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);

  const login = item.type === 'login' ? (item as LoginItem) : null;
  const note = item.type === 'note' ? (item as SecureNoteItem) : null;
  const card = item.type === 'card' ? (item as CardItem) : null;
  const identity = item.type === 'identity' ? (item as IdentityItem) : null;
  const passkey = item.type === 'passkey' ? (item as PasskeyItem) : null;
  const doc = item.type === 'document' ? (item as DocumentItem) : null;
  const [showSsn, setShowSsn] = useState(false);
  const [showPassport, setShowPassport] = useState(false);
  const [showLicense, setShowLicense] = useState(false);
  const [showCustomHidden, setShowCustomHidden] = useState<Record<number, boolean>>({});
  const folder = folders.find((f) => f.id === item.folderId);

  async function copyField(text: string, field: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  }

  useEffect(() => {
    if (!login?.totp) return;
    let intervalId: ReturnType<typeof setInterval>;

    async function refresh() {
      const result = await sendMessage<{ code: string | null }>({
        type: 'get-totp',
        secret: login!.totp,
      });
      if (result.code) setTotpCode(result.code);
      setTotpRemaining(getRemainingSeconds());
    }

    refresh();
    intervalId = setInterval(refresh, 1000);
    return () => clearInterval(intervalId);
  }, [login?.totp]);

  // Load attachments for this item
  useEffect(() => {
    sendMessage<{ success: boolean; attachments?: Array<{ id: string; fileName: string; fileSize: number; mimeType: string; createdAt: string }> }>({
      type: 'get-attachments',
      itemId: item.id,
    })
      .then(res => {
        if (res.success && res.attachments) setAttachments(res.attachments);
      })
      .catch(() => {});
  }, [item.id]);

  async function handleDownloadAttachment(attachmentId: string, fileName: string) {
    setDownloadingId(attachmentId);
    try {
      const res = await sendMessage<{ success: boolean; encryptedData?: string }>({
        type: 'download-attachment',
        itemId: item.id,
        attachmentId,
      });
      if (res.success && res.encryptedData) {
        // Trigger browser download
        const blob = new Blob([Uint8Array.from(atob(res.encryptedData), c => c.charCodeAt(0))]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // ignore
    } finally {
      setDownloadingId(null);
    }
  }


  async function handleDelete() {
    setDeleting(true);
    try {
      const result = await sendMessage<{ success: boolean }>({ type: 'delete-item', id: item.id });
      if (result.success) onDelete();
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  }

  const fieldRow = (
    label: string,
    value: string,
    fieldId: string,
    opts?: { hidden?: boolean; toggle?: () => void; shown?: boolean }
  ) => (
    <div className="mb-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-white/30 px-3 mb-1">
        {label}
      </div>
      <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-md border border-white/[0.06]">
        <span className={`text-xs ${opts?.hidden && !opts?.shown ? '' : 'font-mono'} text-white truncate max-w-[220px]`}>
          {opts?.hidden && !opts?.shown ? '••••••••••••' : value}
        </span>
        <div className="flex gap-1 shrink-0">
          {opts?.toggle && (
            <button
              onClick={opts.toggle}
              className="p-1.5 text-white/30 hover:text-white/60 rounded transition-colors cursor-pointer"
            >
              {opts?.shown ? '🙈' : '👁️'}
            </button>
          )}
          <button
            onClick={() => copyField(value, fieldId)}
            className="p-1.5 text-white/30 hover:text-white/60 rounded transition-colors cursor-pointer"
          >
            {copied === fieldId ? '✓' : '📋'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.1]">
        <button
          onClick={onBack}
          className="border-0 bg-transparent cursor-pointer text-sm p-1.5 text-white/50 hover:text-white/80 transition-colors"
        >
          ←
        </button>
        <span className="text-lg">{typeIcon(item.type)}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">
            {item.name}
          </div>
          {folder && <div className="text-xs text-white/40">📁 {folder.name}</div>}
        </div>
        <div className="flex gap-1">
          <button
            onClick={onHistory}
            title="Version History"
            className="px-2 py-1.5 bg-white/[0.08] hover:bg-white/[0.14] text-white/70 text-sm rounded-md transition-colors cursor-pointer"
          >
            📜
          </button>
          <button
            onClick={onEdit}
            className="px-3 py-1.5 bg-white/[0.08] hover:bg-white/[0.14] text-white/70 text-sm rounded-md transition-colors cursor-pointer"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {item.favorite && (
          <div className="text-xs text-amber-400 mb-2">⭐ Favorite</div>
        )}

        {/* Login fields */}
        {login && (
          <>
            {login.username && fieldRow('Username', login.username, 'user')}
            {login.password &&
              fieldRow('Password', login.password, 'pass', {
                hidden: true,
                toggle: () => setShowPassword(!showPassword),
                shown: showPassword,
              })}
            {login.totp && totpCode && (
              <div className="mb-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-white/30 px-3 mb-1">
                  TOTP Code
                </div>
                <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-md border border-white/[0.06]">
                  <span className="font-mono text-[18px] tracking-widest text-indigo-300 font-bold">
                    {totpCode.slice(0, 3)} {totpCode.slice(3)}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className={`text-xs ${totpRemaining <= 5 ? 'text-red-400' : 'text-white/30'}`}>
                      {totpRemaining}s
                    </span>
                    <button
                      onClick={() => copyField(totpCode, 'totp')}
                      className="p-1.5 text-white/30 hover:text-white/60 rounded transition-colors cursor-pointer"
                    >
                      {copied === 'totp' ? '✓' : '📋'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {login.uris
              ?.filter((u) => u.trim())
              .map((uri, idx) => (
                <div key={idx} className="mb-1">
                  {idx === 0 && (
                    <div className="text-xs font-semibold uppercase tracking-wide text-white/30 px-3 mb-1">
                      URIs
                    </div>
                  )}
                  <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-md border border-white/[0.06]">
                    <a
                      href={uri.startsWith('http') ? uri : `https://${uri}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-indigo-300 no-underline truncate max-w-[250px]"
                    >
                      {uri}
                    </a>
                    <button
                      onClick={() => copyField(uri, `uri-${idx}`)}
                      className="p-1.5 text-white/30 hover:text-white/60 rounded transition-colors shrink-0 cursor-pointer"
                    >
                      {copied === `uri-${idx}` ? '✓' : '📋'}
                    </button>
                  </div>
                </div>
              ))}
          </>
        )}

        {/* Note field */}
        {note && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-white/30 px-3 mb-1">
              Note
            </div>
            <div className="p-3 bg-white/[0.04] rounded-md border border-white/[0.06] text-xs text-white/80 whitespace-pre-wrap max-h-[200px] overflow-y-auto">
              {note.content}
            </div>
          </div>
        )}

        {/* Card fields */}
        {card && (
          <>
            {card.cardholderName && fieldRow('Cardholder', card.cardholderName, 'holder')}
            {card.number &&
              fieldRow('Card Number', card.number, 'cardnum', {
                hidden: true,
                toggle: () => setShowCardNumber(!showCardNumber),
                shown: showCardNumber,
              })}
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-white/30 px-3 mb-1">
                  Expires
                </div>
                <div className="p-3 bg-white/[0.04] rounded-md border border-white/[0.06] text-xs text-white/80">
                  {card.expMonth}/{card.expYear}
                </div>
              </div>
              {card.cvv && (
                <div className="flex-1">
                  {fieldRow('CVV', card.cvv, 'cvv', {
                    hidden: true,
                    toggle: () => setShowCvv(!showCvv),
                    shown: showCvv,
                  })}
                </div>
              )}
            </div>
            {card.brand && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-white/30 px-3 mb-1">
                  Brand
                </div>
                <div className="p-3 bg-white/[0.04] rounded-md border border-white/[0.06] text-xs text-white/80">
                  {card.brand}
                </div>
              </div>
            )}
          </>
        )}

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/30 px-3 mb-1">
              Attachments ({attachments.length})
            </div>
            <div className="flex flex-col gap-1">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center justify-between p-3 bg-white/[0.04] rounded-md border border-white/[0.06]">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-white truncate">{att.fileName}</div>
                    <div className="text-[10px] text-white/40">{formatFileSize(att.fileSize)}</div>
                  </div>
                  <button
                    onClick={() => handleDownloadAttachment(att.id, att.fileName)}
                    disabled={downloadingId === att.id}
                    className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer shrink-0 ml-2 ${downloadingId === att.id ? 'bg-white/20 text-white/50 cursor-not-allowed' : 'bg-white/[0.08] text-white/70 hover:bg-white/[0.14]'}`}
                  >
                    {downloadingId === att.id ? '...' : '⬇️'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Identity fields */}
        {identity && (
          <>
            {/* Personal */}
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/20 px-3 mt-2 mb-1">Personal</div>
            {identity.firstName && fieldRow('First Name', identity.firstName, 'id-first')}
            {identity.middleName && fieldRow('Middle Name', identity.middleName, 'id-middle')}
            {identity.lastName && fieldRow('Last Name', identity.lastName, 'id-last')}
            {identity.email && fieldRow('Email', identity.email, 'id-email')}
            {identity.phone && fieldRow('Phone', identity.phone, 'id-phone')}
            {identity.company && fieldRow('Company', identity.company, 'id-company')}

            {/* Address */}
            {(identity.address1 || identity.city || identity.state || identity.postalCode || identity.country) && (
              <>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/20 px-3 mt-3 mb-1">Address</div>
                {identity.address1 && fieldRow('Address 1', identity.address1, 'id-addr1')}
                {identity.address2 && fieldRow('Address 2', identity.address2, 'id-addr2')}
                {identity.city && fieldRow('City', identity.city, 'id-city')}
                {identity.state && fieldRow('State', identity.state, 'id-state')}
                {identity.postalCode && fieldRow('Postal Code', identity.postalCode, 'id-zip')}
                {identity.country && fieldRow('Country', identity.country, 'id-country')}
              </>
            )}

            {/* IDs */}
            {(identity.ssn || identity.passportNumber || identity.licenseNumber) && (
              <>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/20 px-3 mt-3 mb-1">Identification</div>
                {identity.ssn && fieldRow('SSN', identity.ssn, 'id-ssn', {
                  hidden: true,
                  toggle: () => setShowSsn(!showSsn),
                  shown: showSsn,
                })}
                {identity.passportNumber && fieldRow('Passport', identity.passportNumber, 'id-passport', {
                  hidden: true,
                  toggle: () => setShowPassport(!showPassport),
                  shown: showPassport,
                })}
                {identity.licenseNumber && fieldRow('License', identity.licenseNumber, 'id-license', {
                  hidden: true,
                  toggle: () => setShowLicense(!showLicense),
                  shown: showLicense,
                })}
              </>
            )}
          </>
        )}

        {/* Passkey fields */}
        {passkey && (
          <>
            {fieldRow('Relying Party', passkey.rpName, 'pk-rp')}
            {fieldRow('RP ID', passkey.rpId, 'pk-rpid')}
            {fieldRow('User', passkey.userName, 'pk-user')}
          </>
        )}

        {/* Document fields */}
        {doc && (
          <>
            {doc.description && fieldRow('Description', doc.description, 'doc-desc')}
            {doc.mimeType && fieldRow('Type', doc.mimeType, 'doc-mime')}
            {doc.size != null && (
              <div className="mb-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-white/30 px-3 mb-1">Size</div>
                <div className="p-3 bg-white/[0.04] rounded-md border border-white/[0.06] text-xs text-white/80">
                  {formatFileSize(doc.size)}
                </div>
              </div>
            )}
          </>
        )}

        {/* Custom fields */}
        {item.customFields && item.customFields.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/30 px-3 mb-1">
              Custom Fields ({item.customFields.length})
            </div>
            <div className="flex flex-col gap-1">
              {item.customFields.map((cf, idx) => (
                <div key={idx} className="mb-1">
                  {cf.type === 'boolean' ? (
                    <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-md border border-white/[0.06]">
                      <span className="text-xs text-white/60">{cf.name}</span>
                      <span className="text-xs text-white">{cf.value === 'true' ? '✓ Yes' : '✗ No'}</span>
                    </div>
                  ) : cf.type === 'hidden' ? (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-white/30 px-3 mb-1">{cf.name}</div>
                      <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-md border border-white/[0.06]">
                        <span className="text-xs font-mono text-white truncate max-w-[220px]">
                          {showCustomHidden[idx] ? cf.value : '••••••••••••'}
                        </span>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => setShowCustomHidden((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                            className="p-1.5 text-white/30 hover:text-white/60 rounded transition-colors cursor-pointer"
                          >
                            {showCustomHidden[idx] ? '🙈' : '👁️'}
                          </button>
                          <button
                            onClick={() => copyField(cf.value, `cf-${idx}`)}
                            className="p-1.5 text-white/30 hover:text-white/60 rounded transition-colors cursor-pointer"
                          >
                            {copied === `cf-${idx}` ? '✓' : '📋'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    fieldRow(cf.name, cf.value, `cf-${idx}`)
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Version History (collapsible) */}
        <div className="mt-3">
          <button
            onClick={() => {
              setShowVersions(!showVersions);
              if (!showVersions && versions.length === 0) {
                setVersionsLoading(true);
                sendMessage<{ success: boolean; versions?: typeof versions }>({ type: 'get-versions', itemId: item.id })
                  .then(res => { if (res.success && res.versions) setVersions(res.versions); })
                  .catch(() => {})
                  .finally(() => setVersionsLoading(false));
              }
            }}
            className="w-full flex items-center justify-between p-2.5 bg-white/[0.04] rounded-md border border-white/[0.06] text-xs text-white/70 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <span>📜 Version History</span>
            <span className="text-white/30">{showVersions ? '▲' : '▼'}</span>
          </button>
          {showVersions && (
            <div className="mt-1 flex flex-col gap-1">
              {versionsLoading ? (
                <div className="text-center text-white/40 text-xs py-3">Loading...</div>
              ) : versions.length === 0 ? (
                <div className="text-center text-xs text-white/40 py-3">No previous versions</div>
              ) : (
                versions.map((version, idx) => (
                  <div key={version.id} className="flex items-center justify-between p-2 bg-white/[0.02] rounded border border-white/[0.04]">
                    <div>
                      <div className="text-[10px] text-white/60">{idx === 0 ? 'Latest' : `v${versions.length - idx}`}</div>
                      <div className="text-[10px] text-white/30">{new Date(version.revisionDate).toLocaleString()}</div>
                    </div>
                    {idx > 0 && (
                      <button
                        onClick={async () => {
                          setRestoringVersionId(version.id);
                          await sendMessage<{ success: boolean }>({ type: 'restore-version', itemId: item.id, versionId: version.id }).catch(() => {});
                          setRestoringVersionId(null);
                        }}
                        disabled={restoringVersionId === version.id}
                        className={`px-2 py-0.5 text-[10px] rounded transition-colors cursor-pointer ${restoringVersionId === version.id ? 'bg-white/20 text-white/50' : 'bg-indigo-600/80 text-white hover:bg-indigo-500/90'}`}
                      >
                        {restoringVersionId === version.id ? '...' : 'Restore'}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Delete */}
        <div className="mt-4 pt-3 border-t border-white/[0.1]">
          {confirmDelete ? (
            <div className="bg-red-500/10 border border-red-400/20 rounded-md p-2.5">
              <div className="text-xs text-red-300 mb-2">
                Delete this item? This cannot be undone.
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className={`px-3 py-1.5 text-xs text-white rounded-md transition-colors ${deleting ? 'bg-red-500/50 cursor-not-allowed' : 'bg-red-500/80 hover:bg-red-400/90 cursor-pointer'}`}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 text-xs bg-white/[0.08] hover:bg-white/[0.14] text-white/70 rounded-md transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full p-2 text-xs text-red-300 bg-red-500/10 border border-red-400/20 rounded-md cursor-pointer hover:bg-red-500/20 transition-colors"
            >
              Delete Item
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add/Edit View ─────────────────────────────────────────────────────────

function AddEditView({
  editItem,
  folders,
  onSave,
  onCancel,
}: {
  editItem: VaultItem | null;
  folders: Folder[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const isEdit = editItem !== null;

  const [type, setType] = useState<VaultItemType>(editItem?.type || 'login');
  const [name, setName] = useState(editItem?.name || '');
  const [folderId, setFolderId] = useState(editItem?.folderId || '');
  const [favorite, setFavorite] = useState(editItem?.favorite || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Login fields
  const loginItem = editItem?.type === 'login' ? (editItem as LoginItem) : null;
  const [username, setUsername] = useState(loginItem?.username || '');
  const [password, setPassword] = useState(loginItem?.password || '');
  const [uris, setUris] = useState<string[]>(loginItem?.uris?.length ? loginItem.uris : ['']);
  const [totpSecret, setTotpSecret] = useState(loginItem?.totp || '');
  const [showPassword, setShowPassword] = useState(false);
  const [generatingAlias, setGeneratingAlias] = useState(false);

  // Note fields
  const noteItem = editItem?.type === 'note' ? (editItem as SecureNoteItem) : null;
  const [content, setContent] = useState(noteItem?.content || '');

  // Card fields
  const cardItem = editItem?.type === 'card' ? (editItem as CardItem) : null;
  const [cardholderName, setCardholderName] = useState(cardItem?.cardholderName || '');
  const [number, setNumber] = useState(cardItem?.number || '');
  const [expMonth, setExpMonth] = useState(cardItem?.expMonth || '01');
  const [expYear, setExpYear] = useState(cardItem?.expYear || new Date().getFullYear().toString());
  const [cvv, setCvv] = useState(cardItem?.cvv || '');
  const [brand, setBrand] = useState(cardItem?.brand || '');

  // Identity fields
  const identityItem = editItem?.type === 'identity' ? (editItem as IdentityItem) : null;
  const [firstName, setFirstName] = useState(identityItem?.firstName || '');
  const [middleName, setMiddleName] = useState(identityItem?.middleName || '');
  const [lastName, setLastName] = useState(identityItem?.lastName || '');
  const [identityEmail, setIdentityEmail] = useState(identityItem?.email || '');
  const [identityPhone, setIdentityPhone] = useState(identityItem?.phone || '');
  const [address1, setAddress1] = useState(identityItem?.address1 || '');
  const [address2, setAddress2] = useState(identityItem?.address2 || '');
  const [city, setCity] = useState(identityItem?.city || '');
  const [state, setState] = useState(identityItem?.state || '');
  const [postalCode, setPostalCode] = useState(identityItem?.postalCode || '');
  const [country, setCountry] = useState(identityItem?.country || '');
  const [company, setCompany] = useState(identityItem?.company || '');
  const [ssn, setSsn] = useState(identityItem?.ssn || '');
  const [passportNumber, setPassportNumber] = useState(identityItem?.passportNumber || '');
  const [licenseNumber, setLicenseNumber] = useState(identityItem?.licenseNumber || '');

  // Document fields
  const docItem = editItem?.type === 'document' ? (editItem as DocumentItem) : null;
  const [description, setDescription] = useState(docItem?.description || '');
  const [docFile, setDocFile] = useState<File | null>(null);

  // Custom fields
  const [customFields, setCustomFields] = useState<CustomField[]>(editItem?.customFields || []);

  // Folder creation
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [localFolders, setLocalFolders] = useState<Folder[]>(folders);

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    try {
      const result = await sendMessage<{ success: boolean; folder?: Folder }>({
        type: 'create-folder',
        name: newFolderName.trim(),
      });
      if (result.success && result.folder) {
        setLocalFolders((prev) => [...prev, result.folder!]);
        setFolderId(result.folder.id);
        setCreatingFolder(false);
        setNewFolderName('');
      }
    } catch {
      // ignore
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (type === 'login' && !username.trim() && !password.trim()) {
      setError('Username or password is required');
      return;
    }
    if (type === 'card' && !number.trim()) {
      setError('Card number is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const cfClean = customFields.filter((cf) => cf.name.trim());
      const base = {
        name,
        folderId: folderId || undefined,
        tags: editItem?.tags || [],
        favorite,
        customFields: cfClean.length > 0 ? cfClean : undefined,
      };
      let itemData: object;
      if (type === 'login') {
        itemData = {
          ...base,
          username,
          password,
          uris: uris.filter((u) => u.trim()),
          totp: totpSecret || undefined,
        };
      } else if (type === 'note') {
        itemData = {
          ...base,
          content,
        };
      } else if (type === 'card') {
        itemData = {
          ...base,
          cardholderName,
          number,
          expMonth,
          expYear,
          cvv,
          brand: brand || undefined,
        };
      } else if (type === 'identity') {
        itemData = {
          ...base,
          firstName: firstName || undefined,
          middleName: middleName || undefined,
          lastName: lastName || undefined,
          email: identityEmail || undefined,
          phone: identityPhone || undefined,
          address1: address1 || undefined,
          address2: address2 || undefined,
          city: city || undefined,
          state: state || undefined,
          postalCode: postalCode || undefined,
          country: country || undefined,
          company: company || undefined,
          ssn: ssn || undefined,
          passportNumber: passportNumber || undefined,
          licenseNumber: licenseNumber || undefined,
        };
      } else if (type === 'document') {
        itemData = {
          ...base,
          description: description || undefined,
          fileName: docFile?.name || undefined,
          mimeType: docFile?.type || undefined,
          size: docFile?.size || undefined,
        };
      } else {
        itemData = base;
      }

      let result: { success: boolean; error?: string };
      if (isEdit) {
        result = await sendMessage({ type: 'update-item', id: editItem.id, itemData });
      } else {
        result = await sendMessage({ type: 'create-item', itemData, itemType: type });
      }

      if (result.success) {
        onSave();
      } else {
        setError(result.error || 'Failed to save');
      }
    } catch {
      setError('Failed to save item');
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full px-3 py-2 border border-white/[0.12] rounded-md bg-white/[0.06] text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60";
  const labelClass = "block text-xs font-medium text-white/80 mb-1";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.1]">
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="border-0 bg-transparent cursor-pointer text-sm p-1.5 text-white/50 hover:text-white/80 transition-colors"
          >
            ←
          </button>
          <span className="text-sm font-semibold text-white">
            {isEdit ? 'Edit Item' : 'New Item'}
          </span>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-3 py-1.5 text-white text-xs font-semibold rounded-md transition-colors ${saving ? 'bg-white/40 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500/90 cursor-pointer'}`}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {error && (
          <div className="px-3 py-2 bg-red-500/10 border border-red-400/20 rounded-md text-red-300 text-xs">
            {error}
          </div>
        )}

        {/* Type selector (add mode only) */}
        {!isEdit && (
          <div className="flex gap-1 p-1 bg-white/[0.04] rounded-lg border border-white/[0.06] flex-wrap">
            {(['login', 'note', 'card', 'identity', 'document'] as VaultItemType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${type === t ? 'bg-white/[0.12] text-white font-semibold shadow-sm' : 'bg-transparent text-white/50 hover:text-white/80'}`}
              >
                {typeIcon(t)} {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        )}

        {/* Common fields */}
        <div>
          <label className={labelClass}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My Bank"
            className={inputClass}
          />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelClass}>Folder</label>
            <select
              value={creatingFolder ? '__new__' : folderId}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setCreatingFolder(true);
                } else {
                  setCreatingFolder(false);
                  setFolderId(e.target.value);
                }
              }}
              className={inputClass}
            >
              <option value="" className="bg-slate-900">No folder</option>
              {localFolders.map((f) => (
                <option key={f.id} value={f.id} className="bg-slate-900">
                  {f.name}
                </option>
              ))}
              <option value="__new__" className="bg-slate-900">+ New folder…</option>
            </select>
            {creatingFolder && (
              <div className="flex gap-1 mt-1">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                    if (e.key === 'Escape') {
                      setCreatingFolder(false);
                      setNewFolderName('');
                    }
                  }}
                  placeholder="Folder name"
                  className={`${inputClass} flex-1`}
                  autoFocus
                />
                <button
                  onClick={handleCreateFolder}
                  className="px-2.5 py-1.5 text-xs bg-indigo-600/80 text-white rounded-md hover:bg-indigo-500/90 cursor-pointer transition-colors"
                >
                  ✓
                </button>
                <button
                  onClick={() => {
                    setCreatingFolder(false);
                    setNewFolderName('');
                  }}
                  className="px-2 py-1.5 text-xs bg-transparent text-white/50 hover:text-white/80 cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          <label className="flex items-end gap-1 pb-1 cursor-pointer text-xs text-white/80 whitespace-nowrap">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
              className="mb-1"
            />
            ⭐
          </label>
        </div>

        {/* Login fields */}
        {type === 'login' && (
          <>
            <div>
              <label className={labelClass}>Username / Email</label>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`${inputClass} flex-1`}
                />
                <button
                  onClick={async () => {
                    setGeneratingAlias(true);
                    try {
                      const res = await sendMessage<{ success: boolean; alias?: string; error?: string }>({
                        type: 'generate-alias',
                      });
                      if (res.success && res.alias) setUsername(res.alias);
                    } catch {
                      // ignore
                    } finally {
                      setGeneratingAlias(false);
                    }
                  }}
                  disabled={generatingAlias}
                  title="Generate email alias"
                  className={`px-2 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap cursor-pointer ${generatingAlias ? 'bg-white/20 text-white/50 cursor-not-allowed' : 'bg-white/[0.08] hover:bg-white/[0.14] text-white/70'}`}
                >
                  {generatingAlias ? '...' : '✉️ Alias'}
                </button>
              </div>
            </div>
            <div>
              <label className={labelClass}>Password</label>
              <div className="flex gap-1">
                <div className="flex-1 relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pr-8`}
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 border-0 bg-transparent cursor-pointer text-xs p-1 text-white/50 hover:text-white/80 transition-colors"
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                <button
                  onClick={() => {
                    setPassword(
                      generatePassword({
                        length: 20,
                        uppercase: true,
                        lowercase: true,
                        digits: true,
                        symbols: true,
                      })
                    );
                    setShowPassword(true);
                  }}
                  className="px-2 py-1.5 text-xs bg-white/[0.08] hover:bg-white/[0.14] text-white/70 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                >
                  Gen
                </button>
              </div>
            </div>
            <div>
              <label className={labelClass}>TOTP Secret</label>
              <input
                type="text"
                value={totpSecret}
                onChange={(e) => setTotpSecret(e.target.value)}
                placeholder="Base32 or otpauth:// URI"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>URIs</label>
              {uris.map((uri, idx) => (
                <div key={idx} className="flex gap-1 mb-1">
                  <input
                    type="text"
                    value={uri}
                    onChange={(e) => {
                      const u = [...uris];
                      u[idx] = e.target.value;
                      setUris(u);
                    }}
                    placeholder="https://example.com"
                    className={`${inputClass} flex-1`}
                  />
                  <button
                    onClick={() => setUris(uris.filter((_, i) => i !== idx))}
                    className="px-2 py-0.5 text-xs text-red-400 bg-transparent hover:text-red-300 cursor-pointer transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => setUris([...uris, ''])}
                className="text-xs text-indigo-300 bg-transparent hover:text-indigo-200 cursor-pointer transition-colors py-0.5"
              >
                + Add URI
              </button>
            </div>
          </>
        )}

        {/* Note fields */}
        {type === 'note' && (
          <div>
            <label className={labelClass}>Secure Note</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className={`${inputClass} resize-y`}
            />
          </div>
        )}

        {/* Card fields */}
        {type === 'card' && (
          <>
            <div>
              <label className={labelClass}>Cardholder Name</label>
              <input
                type="text"
                value={cardholderName}
                onChange={(e) => setCardholderName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Card Number</label>
              <input
                type="text"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex gap-1.5">
              <div className="flex-1">
                <label className={labelClass}>Month</label>
                <select
                  value={expMonth}
                  onChange={(e) => setExpMonth(e.target.value)}
                  className={inputClass}
                >
                  {Array.from({ length: 12 }, (_, i) => {
                    const m = (i + 1).toString().padStart(2, '0');
                    return (
                      <option key={m} value={m} className="bg-slate-900">
                        {m}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="flex-1">
                <label className={labelClass}>Year</label>
                <input
                  type="text"
                  value={expYear}
                  onChange={(e) => setExpYear(e.target.value)}
                  placeholder="YYYY"
                  className={inputClass}
                />
              </div>
              <div className="flex-1">
                <label className={labelClass}>CVV</label>
                <input
                  type="password"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Brand</label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className={inputClass}
              >
                <option value="" className="bg-slate-900">Select...</option>
                <option value="Visa" className="bg-slate-900">Visa</option>
                <option value="Mastercard" className="bg-slate-900">Mastercard</option>
                <option value="Amex" className="bg-slate-900">American Express</option>
                <option value="Discover" className="bg-slate-900">Discover</option>
                <option value="Other" className="bg-slate-900">Other</option>
              </select>
            </div>
          </>
        )}

        {/* Identity fields */}
        {type === 'identity' && (
          <>
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/20 mt-1 mb-0.5">Personal</div>
            <div className="flex gap-1.5">
              <div className="flex-1">
                <label className={labelClass}>First Name</label>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
              </div>
              <div className="flex-1">
                <label className={labelClass}>Last Name</label>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Middle Name</label>
              <input type="text" value={middleName} onChange={(e) => setMiddleName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" value={identityEmail} onChange={(e) => setIdentityEmail(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input type="tel" value={identityPhone} onChange={(e) => setIdentityPhone(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Company</label>
              <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass} />
            </div>

            <div className="text-[10px] font-bold uppercase tracking-widest text-white/20 mt-2 mb-0.5">Address</div>
            <div>
              <label className={labelClass}>Address 1</label>
              <input type="text" value={address1} onChange={(e) => setAddress1(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Address 2</label>
              <input type="text" value={address2} onChange={(e) => setAddress2(e.target.value)} className={inputClass} />
            </div>
            <div className="flex gap-1.5">
              <div className="flex-1">
                <label className={labelClass}>City</label>
                <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
              </div>
              <div className="flex-1">
                <label className={labelClass}>State</label>
                <input type="text" value={state} onChange={(e) => setState(e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="flex gap-1.5">
              <div className="flex-1">
                <label className={labelClass}>Postal Code</label>
                <input type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className={inputClass} />
              </div>
              <div className="flex-1">
                <label className={labelClass}>Country</label>
                <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass} />
              </div>
            </div>

            <div className="text-[10px] font-bold uppercase tracking-widest text-white/20 mt-2 mb-0.5">Identification</div>
            <div>
              <label className={labelClass}>SSN</label>
              <input type="password" value={ssn} onChange={(e) => setSsn(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Passport Number</label>
              <input type="password" value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>License Number</label>
              <input type="password" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} className={inputClass} />
            </div>
          </>
        )}

        {/* Document fields */}
        {type === 'document' && (
          <>
            <div>
              <label className={labelClass}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={`${inputClass} resize-y`}
              />
            </div>
            {!isEdit && (
              <div>
                <label className={labelClass}>File</label>
                <input
                  type="file"
                  onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-white/70 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border file:border-white/[0.12] file:text-sm file:bg-white/[0.06] file:text-white/70 file:cursor-pointer hover:file:bg-white/[0.12]"
                />
              </div>
            )}
          </>
        )}

        {/* Custom fields editor */}
        <div className="mt-2 pt-2 border-t border-white/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-white/60">Custom Fields</span>
            <button
              onClick={() => setCustomFields([...customFields, { name: '', value: '', type: 'text' }])}
              className="text-xs text-indigo-300 bg-transparent hover:text-indigo-200 cursor-pointer transition-colors"
            >
              + Add Field
            </button>
          </div>
          {customFields.map((cf, idx) => (
            <div key={idx} className="flex flex-col gap-1 mb-2 p-2 bg-white/[0.02] rounded-md border border-white/[0.06]">
              <div className="flex gap-1">
                <input
                  type="text"
                  value={cf.name}
                  onChange={(e) => {
                    const updated = [...customFields];
                    updated[idx] = { ...updated[idx], name: e.target.value };
                    setCustomFields(updated);
                  }}
                  placeholder="Field name"
                  className={`${inputClass} flex-1`}
                />
                <select
                  value={cf.type}
                  onChange={(e) => {
                    const updated = [...customFields];
                    updated[idx] = { ...updated[idx], type: e.target.value as CustomField['type'], value: e.target.value === 'boolean' ? 'false' : updated[idx].value };
                    setCustomFields(updated);
                  }}
                  className={`${inputClass} w-[80px]`}
                >
                  <option value="text" className="bg-slate-900">Text</option>
                  <option value="hidden" className="bg-slate-900">Hidden</option>
                  <option value="boolean" className="bg-slate-900">Bool</option>
                </select>
                <button
                  onClick={() => setCustomFields(customFields.filter((_, i) => i !== idx))}
                  className="px-2 py-0.5 text-xs text-red-400 bg-transparent hover:text-red-300 cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </div>
              {cf.type === 'boolean' ? (
                <label className="flex items-center gap-2 px-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cf.value === 'true'}
                    onChange={(e) => {
                      const updated = [...customFields];
                      updated[idx] = { ...updated[idx], value: e.target.checked ? 'true' : 'false' };
                      setCustomFields(updated);
                    }}
                  />
                  <span className="text-xs text-white/70">{cf.value === 'true' ? 'Yes' : 'No'}</span>
                </label>
              ) : (
                <input
                  type={cf.type === 'hidden' ? 'password' : 'text'}
                  value={cf.value}
                  onChange={(e) => {
                    const updated = [...customFields];
                    updated[idx] = { ...updated[idx], value: e.target.value };
                    setCustomFields(updated);
                  }}
                  placeholder="Value"
                  className={inputClass}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
// ─── Health Summary View ────────────────────────────────────────────────────────

function HealthSummaryView({ onBack, filterBreached, allItems }: { onBack: () => void, filterBreached?: boolean, allItems: VaultItem[] }) {
  const [summary, setSummary] = useState<VaultHealthSummary | null>(null);
  const [reports, setReports] = useState<PasswordHealthReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const analyze = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await sendMessage<{ success: boolean; summary?: VaultHealthSummary; reports?: PasswordHealthReport[]; error?: string }>({
        type: 'run-health-analysis'
      });
      if (result.success && result.summary && result.reports) {
        setSummary(result.summary);
        setReports(result.reports);
      } else {
        setError(result.error || 'Failed to analyze vault health');
      }
    } catch (err) {
      setError('Error connecting to background service');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    analyze();
  }, [analyze]);

  const score = summary?.overallScore ?? 100;
  const scoreColor = score < 40 ? 'text-red-400' : score < 70 ? 'text-amber-400' : score < 90 ? 'text-indigo-400' : 'text-emerald-400';
  const scoreBg = score < 40 ? 'bg-red-400/20' : score < 70 ? 'bg-amber-400/20' : score < 90 ? 'bg-indigo-400/20' : 'bg-emerald-400/20';
  const strokeColor = score < 40 ? '#f87171' : score < 70 ? '#fbbf24' : score < 90 ? '#818cf8' : '#34d399';

  const displayReports = filterBreached
    ? reports.filter(r => r.issues.some(i => i.type === 'breached'))
    : reports.filter(r => r.issues.length > 0).sort((a, b) => b.issues.length - a.issues.length);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.1]">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="border-0 bg-transparent cursor-pointer text-sm p-1.5 text-white/50 hover:text-white/80 transition-colors">
            ←
          </button>
          <span className="text-sm font-semibold text-white">Security Health</span>
        </div>
        <button onClick={analyze} disabled={loading} className={`px-3 py-1.5 text-xs text-white rounded-md transition-colors ${loading ? 'bg-white/40 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500/90 cursor-pointer'}`}>
          {loading ? 'Analyzing...' : 'Analyze Now'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
        {error && <div className="px-3 py-2 bg-red-500/10 border border-red-400/20 rounded-md text-red-300 text-xs">{error}</div>}

        {loading && !summary ? (
          <div className="text-center text-white/40 text-sm mt-10">Scanning vault...</div>
        ) : summary && (
          <>
            <div className="flex items-center justify-center py-4">
              <div className="relative flex items-center justify-center w-[80px] h-[80px]">
                <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/10" />
                  <circle cx="50" cy="50" r="40" stroke={strokeColor} strokeWidth="8" fill="transparent" strokeDasharray={`${(score / 100) * 251.2} 251.2`} className="transition-all duration-1000 ease-out" />
                </svg>
                <div className="flex flex-col items-center justify-center z-10">
                  <span className={`text-xl font-bold ${scoreColor}`}>{score}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3 flex flex-col">
                <span className="text-xs text-white/40 uppercase tracking-wider mb-1">Weak</span>
                <span className="text-lg font-bold text-white">{summary.weak}</span>
              </div>
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3 flex flex-col">
                <span className="text-xs text-white/40 uppercase tracking-wider mb-1">Reused</span>
                <span className="text-lg font-bold text-white">{summary.reused}</span>
              </div>
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3 flex flex-col">
                <span className="text-xs text-white/40 uppercase tracking-wider mb-1">Old</span>
                <span className="text-lg font-bold text-white">{summary.old}</span>
              </div>
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3 flex flex-col">
                <span className="text-xs text-white/40 uppercase tracking-wider mb-1">Breached</span>
                <span className="text-lg font-bold text-red-400">{summary.breached}</span>
              </div>
            </div>

            <div className="mt-2">
              <h3 className="text-sm font-semibold text-white mb-2">{filterBreached ? 'Breached Items' : 'Top Issues'}</h3>
              {displayReports.length === 0 ? (
                <div className="text-center text-xs text-white/40 py-4 bg-white/[0.02] rounded-lg border border-white/[0.06]">No issues found!</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {displayReports.slice(0, filterBreached ? undefined : 10).map((report, idx) => (
                    <div key={idx} className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2.5">
                      <div className="text-sm font-medium text-white mb-1.5 truncate">{allItems.find(i => i.id === report.itemId)?.name || 'Unknown Item'}</div>
                      <div className="flex flex-wrap gap-1">
                        {report.issues.map((i, iidx) => (
                          <span key={iidx} className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${i.type === 'breached' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>
                            {i.type.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── AI Settings View ─────────────────────────────────────────────────────────

function AISettingsView({ onBack }: { onBack: () => void }) {
  const [flags, setFlags] = useState<AIFeatureFlags | null>(null);
  const [provider, setProvider] = useState<AIProvider>('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [savedProvider, setSavedProvider] = useState<AIProviderConfig | undefined>(undefined);

  useEffect(() => {
    setFlags(loadFeatureFlags());
    const config = getProviderConfig('openrouter');
    if (config) {
      setProvider(config.provider);
      setSavedProvider(config);
    } else {
      const otherConfigs = ['openai', 'anthropic', 'google', 'ollama', 'vercel'].map(p => getProviderConfig(p as AIProvider)).filter(Boolean);
      if (otherConfigs.length > 0) {
        setProvider(otherConfigs[0]!.provider);
        setSavedProvider(otherConfigs[0]);
      }
    }
  }, []);

  useEffect(() => {
    if (flags) {
      saveFeatureFlags(flags);
    }
  }, [flags]);

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const p = e.target.value as AIProvider;
    setProvider(p);
    const config = getProviderConfig(p);
    setSavedProvider(config);
    setApiKey('');
    setTestResult(null);
  };

  const handleTestAndSave = async () => {
    if (provider !== 'ollama' && !apiKey && !savedProvider?.apiKey) {
      setTestResult({ success: false, error: 'API key is required' });
      return;
    }

    setTesting(true);
    setTestResult(null);
    const config: AIProviderConfig = { provider, apiKey: apiKey || savedProvider?.apiKey, enabled: true };

    try {
      const result = await testProviderConnection(config);
      setTestResult(result);
      if (result.success) {
        setProviderConfig(config);
        setSavedProvider(config);
        setApiKey('');
      }
    } catch (err) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const toggleFlag = (key: keyof AIFeatureFlags) => {
    if (!flags) return;
    setFlags({ ...flags, [key]: !flags[key] });
  };

  const inputClass = "w-full px-3 py-2 border border-white/[0.12] rounded-md bg-white/[0.06] text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.1]">
        <button onClick={onBack} className="border-0 bg-transparent cursor-pointer text-sm p-1.5 text-white/50 hover:text-white/80 transition-colors">
          ←
        </button>
        <span className="text-sm font-semibold text-white">AI Settings</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        <div>
          <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-2">Features</h3>
          <div className="flex flex-col gap-2">
            {flags && [
              { key: 'passwordHealth', label: 'Password Health', desc: 'Local security analysis' },
              { key: 'breachMonitoring', label: 'Breach Monitoring', desc: 'Background HIBP checks' },
              { key: 'smartAutofill', label: 'Smart Autofill', desc: 'ML form field detection' }
            ].map((f) => (
              <label key={f.key} className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={flags[f.key as keyof AIFeatureFlags] as boolean} onChange={() => toggleFlag(f.key as keyof AIFeatureFlags)} className="mt-1" />
                <div>
                  <div className="text-sm text-white font-medium">{f.label}</div>
                  <div className="text-xs text-white/40">{f.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-white/[0.1] pt-4">
          <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-2">LLM Provider</h3>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">Provider</label>
              <select value={provider} onChange={handleProviderChange} className={inputClass}>
                <option value="openrouter" className="bg-slate-900">OpenRouter</option>
                <option value="openai" className="bg-slate-900">OpenAI</option>
                <option value="anthropic" className="bg-slate-900">Anthropic</option>
                <option value="google" className="bg-slate-900">Google</option>
                <option value="ollama" className="bg-slate-900">Ollama (Local)</option>
                <option value="vercel" className="bg-slate-900">Workers AI / Vercel</option>
              </select>
            </div>

            {provider !== 'ollama' && (
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">API Key {savedProvider?.apiKey && '(Saved)'}</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={savedProvider?.apiKey ? "••••••••••••" : "sk-..."}
                  className={inputClass}
                />
              </div>
            )}

            {testResult && (
              <div className={`p-2 rounded-md text-xs border ${testResult.success ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300' : 'bg-red-500/10 border-red-400/20 text-red-300'}`}>
                {testResult.success ? '✓ Connection successful' : `✕ ${testResult.error}`}
              </div>
            )}

            <button onClick={handleTestAndSave} disabled={testing} className={`px-3 py-2 text-xs text-white rounded-md font-semibold transition-colors ${testing ? 'bg-white/40 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500/90 cursor-pointer'}`}>
              {testing ? 'Testing...' : 'Test & Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Vault Tab ────────────────────────────────────────────────────────────────

function VaultTab({
  items,
  folders,
  onSelectItem,
  onAddItem,
  rotationMap,
  attachmentCounts,
}: {
  items: VaultItem[];
  folders: Folder[];
  onSelectItem: (item: VaultItem) => void;
  onAddItem: () => void;
  rotationMap?: Map<string, 'overdue' | 'due-soon'>;
  attachmentCounts: Map<string, number>;
}) {
  const [search, setSearch] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [semanticResults, setSemanticResults] = useState<SearchResult[] | null>(null);
  const [searchingRemote, setSearchingRemote] = useState(false);

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  // Debounced semantic search
  useEffect(() => {
    if (!search || search.length < 2) {
      setSemanticResults(null);
      return;
    }
    setSearchingRemote(true);
    const timer = setTimeout(() => {
      sendMessage<{ results: SearchResult[] }>({ type: 'search-vault', query: search })
        .then(res => setSemanticResults(res.results ?? null))
        .catch(() => setSemanticResults(null))
        .finally(() => setSearchingRemote(false));
    }, 300);
    return () => { clearTimeout(timer); setSearchingRemote(false); };
  }, [search]);

  // Use semantic results when available, fall back to local filter
  const filtered = semanticResults && search.length >= 2
    ? semanticResults
      .map(r => r.item)
      .filter(i => !selectedFolderId || i.folderId === selectedFolderId)
    : items.filter((i) => {
        if (search) {
          const q = search.toLowerCase();
          if (
            !i.name.toLowerCase().includes(q) &&
            !(i.type === 'login' && (i as LoginItem).username?.toLowerCase().includes(q))
          )
            return false;
        }
        if (selectedFolderId && i.folderId !== selectedFolderId) return false;
        return true;
      });

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col gap-1 p-3 border-b border-white/[0.1]">
        <div className="flex gap-1">
          <input
            type="text"
            placeholder="Search vault (semantic)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 py-1.5 border border-white/[0.12] rounded-md bg-white/[0.06] text-white placeholder-white/40 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
          />
          <button
            onClick={onAddItem}
            title="Add item"
            className="px-3 py-1.5 bg-indigo-600/80 text-white border-0 rounded-md text-xs font-bold hover:bg-indigo-500/90 cursor-pointer backdrop-blur-sm transition-colors"
          >
            +
          </button>
        </div>
        {searchingRemote && <div className="text-[10px] text-indigo-300/60 px-1">Searching...</div>}
        {semanticResults && search.length >= 2 && !searchingRemote && (
          <div className="text-[10px] text-indigo-300/60 px-1">🔍 {semanticResults.length} semantic result{semanticResults.length !== 1 ? 's' : ''}</div>
        )}
        {folders.length > 0 && (
          <select
            value={selectedFolderId ?? ''}
            onChange={(e) => setSelectedFolderId(e.target.value || null)}
            className="w-full px-2 py-1 border border-white/[0.12] rounded-md bg-white/[0.06] text-white/80 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/60"
          >
            <option value="" className="bg-slate-900">All folders</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id} className="bg-slate-900">
                📁 {f.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-white/40 text-sm">
            {search || selectedFolderId ? 'No matching items' : 'No items in vault'}
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelectItem(item)}
              className="p-3 border-b border-white/[0.06] cursor-pointer hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="text-sm shrink-0">{typeIcon(item.type)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <div className="text-sm font-medium text-white truncate">
                        {item.name}
                      </div>
                      {(attachmentCounts.get(item.id) ?? 0) > 0 && (
                        <span className="px-1 py-0.5 text-[9px] font-bold rounded bg-indigo-500/20 text-indigo-300 shrink-0" title={`${attachmentCounts.get(item.id)} attachment(s)`}>
                          📎{attachmentCounts.get(item.id)}
                        </span>
                      )}
                    </div>
                    {item.type === 'login' && (
                      <div className="text-xs text-white/50 mt-[1px] truncate">
                        {(item as LoginItem).username}
                      </div>
                    )}
                  </div>
                </div>
                {item.type === 'login' && (
                  <div className="flex gap-1 shrink-0 ml-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard((item as LoginItem).username, `u-${item.id}`);
                      }}
                      title="Copy username"
                      className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${copied === `u-${item.id}` ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/[0.08] text-white/70 hover:bg-white/[0.14]'}`}
                    >
                      {copied === `u-${item.id}` ? '✓' : '👤'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard((item as LoginItem).password, `p-${item.id}`);
                      }}
                      title="Copy password"
                      className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${copied === `p-${item.id}` ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/[0.08] text-white/70 hover:bg-white/[0.14]'}`}
                    >
                      {copied === `p-${item.id}` ? '✓' : '🔑'}
                    </button>
                  </div>
                )}
                {item.favorite && <span className="text-xs ml-0.5">⭐</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Shared Tab ───────────────────────────────────────────────────────────────

function SharedTab({
  sharedItems,
  sharedFolders,
  hasKeyPair,
  onSelectItem,
}: {
  sharedItems: VaultItem[];
  sharedFolders: Array<{ folderId: string; teamId: string; folderName: string; permissionLevel: string }>;
  hasKeyPair: boolean;
  onSelectItem: (item: VaultItem) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  if (!hasKeyPair) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-3xl mb-3">🔐</div>
        <p className="text-sm text-white/70 mb-2">Encryption keys not set up</p>
        <p className="text-xs text-white/40">Set up your key pair in the web vault to access shared items.</p>
      </div>
    );
  }

  if (sharedItems.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-3xl mb-3">🤝</div>
        <p className="text-sm text-white/70 mb-2">No shared items</p>
        <p className="text-xs text-white/40">Items shared with you through teams will appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {sharedItems.map((item) => {
        const folderName = sharedFolders.find(f => f.folderId === item.folderId)?.folderName;
        return (
          <div
            key={item.id}
            onClick={() => onSelectItem(item)}
            className="p-3 border-b border-white/[0.06] cursor-pointer hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="text-sm shrink-0">{typeIcon(item.type)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-[1px]">
                    <div className="text-sm font-medium text-white truncate">
                      {item.name}
                    </div>
                    {folderName && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-white/[0.08] text-white/50 shrink-0">
                        📁 {folderName}
                      </span>
                    )}
                  </div>
                  {item.type === 'login' && (
                    <div className="text-xs text-white/50 truncate">
                      {(item as LoginItem).username}
                    </div>
                  )}
                </div>
              </div>
              {item.type === 'login' && (
                <div className="flex gap-1 shrink-0 ml-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard((item as LoginItem).username, `u-${item.id}`);
                    }}
                    title="Copy username"
                    className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${copied === `u-${item.id}` ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/[0.08] text-white/70 hover:bg-white/[0.14]'}`}
                  >
                    {copied === `u-${item.id}` ? '✓' : '👤'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard((item as LoginItem).password, `p-${item.id}`);
                    }}
                    title="Copy password"
                    className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${copied === `p-${item.id}` ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/[0.08] text-white/70 hover:bg-white/[0.14]'}`}
                  >
                    {copied === `p-${item.id}` ? '✓' : '🔑'}
                  </button>
                </div>
              )}
              {item.favorite && <span className="text-xs ml-0.5">⭐</span>}
            </div>
          </div>
        );
      })}
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
      <div className="p-6 text-center text-white/40 text-sm">
        <div className="text-2xl mb-2">🔍</div>
        No saved passwords for this site
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {items.map((item) => (
        <div key={item.id} className="p-3 border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors">
          <div className="text-sm font-semibold text-white mb-1.5 truncate">
            {item.name}
          </div>
          {item.type === 'login' && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <span className="text-xs text-white/50 truncate pr-2">
                  {(item as LoginItem).username}
                </span>
                <button
                  onClick={() => copyToClipboard((item as LoginItem).username, `u-${item.id}`)}
                  className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer shrink-0 ${copied === `u-${item.id}` ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/[0.08] text-white/70 hover:bg-white/[0.14]'}`}
                >
                  {copied === `u-${item.id}` ? '✓ Copied' : 'Copy User'}
                </button>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-white/50">••••••••</span>
                <button
                  onClick={() => copyToClipboard((item as LoginItem).password, `p-${item.id}`)}
                  className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer shrink-0 ${copied === `p-${item.id}` ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/[0.08] text-white/70 hover:bg-white/[0.14]'}`}
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
  const [detectedRules, setDetectedRules] = useState<PasswordRules | null>(null);
  const [detectingRules, setDetectingRules] = useState(false);

  const generate = useCallback(() => {
    if (mode === 'password') {
      setGenerated(generatePassword({ length, uppercase, lowercase, digits, symbols }));
    } else {
      setGenerated(generatePassphrase({ wordCount, separator: '-', capitalize: true }));
    }
  }, [mode, length, uppercase, lowercase, digits, symbols, wordCount]);

  useEffect(() => {
    generate();
  }, [generate]);

  const strength = generated ? evaluateStrength(generated) : null;
  const strengthColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];

  async function copy() {
    await navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-3 flex flex-col gap-2.5">
      <div className="flex gap-1">
        {(['password', 'passphrase'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${mode === m ? 'bg-indigo-600/80 text-white font-semibold shadow-sm' : 'bg-transparent text-white/50 hover:text-white/80'}`}
          >
            {m === 'password' ? 'Password' : 'Passphrase'}
          </button>
        ))}
      </div>

      <div className="bg-white/[0.04] border border-white/[0.06] rounded-md p-2.5 font-mono text-sm break-all min-h-[40px] text-indigo-300">
        {generated}
      </div>

      {strength && (
        <div>
          <div className="h-1 bg-white/[0.1] rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${(strength.score + 1) * 20}%`,
                background: strengthColors[strength.score],
              }}
            />
          </div>
          <div className="text-xs text-white/40 mt-1">
            Entropy: {strength.entropy.toFixed(0)} bits
          </div>
        </div>
      )}

      {mode === 'password' ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center">
            <label className="text-xs text-white/80">Length: {length}</label>
            <input
              type="range"
              min={8}
              max={64}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              className="w-[120px] accent-indigo-500"
            />
          </div>
          {[
            { label: 'A-Z', value: uppercase, set: setUppercase },
            { label: 'a-z', value: lowercase, set: setLowercase },
            { label: '0-9', value: digits, set: setDigits },
            { label: '!@#', value: symbols, set: setSymbols },
          ].map(({ label, value, set }) => (
            <label
              key={label}
              className="flex justify-between items-center text-xs text-white/80 cursor-pointer"
            >
              {label}
              <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} className="accent-indigo-500" />
            </label>
          ))}
        </div>
      ) : (
        <div className="flex justify-between items-center">
          <label className="text-xs text-white/80">Words: {wordCount}</label>
          <input
            type="range"
            min={3}
            max={10}
            value={wordCount}
            onChange={(e) => setWordCount(Number(e.target.value))}
            className="w-[120px] accent-indigo-500"
          />
        </div>
      )}

      {/* Smart generation section */}
      <div className="border-t border-white/[0.08] pt-2 mt-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1.5">Smart Generation</div>
        <div className="flex gap-1.5">
          <button
            onClick={async () => {
              setDetectingRules(true);
              try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab?.id) {
                  const results = await chrome.tabs.sendMessage(tab.id, { type: 'get-password-field-metadata' });
                  if (results) {
                    const metadata: PasswordFieldMetadata = {
                      minLength: results.minLength,
                      maxLength: results.maxLength,
                      pattern: results.pattern,
                      title: results.title,
                      ariaDescription: results.ariaDescription,
                      nearbyText: results.nearbyText,
                    };
                    setDetectedRules(detectPasswordRules(metadata));
                  } else {
                    setDetectedRules(detectPasswordRules({}));
                  }
                } else {
                  setDetectedRules(detectPasswordRules({}));
                }
              } catch {
                setDetectedRules(detectPasswordRules({}));
              } finally {
                setDetectingRules(false);
              }
            }}
            disabled={detectingRules}
            className={`flex-1 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${detectingRules ? 'bg-white/40 cursor-not-allowed text-white/50' : 'bg-white/[0.08] hover:bg-white/[0.14] text-white/70'}`}
          >
            {detectingRules ? 'Detecting...' : '🔍 Detect Site Rules'}
          </button>
          {detectedRules && (
            <button
              onClick={() => {
                const pw = generateCompliant(detectedRules);
                setGenerated(pw);
              }}
              className="flex-1 py-1.5 text-xs bg-indigo-600/80 hover:bg-indigo-500/90 text-white rounded-md font-semibold transition-colors cursor-pointer"
            >
              ✨ Generate Compliant
            </button>
          )}
        </div>
        {detectedRules && (
          <div className="mt-1.5 p-2 bg-white/[0.04] border border-white/[0.06] rounded-md">
            <div className="text-[10px] text-white/50">
              Length: {detectedRules.minLength}–{detectedRules.maxLength}
              {detectedRules.requireUppercase && ' · A-Z'}
              {detectedRules.requireLowercase && ' · a-z'}
              {detectedRules.requireDigit && ' · 0-9'}
              {detectedRules.requireSpecial && ' · !@#'}
              {detectedRules.allowedSpecialChars && ` (${detectedRules.allowedSpecialChars})`}
              {detectedRules.forbiddenChars && ` · Forbidden: ${detectedRules.forbiddenChars}`}
            </div>
            <div className="text-[10px] text-white/30 mt-0.5">Source: {detectedRules.source}</div>
          </div>
        )}
      </div>

      <div className="flex gap-1.5 mt-1">
        <button
          onClick={generate}
          className="flex-1 py-2 text-xs bg-white/[0.08] hover:bg-white/[0.14] text-white/70 rounded-md transition-colors cursor-pointer"
        >
          ↻ Regenerate
        </button>
        <button
          onClick={copy}
          className={`flex-1 py-2 text-xs text-white rounded-md font-semibold transition-colors cursor-pointer ${copied ? 'bg-emerald-500/80 hover:bg-emerald-400/90' : 'bg-indigo-600/80 hover:bg-indigo-500/90'}`}
        >
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
    <div className="p-3 border-b border-white/[0.06] flex justify-between items-center hover:bg-white/[0.02] transition-colors">
      <div>
        <div className="text-xs font-medium text-white/80">{item.name}</div>
        <div className="text-[20px] font-bold font-mono text-indigo-300 tracking-[0.1em] mt-0.5">
          {code.slice(0, 3)} {code.slice(3)}
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className={`text-xs ${remaining <= 5 ? 'text-red-400' : 'text-white/40'}`}>
          {remaining}s
        </div>
        <button
          onClick={copy}
          className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${copied ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/[0.08] text-white/70 hover:bg-white/[0.14]'}`}
        >
          {copied ? '✓' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function TotpTab({ items }: { items: VaultItem[] }) {
  const totpItems = items.filter(
    (i): i is LoginItem => i.type === 'login' && Boolean((i as LoginItem).totp)
  );

  if (totpItems.length === 0) {
    return (
      <div className="p-6 text-center text-white/40 text-sm">
        <div className="text-2xl mb-2">🔑</div>
        No TOTP codes configured
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {totpItems.map((item) => (
        <TotpItem key={item.id} item={item} />
      ))}
    </div>
  );
}

// ─── Hardware Key Settings View ────────────────────────────────────────────

function HardwareKeyView({ onBack }: { onBack: () => void }) {
  const [keys, setKeys] = useState<Array<{ id: string; keyType: string; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    sendMessage<{ success: boolean; keys?: Array<{ id: string; keyType: string; createdAt: string }> }>({ type: 'list-hardware-keys' })
      .then((res) => { if (res.success && res.keys) setKeys(res.keys); })
      .catch(() => setError('Failed to load hardware keys'))
      .finally(() => setLoading(false));
  }, []);

  async function handleRegister() {
    setRegistering(true);
    setError('');
    setSuccess('');
    try {
      const result = await sendMessage<{ success: boolean; keyId?: string; error?: string }>({ type: 'register-hardware-key' });
      if (result.success && result.keyId) {
        setKeys((prev) => [...prev, { id: result.keyId!, keyType: 'fido2', createdAt: new Date().toISOString() }]);
        setSuccess('Hardware key registered successfully');
      } else {
        setError(result.error ?? 'Registration failed');
      }
    } catch {
      setError('Registration failed');
    } finally {
      setRegistering(false);
    }
  }

  async function handleRemove(keyId: string) {
    setRemovingId(keyId);
    setError('');
    try {
      const result = await sendMessage<{ success: boolean; error?: string }>({ type: 'remove-hardware-key', keyId });
      if (result.success) {
        setKeys((prev) => prev.filter((k) => k.id !== keyId));
        setSuccess('Key removed');
      } else {
        setError(result.error ?? 'Failed to remove key');
      }
    } catch {
      setError('Failed to remove key');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.1]">
        <button onClick={onBack} className="border-0 bg-transparent cursor-pointer text-sm p-1.5 text-white/50 hover:text-white/80 transition-colors">
          ←
        </button>
        <span className="text-sm font-semibold text-white">🔑 Hardware Keys</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {error && (
          <div className="px-3 py-2 bg-red-500/10 border border-red-400/20 rounded-md text-red-300 text-xs">{error}</div>
        )}
        {success && (
          <div className="px-3 py-2 bg-emerald-500/10 border border-emerald-400/20 rounded-md text-emerald-300 text-xs">{success}</div>
        )}

        <p className="text-xs text-white/50">
          Register a hardware security key (YubiKey, etc.) for passwordless unlock.
        </p>

        <button
          onClick={handleRegister}
          disabled={registering}
          className={`px-3 py-2 text-white text-sm font-medium rounded-md transition-colors ${registering ? 'bg-white/40 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500/90 cursor-pointer'}`}
        >
          {registering ? 'Touch your key...' : '+ Register New Key'}
        </button>

        {loading ? (
          <div className="text-center text-white/40 text-xs mt-4">Loading keys...</div>
        ) : keys.length === 0 ? (
          <div className="text-center text-white/40 text-xs mt-4">No hardware keys registered</div>
        ) : (
          <div className="flex flex-col gap-2 mt-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/30">Registered Keys</div>
            {keys.map((key) => (
              <div key={key.id} className="flex items-center justify-between p-3 bg-white/[0.04] rounded-md border border-white/[0.06]">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-white font-medium truncate">{key.keyType === 'yubikey-piv' ? 'YubiKey PIV' : 'FIDO2 Key'}</div>
                  <div className="text-[10px] text-white/40">Added {new Date(key.createdAt).toLocaleDateString()}</div>
                  <div className="text-[10px] text-white/30 font-mono truncate">{key.id.slice(0, 16)}...</div>
                </div>
                <button
                  onClick={() => handleRemove(key.id)}
                  disabled={removingId === key.id}
                  className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer shrink-0 ml-2 ${removingId === key.id ? 'bg-white/20 text-white/50 cursor-not-allowed' : 'bg-red-500/10 text-red-300 hover:bg-red-500/20'}`}
                >
                  {removingId === key.id ? '...' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── QR Sync View ──────────────────────────────────────────────────────────

function QRSyncView({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<'idle' | 'sending' | 'receiving'>('idle');
  const [qrData, setQrData] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [scanInput, setScanInput] = useState('');

  async function handleGenerateQR() {
    setError('');
    setSuccess('');
    setMode('sending');
    try {
      const result = await sendMessage<{ success: boolean; qrData?: string; expiresAt?: string; error?: string }>({ type: 'generate-sync-qr' });
      if (result.success && result.qrData) {
        setQrData(result.qrData);
        const expiresAt = new Date(result.expiresAt!).getTime();
        const updateRemaining = () => {
          const secs = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
          setRemaining(secs);
          if (secs <= 0) {
            setMode('idle');
            setQrData(null);
          }
        };
        updateRemaining();
        const timer = setInterval(updateRemaining, 1000);
        setTimeout(() => clearInterval(timer), 31000);
      } else {
        setError(result.error ?? 'Failed to generate QR');
        setMode('idle');
      }
    } catch {
      setError('Failed to generate QR');
      setMode('idle');
    }
  }

  async function handleScanSubmit() {
    if (!scanInput.trim()) return;
    setError('');
    setSuccess('');
    try {
      const result = await sendMessage<{ success: boolean; error?: string }>({
        type: 'process-sync-qr',
        qrData: scanInput.trim(),
      });
      if (result.success) {
        setSuccess('Device synced successfully!');
        setScanInput('');
        setMode('idle');
      } else {
        setError(result.error ?? 'Invalid or expired QR data');
      }
    } catch {
      setError('Sync failed');
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.1]">
        <button onClick={onBack} className="border-0 bg-transparent cursor-pointer text-sm p-1.5 text-white/50 hover:text-white/80 transition-colors">
          ←
        </button>
        <span className="text-sm font-semibold text-white">📱 Device Sync</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {error && (
          <div className="px-3 py-2 bg-red-500/10 border border-red-400/20 rounded-md text-red-300 text-xs">{error}</div>
        )}
        {success && (
          <div className="px-3 py-2 bg-emerald-500/10 border border-emerald-400/20 rounded-md text-emerald-300 text-xs">{success}</div>
        )}

        <p className="text-xs text-white/50">
          Securely transfer your session to another device using an encrypted QR code. The QR expires in 30 seconds.
        </p>

        {mode === 'idle' && (
          <div className="flex flex-col gap-2">
            <button
              onClick={handleGenerateQR}
              className="px-3 py-2 text-white text-sm font-medium rounded-md bg-indigo-600/80 hover:bg-indigo-500/90 transition-colors cursor-pointer"
            >
              📲 Share via QR (Sender)
            </button>
            <button
              onClick={() => setMode('receiving')}
              className="px-3 py-2 text-white/70 text-sm font-medium rounded-md border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              📷 Scan QR (Receiver)
            </button>
          </div>
        )}

        {mode === 'sending' && qrData && (
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 bg-white rounded-lg">
              <div className="w-[200px] h-[200px] flex items-center justify-center text-black/60 text-xs text-center font-mono break-all overflow-hidden">
                {/* In production, render actual QR code via a library */}
                <div className="p-2 text-[8px] leading-tight">{qrData.slice(0, 120)}...</div>
              </div>
            </div>
            <div className={`text-sm font-bold ${remaining <= 5 ? 'text-red-400' : 'text-white/60'}`}>
              Expires in {remaining}s
            </div>
            <button
              onClick={() => { setMode('idle'); setQrData(null); }}
              className="text-xs text-white/50 hover:text-white/80 bg-transparent border-0 cursor-pointer transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {mode === 'receiving' && (
          <div className="flex flex-col gap-3">
            <div className="text-xs text-white/60">
              Paste the QR data from the sender device:
            </div>
            <textarea
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              rows={4}
              placeholder='Paste QR sync payload...'
              className="w-full px-3 py-2 border border-white/[0.12] rounded-md bg-white/[0.06] text-white placeholder-white/40 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/60 resize-y"
            />
            <div className="flex gap-2">
              <button
                onClick={handleScanSubmit}
                disabled={!scanInput.trim()}
                className={`flex-1 px-3 py-2 text-white text-sm font-medium rounded-md transition-colors ${!scanInput.trim() ? 'bg-white/40 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500/90 cursor-pointer'}`}
              >
                Sync
              </button>
              <button
                onClick={() => { setMode('idle'); setScanInput(''); }}
                className="px-3 py-2 text-white/70 text-sm rounded-md border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Trash View ──────────────────────────────────────────────────────────────────────────

function TrashView({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<Array<VaultItem & { deletedAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    sendMessage<{ success: boolean; items?: Array<VaultItem & { deletedAt: string }>; error?: string }>({ type: 'get-trash' })
      .then(res => {
        if (res.success && res.items) setItems(res.items);
        else setError(res.error ?? 'Failed to load trash');
      })
      .catch(() => setError('Failed to connect'))
      .finally(() => setLoading(false));
  }, []);

  function daysRemaining(deletedAt: string): number {
    const deleted = new Date(deletedAt).getTime();
    const purgeDays = 30;
    const purgeAt = deleted + purgeDays * 24 * 60 * 60 * 1000;
    const remaining = Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000));
    return Math.max(0, remaining);
  }

  async function handleRestore(id: string) {
    setActionId(id);
    try {
      const res = await sendMessage<{ success: boolean; error?: string }>({ type: 'restore-item', id });
      if (res.success) {
        setItems(prev => prev.filter(i => i.id !== id));
      } else {
        setError(res.error ?? 'Failed to restore');
      }
    } catch {
      setError('Failed to restore item');
    } finally {
      setActionId(null);
    }
  }

  async function handlePermanentDelete(id: string) {
    setActionId(id);
    try {
      const res = await sendMessage<{ success: boolean; error?: string }>({ type: 'permanent-delete', id });
      if (res.success) {
        setItems(prev => prev.filter(i => i.id !== id));
        setConfirmDeleteId(null);
      } else {
        setError(res.error ?? 'Failed to delete');
      }
    } catch {
      setError('Failed to delete item');
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.1]">
        <button onClick={onBack} className="border-0 bg-transparent cursor-pointer text-sm p-1.5 text-white/50 hover:text-white/80 transition-colors">
          ←
        </button>
        <span className="text-sm font-semibold text-white">🗑️ Trash</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-3 mt-3 px-3 py-2 bg-red-500/10 border border-red-400/20 rounded-md text-red-300 text-xs">{error}</div>
        )}

        {loading ? (
          <div className="text-center text-white/40 text-sm mt-10">Loading trash...</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center mt-6">
            <div className="text-3xl mb-3">🗑️</div>
            <p className="text-sm text-white/70 mb-1">No items in trash</p>
            <p className="text-xs text-white/40">Deleted items appear here for 30 days before auto-purge.</p>
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="p-3 border-b border-white/[0.06]">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="text-sm shrink-0">{typeIcon(item.type)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate">{item.name}</div>
                    <div className="text-[10px] text-white/40">
                      {daysRemaining(item.deletedAt)} day{daysRemaining(item.deletedAt) !== 1 ? 's' : ''} until auto-purge
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0 ml-2">
                  <button
                    onClick={() => handleRestore(item.id)}
                    disabled={actionId === item.id}
                    className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${actionId === item.id ? 'bg-white/20 text-white/50 cursor-not-allowed' : 'bg-indigo-600/80 text-white hover:bg-indigo-500/90'}`}
                  >
                    {actionId === item.id ? '...' : 'Restore'}
                  </button>
                  {confirmDeleteId === item.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handlePermanentDelete(item.id)}
                        disabled={actionId === item.id}
                        className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${actionId === item.id ? 'bg-red-500/50 text-white/50 cursor-not-allowed' : 'bg-red-500/80 text-white hover:bg-red-400/90'}`}
                      >
                        {actionId === item.id ? '...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 text-xs bg-white/[0.08] text-white/70 rounded hover:bg-white/[0.14] transition-colors cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(item.id)}
                      className="px-2 py-1 text-xs bg-red-500/10 text-red-300 rounded hover:bg-red-500/20 transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Settings View (2FA, Travel Mode, Email Aliases) ────────────────────────────────────

function SettingsView({ onBack }: { onBack: () => void }) {
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [twoFaSetupData, setTwoFaSetupData] = useState<{ secret: string; otpauthUri: string; backupCodes: string[] } | null>(null);
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

  async function handleSetup2FA() {
    setTwoFaLoading(true);
    setTwoFaError('');
    try {
      const res = await sendMessage<{ success: boolean; secret?: string; otpauthUri?: string; backupCodes?: string[]; error?: string }>({ type: 'setup-2fa' });
      if (res.success && res.otpauthUri) {
        setTwoFaSetupData({ secret: res.secret!, otpauthUri: res.otpauthUri, backupCodes: res.backupCodes ?? [] });
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
      const res = await sendMessage<{ success: boolean; error?: string }>({ type: 'verify-2fa', code: twoFaCode.trim() });
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
      const res = await sendMessage<{ success: boolean; error?: string }>({ type: 'disable-2fa', code: disableCode.trim() });
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
      const res = await sendMessage<{ success: boolean; enabled?: boolean; error?: string }>({ type: 'set-travel-mode', enabled: !travelMode });
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
      setAliasResult(res.success ? { success: true } : { success: false, error: res.error ?? 'Connection failed' });
    } catch {
      setAliasResult({ success: false, error: 'Test failed' });
    } finally {
      setAliasTesting(false);
    }
  }

  const inputClass = 'w-full px-3 py-2 border border-white/[0.12] rounded-md bg-white/[0.06] text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.1]">
        <button onClick={onBack} className="border-0 bg-transparent cursor-pointer text-sm p-1.5 text-white/50 hover:text-white/80 transition-colors">←</button>
        <span className="text-sm font-semibold text-white">⚙️ Settings</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        {/* 2FA Section */}
        <div>
          <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-2">🔐 Two-Factor Authentication</h3>
          {twoFaError && <div className="px-3 py-2 bg-red-500/10 border border-red-400/20 rounded-md text-red-300 text-xs mb-2">{twoFaError}</div>}
          {twoFaSuccess && <div className="px-3 py-2 bg-emerald-500/10 border border-emerald-400/20 rounded-md text-emerald-300 text-xs mb-2">{twoFaSuccess}</div>}
          {twoFaEnabled ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-md border border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 text-sm">✓</span>
                  <span className="text-xs text-white/80">2FA is enabled</span>
                </div>
              </div>
              {showDisable ? (
                <div className="flex flex-col gap-2 p-3 bg-red-500/10 border border-red-400/20 rounded-md">
                  <div className="text-xs text-red-300">Enter your TOTP code to disable 2FA:</div>
                  <input type="text" value={disableCode} onChange={(e) => setDisableCode(e.target.value)} placeholder="000000" maxLength={6} className={inputClass} />
                  <div className="flex gap-1.5">
                    <button onClick={handleDisable2FA} disabled={twoFaLoading} className={`flex-1 px-3 py-1.5 text-xs text-white rounded-md transition-colors ${twoFaLoading ? 'bg-red-500/50 cursor-not-allowed' : 'bg-red-500/80 hover:bg-red-400/90 cursor-pointer'}`}>
                      {twoFaLoading ? 'Disabling...' : 'Disable 2FA'}
                    </button>
                    <button onClick={() => { setShowDisable(false); setDisableCode(''); }} className="px-3 py-1.5 text-xs bg-white/[0.08] hover:bg-white/[0.14] text-white/70 rounded-md transition-colors cursor-pointer">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowDisable(true)} className="px-3 py-2 text-xs text-red-300 bg-red-500/10 border border-red-400/20 rounded-md cursor-pointer hover:bg-red-500/20 transition-colors">Disable 2FA</button>
              )}
              {showBackupCodes && twoFaSetupData && (
                <div className="p-3 bg-white/[0.04] border border-white/[0.06] rounded-md">
                  <div className="text-xs font-semibold text-white/80 mb-2">Backup Codes (save these securely)</div>
                  <div className="grid grid-cols-2 gap-1">
                    {twoFaSetupData.backupCodes.map((code, idx) => (
                      <div key={idx} className="font-mono text-xs text-indigo-300 bg-white/[0.04] px-2 py-1 rounded">{code}</div>
                    ))}
                  </div>
                  <button onClick={() => setShowBackupCodes(false)} className="mt-2 text-xs text-white/50 hover:text-white/80 bg-transparent border-0 cursor-pointer transition-colors">Hide codes</button>
                </div>
              )}
            </div>
          ) : twoFaSetupData ? (
            <div className="flex flex-col gap-2">
              <div className="p-3 bg-white/[0.04] border border-white/[0.06] rounded-md">
                <div className="text-xs font-semibold text-white/80 mb-1">Scan with authenticator app:</div>
                <div className="font-mono text-[10px] text-indigo-300 break-all bg-white/[0.04] p-2 rounded">{twoFaSetupData.otpauthUri}</div>
                <div className="text-[10px] text-white/40 mt-1">Manual key: {twoFaSetupData.secret}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-white/80 mb-1">Verification Code</label>
                <input type="text" value={twoFaCode} onChange={(e) => setTwoFaCode(e.target.value)} placeholder="Enter 6-digit code" maxLength={6} className={inputClass} />
              </div>
              <button onClick={handleVerify2FA} disabled={twoFaLoading || twoFaCode.length < 6} className={`px-3 py-2 text-xs text-white font-semibold rounded-md transition-colors ${twoFaLoading || twoFaCode.length < 6 ? 'bg-white/40 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500/90 cursor-pointer'}`}>
                {twoFaLoading ? 'Verifying...' : 'Verify & Enable'}
              </button>
            </div>
          ) : (
            <button onClick={handleSetup2FA} disabled={twoFaLoading} className={`px-3 py-2 text-xs text-white font-semibold rounded-md transition-colors ${twoFaLoading ? 'bg-white/40 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500/90 cursor-pointer'}`}>
              {twoFaLoading ? 'Setting up...' : 'Enable 2FA'}
            </button>
          )}
        </div>

        {/* Travel Mode Section */}
        <div className="border-t border-white/[0.1] pt-4">
          <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-2">✈️ Travel Mode</h3>
          {travelError && <div className="px-3 py-2 bg-red-500/10 border border-red-400/20 rounded-md text-red-300 text-xs mb-2">{travelError}</div>}
          <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-md border border-white/[0.06]">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-white/80 font-medium">Travel Mode</div>
              <div className="text-[10px] text-white/40 mt-0.5">{travelMode ? 'Only travel-safe folders will sync' : 'All folders are synced'}</div>
            </div>
            <button onClick={handleTravelToggle} disabled={travelLoading} className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer border-0 ${travelMode ? 'bg-indigo-600/80' : 'bg-white/[0.12]'} ${travelLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${travelMode ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          {travelMode && (
            <div className="mt-2 px-3 py-2 bg-amber-500/10 border border-amber-400/20 rounded-md text-amber-300 text-xs">
              ⚠️ Only travel-safe folders will sync while travel mode is active. Disable when you return.
            </div>
          )}
        </div>

        {/* Email Aliases Section */}
        <div className="border-t border-white/[0.1] pt-4">
          <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-2">✉️ Email Aliases</h3>
          <div className="flex flex-col gap-2">
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">Provider</label>
              <select value={aliasProvider} onChange={(e) => { setAliasProvider(e.target.value); setAliasResult(null); }} className={inputClass}>
                <option value="simplelogin" className="bg-slate-900">SimpleLogin</option>
                <option value="anonaddy" className="bg-slate-900">AnonAddy</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">API Key</label>
              <input type="password" value={aliasApiKey} onChange={(e) => setAliasApiKey(e.target.value)} placeholder="Enter API key" className={inputClass} />
            </div>
            {aliasResult && (
              <div className={`p-2 rounded-md text-xs border ${aliasResult.success ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300' : 'bg-red-500/10 border-red-400/20 text-red-300'}`}>
                {aliasResult.success ? '✓ Connection successful' : `✕ ${aliasResult.error}`}
              </div>
            )}
            <button onClick={handleAliasSave} disabled={aliasTesting} className={`px-3 py-2 text-xs text-white font-semibold rounded-md transition-colors ${aliasTesting ? 'bg-white/40 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500/90 cursor-pointer'}`}>
              {aliasTesting ? 'Testing...' : 'Test & Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Emergency Access View ──────────────────────────────────────────────────────────────

function EmergencyAccessView({ onBack }: { onBack: () => void }) {
  const [grantsAsGrantor, setGrantsAsGrantor] = useState<Array<{ id: string; granteeEmail: string; status: string; waitDays: number; createdAt: string }>>([]);
  const [grantsAsGrantee, setGrantsAsGrantee] = useState<Array<{ id: string; grantorEmail: string; status: string; waitDays: number; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteWaitDays, setInviteWaitDays] = useState(7);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    sendMessage<{ success: boolean; grantsAsGrantor?: typeof grantsAsGrantor; grantsAsGrantee?: typeof grantsAsGrantee; error?: string }>({ type: 'get-emergency-access' })
      .then(res => {
        if (res.success) {
          setGrantsAsGrantor(res.grantsAsGrantor ?? []);
          setGrantsAsGrantee(res.grantsAsGrantee ?? []);
        } else {
          setError(res.error ?? 'Failed to load');
        }
      })
      .catch(() => setError('Failed to connect'))
      .finally(() => setLoading(false));
  }, []);

  async function handleAction(grantId: string, action: 'approve-emergency' | 'reject-emergency' | 'revoke-emergency') {
    setActionId(grantId);
    setError('');
    try {
      const res = await sendMessage<{ success: boolean; error?: string }>({ type: action, grantId });
      if (res.success) {
        setGrantsAsGrantor(prev => prev.filter(g => g.id !== grantId));
        setGrantsAsGrantee(prev => prev.filter(g => g.id !== grantId));
      } else {
        setError(res.error ?? 'Action failed');
      }
    } catch {
      setError('Action failed');
    } finally {
      setActionId(null);
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError('');
    try {
      const res = await sendMessage<{ success: boolean; grant?: { id: string; granteeEmail: string; status: string; waitDays: number }; error?: string }>({
        type: 'invite-emergency',
        email: inviteEmail.trim(),
        waitDays: inviteWaitDays,
      });
      if (res.success && res.grant) {
        setGrantsAsGrantor(prev => [...prev, { ...res.grant!, createdAt: new Date().toISOString() }]);
        setInviteEmail('');
        setShowInvite(false);
      } else {
        setError(res.error ?? 'Failed to invite');
      }
    } catch {
      setError('Failed to invite');
    } finally {
      setInviting(false);
    }
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-amber-500/20 text-amber-300',
      accepted: 'bg-indigo-500/20 text-indigo-300',
      confirmed: 'bg-emerald-500/20 text-emerald-300',
      'recovery-initiated': 'bg-red-500/20 text-red-300',
    };
    return <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${styles[status] ?? 'bg-white/[0.08] text-white/50'}`}>{status.toUpperCase()}</span>;
  };

  const inputClass = 'w-full px-3 py-2 border border-white/[0.12] rounded-md bg-white/[0.06] text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.1]">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="border-0 bg-transparent cursor-pointer text-sm p-1.5 text-white/50 hover:text-white/80 transition-colors">←</button>
          <span className="text-sm font-semibold text-white">🚨 Emergency Access</span>
        </div>
        <button onClick={() => setShowInvite(!showInvite)} className="px-3 py-1.5 text-xs text-white font-semibold rounded-md bg-indigo-600/80 hover:bg-indigo-500/90 transition-colors cursor-pointer">+ Invite</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {error && <div className="px-3 py-2 bg-red-500/10 border border-red-400/20 rounded-md text-red-300 text-xs">{error}</div>}
        {showInvite && (
          <div className="p-3 bg-white/[0.04] border border-white/[0.06] rounded-md flex flex-col gap-2">
            <div className="text-xs font-semibold text-white/80">Invite Trusted Contact</div>
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Email address" className={inputClass} />
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">Wait period (days)</label>
              <select value={inviteWaitDays} onChange={(e) => setInviteWaitDays(Number(e.target.value))} className={inputClass}>
                {[1, 3, 7, 14, 30].map(d => <option key={d} value={d} className="bg-slate-900">{d} day{d !== 1 ? 's' : ''}</option>)}
              </select>
            </div>
            <div className="flex gap-1.5">
              <button onClick={handleInvite} disabled={inviting} className={`flex-1 px-3 py-1.5 text-xs text-white rounded-md transition-colors ${inviting ? 'bg-white/40 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500/90 cursor-pointer'}`}>{inviting ? 'Inviting...' : 'Send Invite'}</button>
              <button onClick={() => setShowInvite(false)} className="px-3 py-1.5 text-xs bg-white/[0.08] hover:bg-white/[0.14] text-white/70 rounded-md transition-colors cursor-pointer">Cancel</button>
            </div>
          </div>
        )}
        {loading ? (
          <div className="text-center text-white/40 text-sm mt-10">Loading...</div>
        ) : (
          <>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-white/30 px-1 mb-2">My Trusted Contacts</h4>
              {grantsAsGrantor.length === 0 ? (
                <div className="text-center text-xs text-white/40 py-4 bg-white/[0.02] rounded-lg border border-white/[0.06]">No trusted contacts yet</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {grantsAsGrantor.map(grant => (
                    <div key={grant.id} className="p-3 bg-white/[0.04] border border-white/[0.06] rounded-md">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-xs text-white font-medium truncate">{grant.granteeEmail}</div>
                        {statusBadge(grant.status)}
                      </div>
                      <div className="text-[10px] text-white/40 mb-2">Wait: {grant.waitDays} day{grant.waitDays !== 1 ? 's' : ''}</div>
                      <div className="flex gap-1">
                        {grant.status === 'pending' && (
                          <>
                            <button onClick={() => handleAction(grant.id, 'approve-emergency')} disabled={actionId === grant.id} className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${actionId === grant.id ? 'bg-white/20 text-white/50 cursor-not-allowed' : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'}`}>Approve</button>
                            <button onClick={() => handleAction(grant.id, 'reject-emergency')} disabled={actionId === grant.id} className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${actionId === grant.id ? 'bg-white/20 text-white/50 cursor-not-allowed' : 'bg-red-500/20 text-red-300 hover:bg-red-500/30'}`}>Reject</button>
                          </>
                        )}
                        <button onClick={() => handleAction(grant.id, 'revoke-emergency')} disabled={actionId === grant.id} className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${actionId === grant.id ? 'bg-white/20 text-white/50 cursor-not-allowed' : 'bg-red-500/10 text-red-300 hover:bg-red-500/20'}`}>Revoke</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-white/30 px-1 mb-2">I'm a Contact For</h4>
              {grantsAsGrantee.length === 0 ? (
                <div className="text-center text-xs text-white/40 py-4 bg-white/[0.02] rounded-lg border border-white/[0.06]">No one has granted you access</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {grantsAsGrantee.map(grant => (
                    <div key={grant.id} className="p-3 bg-white/[0.04] border border-white/[0.06] rounded-md">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-xs text-white font-medium truncate">{grant.grantorEmail}</div>
                        {statusBadge(grant.status)}
                      </div>
                      <div className="text-[10px] text-white/40">Wait: {grant.waitDays} day{grant.waitDays !== 1 ? 's' : ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Version History View ────────────────────────────────────────────────────────────────

function VersionHistoryView({ item, onBack }: { item: VaultItem; onBack: () => void }) {
  const [versions, setVersions] = useState<Array<{ id: string; revisionDate: string; createdAt: string; data: VaultItem | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    sendMessage<{ success: boolean; versions?: typeof versions; error?: string }>({ type: 'get-versions', itemId: item.id })
      .then(res => {
        if (res.success && res.versions) setVersions(res.versions);
        else setError(res.error ?? 'Failed to load versions');
      })
      .catch(() => setError('Failed to connect'))
      .finally(() => setLoading(false));
  }, [item.id]);

  function relativeTime(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  async function handleRestore(versionId: string) {
    setRestoringId(versionId);
    setError('');
    try {
      const res = await sendMessage<{ success: boolean; error?: string }>({ type: 'restore-version', itemId: item.id, versionId });
      if (!res.success) setError(res.error ?? 'Failed to restore');
    } catch {
      setError('Failed to restore version');
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.1]">
        <button onClick={onBack} className="border-0 bg-transparent cursor-pointer text-sm p-1.5 text-white/50 hover:text-white/80 transition-colors">←</button>
        <span className="text-lg">{typeIcon(item.type)}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">{item.name}</div>
          <div className="text-[10px] text-white/40">Version History</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {error && <div className="px-3 py-2 bg-red-500/10 border border-red-400/20 rounded-md text-red-300 text-xs">{error}</div>}
        {loading ? (
          <div className="text-center text-white/40 text-sm mt-10">Loading versions...</div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center mt-6">
            <div className="text-3xl mb-3">📜</div>
            <p className="text-sm text-white/70 mb-1">No version history</p>
            <p className="text-xs text-white/40">Previous versions will appear here after edits.</p>
          </div>
        ) : (
          versions.map((version, idx) => (
            <div key={version.id} className="p-3 bg-white/[0.04] border border-white/[0.06] rounded-md">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-white font-medium">{idx === 0 ? 'Latest version' : `Version ${versions.length - idx}`}</div>
                  <div className="text-[10px] text-white/40">{relativeTime(version.revisionDate)}</div>
                </div>
                {idx > 0 && (
                  <button onClick={() => handleRestore(version.id)} disabled={restoringId === version.id} className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${restoringId === version.id ? 'bg-white/20 text-white/50 cursor-not-allowed' : 'bg-indigo-600/80 text-white hover:bg-indigo-500/90'}`}>
                    {restoringId === version.id ? '...' : 'Restore'}
                  </button>
                )}
              </div>
              {version.data && (
                <div className="mt-2 text-[10px] text-white/30 truncate">
                  {version.data.name}{version.data.type === 'login' ? ` • ${(version.data as LoginItem).username ?? ''}` : ''}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('site');
  const [allItems, setAllItems] = useState<VaultItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [siteItems, setSiteItems] = useState<VaultItem[]>([]);
  const [sharedItems, setSharedItems] = useState<VaultItem[]>([]);
  const [sharedFolders, setSharedFolders] = useState<Array<{ folderId: string; teamId: string; folderName: string; permissionLevel: string }>>([]);
  const [hasKeyPair, setHasKeyPair] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewState, setViewState] = useState<ViewState>({ view: 'tabs' });
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [breachedCount, setBreachedCount] = useState<number>(0);
  const [phishingWarning, setPhishingWarning] = useState<{ url: string; result: { safe: boolean; score: number; reasons: string[] } } | null>(null);
  const [attachmentCounts, setAttachmentCounts] = useState<Map<string, number>>(new Map());

  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; id: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [securityScore, setSecurityScore] = useState<number | null>(null);
  const [rotationMap, setRotationMap] = useState<Map<string, 'overdue' | 'due-soon'>>(new Map());

  const handleChatSend = () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = { role: 'user' as const, content: chatInput.trim(), id: crypto.randomUUID() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);
    
    // Placeholder response — will be replaced with real VaultAgent integration
    setTimeout(() => {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Chat requires an AI provider. Configure one in AI Settings to enable the assistant.',
        id: crypto.randomUUID(),
      }]);
      setChatLoading(false);
    }, 500);
  };

  useEffect(() => {
    // Check if API URL is configured, then check unlock state
    getApiBaseUrl()
      .then((url) => {
        if (!url) {
          setApiConfigured(false);
          setLoading(false);
          return;
        }
        setApiConfigured(true);
        return sendMessage<{ unlocked: boolean }>({ type: 'is-unlocked' })
          .then(({ unlocked: isUnlocked }) => setUnlocked(isUnlocked))
          .finally(() => setLoading(false));
      })
      .catch(() => setLoading(false));
  }, []);

  const loadVault = useCallback(() => {
    if (!unlocked) return;
    async function loadSharedItems() {
      try {
        const [itemsRes, foldersRes, keypairRes] = await Promise.all([
          sendMessage<{ items: Record<string, VaultItem> }>({ type: 'get-shared-items' }),
          sendMessage<{ sharedFolders: Array<{ folderId: string; teamId: string; folderName: string; permissionLevel: string }> }>({ type: 'get-shared-folders' }),
          sendMessage<{ hasKeyPair: boolean }>({ type: 'has-keypair' }),
        ]);
        setSharedItems(Object.values(itemsRes.items || {}));
        setSharedFolders(foldersRes.sharedFolders || []);
        setHasKeyPair(keypairRes.hasKeyPair);
      } catch (err) {
        console.error('Failed to load shared items:', err);
      }
    }

    sendMessage<{ items: VaultItem[]; folders: Folder[] }>({ type: 'get-vault' })
      .then(async ({ items, folders: f }) => {
        loadSharedItems();
        setAllItems(items);
        setFolders(f ?? []);

        // Fetch attachment counts for all items (non-blocking)
        Promise.all(
          items.map(item =>
            sendMessage<{ success: boolean; attachments?: Array<{ id: string }> }>({
              type: 'get-attachments',
              itemId: item.id,
            }).then(res => [item.id, res.success ? (res.attachments?.length ?? 0) : 0] as [string, number])
              .catch(() => [item.id, 0] as [string, number])
          )
        ).then(counts => {
          const map = new Map<string, number>();
          for (const [id, count] of counts) {
            if (count > 0) map.set(id, count);
          }
          setAttachmentCounts(map);
        });
        
        sendMessage<{ success: boolean; summary?: VaultHealthSummary }>({ type: 'run-health-analysis' })
          .then(res => { if (res.success && res.summary) setHealthScore(res.summary.overallScore); });
        sendMessage<{ success: boolean; breachedCount?: number }>({ type: 'get-breach-status' })
          .then(res => { if (res.success && res.breachedCount !== undefined) setBreachedCount(res.breachedCount); });

        try {
          const logins = items.filter(i => i.type === 'login') as LoginItem[];
          
          // Compute rotation schedules
          const tracker = new LifecycleTracker();
          const due = tracker.getDueItems(logins);
          const map = new Map<string, 'overdue' | 'due-soon'>();
          for (const schedule of due) {
            if (schedule.urgency === 'overdue' || schedule.urgency === 'due-soon') {
              map.set(schedule.itemId, schedule.urgency);
            }
          }
          setRotationMap(map);

          // Evaluate security posture
          const copilot = new SecurityCopilot();
          const posture = await copilot.evaluate(logins, {});
          if (posture?.score !== undefined) setSecurityScore(posture.score);
        } catch (err) {
          console.error('Failed to run AI features:', err);
        }
      })
      .catch(console.error);
  }, [unlocked]);
  useEffect(() => {
    if (!unlocked) return;

    // Load vault items + folders
    loadVault();

    // Get current tab URL and find matching items
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url;
      if (url) {
        sendMessage<{ items: VaultItem[] }>({ type: 'get-matches', url })
          .then(async ({ items }) => {
            try {
              const { items: sharedRes } = await sendMessage<{ items: Record<string, VaultItem> }>({ type: 'get-shared-items' });
              const sharedArr = Object.values(sharedRes || {});
              let hostname = '';
              try { hostname = new URL(url).hostname; } catch {}
              const sharedMatches = sharedArr.filter(item => {
                if (item.type !== 'login') return false;
                const uris = (item as LoginItem).uris || [];
                return uris.some(u => {
                  try { return new URL(u.startsWith('http') ? u : `https://${u}`).hostname === hostname; }
                  catch { return u.includes(hostname); }
                });
              });
              setSiteItems([...items, ...sharedMatches]);
            } catch {
              setSiteItems(items);
            }
          })
          .catch(console.error);
      }
    });
  }, [unlocked, loadVault]);

  // Check phishing status for current tab
  useEffect(() => {
    if (!unlocked) return;
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]?.id) {
        const status = await sendMessage<{ url: string; result: { safe: boolean; score: number; reasons: string[] } } | null>({
          type: 'get-phishing-status',
          tabId: tabs[0].id,
        });
        if (status) setPhishingWarning(status);
      }
    });
  }, [unlocked]);

  async function handleLock() {
    await sendMessage({ type: 'lock' });
    setUnlocked(false);
    setAllItems([]);
    setFolders([]);
    setSiteItems([]);
    setViewState({ view: 'tabs' });
  }

  /** Return to tabs and refresh vault data */
  function handleSaveOrDelete() {
    setViewState({ view: 'tabs' });
    loadVault();
    // Also refresh site matches
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url;
      if (url) {
        sendMessage<{ items: VaultItem[] }>({ type: 'get-matches', url })
          .then(async ({ items }) => {
            try {
              const { items: sharedRes } = await sendMessage<{ items: Record<string, VaultItem> }>({ type: 'get-shared-items' });
              const sharedArr = Object.values(sharedRes || {});
              let hostname = '';
              try { hostname = new URL(url).hostname; } catch {}
              const sharedMatches = sharedArr.filter(item => {
                if (item.type !== 'login') return false;
                const uris = (item as LoginItem).uris || [];
                return uris.some(u => {
                  try { return new URL(u.startsWith('http') ? u : `https://${u}`).hostname === hostname; }
                  catch { return u.includes(hostname); }
                });
              });
              setSiteItems([...items, ...sharedMatches]);
            } catch {
              setSiteItems(items);
            }
          })
          .catch(console.error);
      }
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[200px] text-white/40 text-sm">
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

  // Overlay views (detail / add / edit)
  if (viewState.view === 'detail') {
    return (
      <div className="flex flex-col h-[480px]">
        <ItemDetailView
          item={viewState.item}
          folders={folders}
          onEdit={() => setViewState({ view: 'edit', item: viewState.item })}
          onDelete={handleSaveOrDelete}
          onBack={() => setViewState({ view: 'tabs' })}
          onHistory={() => setViewState({ view: 'history', item: viewState.item })}
        />
      </div>
    );
  }

  if (viewState.view === 'add') {
    return (
      <div className="flex flex-col h-[480px]">
        <AddEditView
          editItem={null}
          folders={folders}
          onSave={handleSaveOrDelete}
          onCancel={() => setViewState({ view: 'tabs' })}
        />
      </div>
    );
  }

  if (viewState.view === 'edit') {
    return (
      <div className="flex flex-col h-[480px]">
        <AddEditView
          editItem={viewState.item}
          folders={folders}
          onSave={handleSaveOrDelete}
          onCancel={() => setViewState({ view: 'detail', item: viewState.item })}
        />
      </div>
    );
  }

  if (viewState.view === 'health') {
    return (
      <div className="flex flex-col h-[480px]">
        <HealthSummaryView onBack={() => setViewState({ view: 'tabs' })} filterBreached={'filterBreached' in viewState ? viewState.filterBreached : undefined} allItems={allItems} />
      </div>
    );
  }

  if (viewState.view === 'ai-settings') {
    return (
      <div className="flex flex-col h-[480px]">
        <AISettingsView onBack={() => setViewState({ view: 'tabs' })} />
      </div>
    );
  }
  if (viewState.view === 'hw-keys') {
    return (
      <div className="flex flex-col h-[480px]">
        <HardwareKeyView onBack={() => setViewState({ view: 'tabs' })} />
      </div>
    );
  }
  if (viewState.view === 'qr-sync') {
    return (
      <div className="flex flex-col h-[480px]">
        <QRSyncView onBack={() => setViewState({ view: 'tabs' })} />
      </div>
    );
  }
  if (viewState.view === 'chat') {
    return (
      <div className="flex flex-col h-[480px]">
        {/* Header */}
        <div className="flex items-center space-x-2 p-3 border-b border-white/[0.08]">
          <button onClick={() => setViewState({ view: 'tabs' })} className="text-white/60 hover:text-white border-0 bg-transparent cursor-pointer p-1">←</button>
          <span className="text-sm font-medium text-white">✨ Assistant</span>
        </div>
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {chatMessages.length === 0 && (
            <div className="text-center text-white/40 text-xs mt-8">
              <p className="text-2xl mb-2">✨</p>
              <p>Ask me anything about your vault.</p>
              <p className="mt-1">Try "find my GitHub password" or "generate a strong password"</p>
            </div>
          )}
          {chatMessages.map(msg => (
            <div key={msg.id} className={msg.role === 'user' 
              ? 'ml-auto max-w-[85%] px-3 py-2 bg-indigo-600/80 text-white text-xs rounded-xl rounded-br-sm'
              : 'mr-auto max-w-[85%] px-3 py-2 bg-white/[0.07] border border-white/[0.12] text-white text-xs rounded-xl rounded-bl-sm'
            }>
              {msg.content}
            </div>
          ))}
          {chatLoading && (
            <div className="mr-auto px-3 py-2 bg-white/[0.07] border border-white/[0.12] rounded-xl rounded-bl-sm">
              <div className="flex space-x-1">
                <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </div>
        
        {/* Input */}
        <div className="p-3 border-t border-white/[0.08] flex space-x-2">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleChatSend()}
            placeholder="Ask anything..."
            className="flex-1 px-3 py-2 text-xs bg-white/[0.06] border border-white/[0.12] rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/60"
          />
          <button
            onClick={handleChatSend}
            disabled={!chatInput.trim() || chatLoading}
            className="px-3 py-2 bg-indigo-600/80 hover:bg-indigo-500/90 text-white text-xs rounded-lg font-medium transition-colors disabled:opacity-40 cursor-pointer"
          >
            Send
          </button>
        </div>
      </div>
    );
  }
  if (viewState.view === 'trash') {
    return (
      <div className="flex flex-col h-[480px]">
        <TrashView onBack={() => setViewState({ view: 'tabs' })} />
      </div>
    );
  }
  if (viewState.view === 'settings') {
    return (
      <div className="flex flex-col h-[480px]">
        <SettingsView onBack={() => setViewState({ view: 'tabs' })} />
      </div>
    );
  }
  if (viewState.view === 'emergency') {
    return (
      <div className="flex flex-col h-[480px]">
        <EmergencyAccessView onBack={() => setViewState({ view: 'tabs' })} />
      </div>
    );
  }
  if (viewState.view === 'history') {
    return (
      <div className="flex flex-col h-[480px]">
        <VersionHistoryView item={viewState.item} onBack={() => setViewState({ view: 'detail', item: viewState.item })} />
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'site', label: '🌐 Site' },
    { id: 'vault', label: '🔒 Vault' },
    { id: 'shared', label: '🤝 Shared' },
    { id: 'generator', label: '⚡ Gen' },
    { id: 'totp', label: '🔑 TOTP' },
  ];

  return (
    <div className="flex flex-col h-[480px]">
      {/* Header */}
      <div className="flex justify-between items-center px-3 py-2.5 border-b border-white/[0.1] bg-indigo-600/20 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white">🔐 Lockbox</span>
          
          {unlocked && (
            <div 
              className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
              title="Vault Health Score"
              onClick={() => setViewState({ view: 'health' })}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 text-[10px] font-bold ${
                healthScore === null ? 'border-white/20 text-white/50' :
                healthScore < 40 ? 'border-red-400 text-red-400' :
                healthScore < 70 ? 'border-amber-400 text-amber-400' :
                healthScore < 90 ? 'border-indigo-400 text-indigo-400' :
                'border-emerald-400 text-emerald-400'
              }`}>
                {healthScore ?? '-'}
              </div>
              
              {breachedCount > 0 && (
                <div 
                  className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full cursor-pointer hover:bg-red-600 transition-colors"
                  title="Breached passwords found"
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewState({ view: 'health', filterBreached: true });
                  }}
                >
                  {breachedCount}
                </div>
              )}
            </div>
          )}

          {unlocked && securityScore !== null && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              securityScore >= 80 ? 'bg-emerald-500/20 text-emerald-400' :
              securityScore >= 50 ? 'bg-amber-500/20 text-amber-400' :
              'bg-red-500/20 text-red-400'
            }`}>
              {securityScore}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {unlocked && (
            <>
              <button
                onClick={() => setViewState({ view: 'chat' })}
                className="p-1.5 rounded-lg text-white/50 hover:bg-white/[0.06] hover:text-white transition-colors"
                title="Assistant"
              >
                <span className="text-sm">✨</span>
              </button>
              <button
                onClick={() => setViewState({ view: 'ai-settings' })}
                title="AI Settings"
                className="bg-white/[0.08] hover:bg-white/[0.14] border-0 rounded p-1.5 text-white/70 text-xs cursor-pointer transition-colors"
              >
                🤖
              </button>
              <button
                onClick={() => setViewState({ view: 'hw-keys' })}
                title="Hardware Keys"
                className="bg-white/[0.08] hover:bg-white/[0.14] border-0 rounded p-1.5 text-white/70 text-xs cursor-pointer transition-colors"
              >
                🔑
              </button>
              <button
                onClick={() => setViewState({ view: 'qr-sync' })}
                title="Device Sync"
                className="bg-white/[0.08] hover:bg-white/[0.14] border-0 rounded p-1.5 text-white/70 text-xs cursor-pointer transition-colors"
              >
                📱
              </button>
              <button
                onClick={() => setViewState({ view: 'trash' })}
                title="Trash"
                className="bg-white/[0.08] hover:bg-white/[0.14] border-0 rounded p-1.5 text-white/70 text-xs cursor-pointer transition-colors"
              >
                🗑️
              </button>
              <button
                onClick={() => setViewState({ view: 'settings' })}
                title="Settings"
                className="bg-white/[0.08] hover:bg-white/[0.14] border-0 rounded p-1.5 text-white/70 text-xs cursor-pointer transition-colors"
              >
                ⚙️
              </button>
              <button
                onClick={() => setViewState({ view: 'emergency' })}
                title="Emergency Access"
                className="bg-white/[0.08] hover:bg-white/[0.14] border-0 rounded p-1.5 text-white/70 text-xs cursor-pointer transition-colors"
              >
                🚨
              </button>
            </>
          )}
          <button
            onClick={handleLock}
            title="Lock vault"
            className="bg-white/[0.12] hover:bg-white/[0.2] border-0 rounded p-1.5 text-white text-xs cursor-pointer transition-colors"
          >
            Lock
          </button>
        </div>
      </div>
      {/* Phishing Warning */}
      {phishingWarning?.result && (
        <div className="px-3 py-2 bg-red-600/20 border-b border-red-400/30 flex items-center gap-2">
          <span className="text-sm">⚠️</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-red-300">Phishing Risk ({Math.round((phishingWarning.result.score ?? 0) * 100)}%)</div>
            <div className="text-[10px] text-red-300/70 truncate">{phishingWarning.result.reasons?.[0] ?? 'Suspicious site'}</div>
          </div>
          <button
            onClick={() => setPhishingWarning(null)}
            className="text-red-300/60 hover:text-red-200 text-xs bg-transparent border-0 cursor-pointer p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/[0.1] bg-white/[0.02]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-xs border-0 bg-transparent cursor-pointer transition-colors ${activeTab === tab.id ? 'border-b-2 border-indigo-400 text-indigo-300 font-semibold' : 'border-b-2 border-transparent text-white/50 hover:text-white/80'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'site' && <SiteTab items={siteItems} />}
        {activeTab === 'shared' && (
          <SharedTab
            sharedItems={sharedItems}
            sharedFolders={sharedFolders}
            hasKeyPair={hasKeyPair}
            onSelectItem={(item) => setViewState({ view: 'detail', item })}
          />
        )}
        {activeTab === 'vault' && (
          <VaultTab
            items={allItems}
            folders={folders}
            onSelectItem={(item) => setViewState({ view: 'detail', item })}
            onAddItem={() => setViewState({ view: 'add' })}
            rotationMap={rotationMap}
            attachmentCounts={attachmentCounts}
          />
        )}
        {activeTab === 'generator' && <GeneratorTab />}
        {activeTab === 'totp' && <TotpTab items={allItems} />}
      </div>
    </div>
  );
}
