/**
 * Lockbox extension popup.
 * Compact 360x480px UI with locked/unlocked states.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { generatePassword, generatePassphrase, evaluateStrength } from '@lockbox/generator';
import { totp as generateTOTP, getRemainingSeconds } from '@lockbox/totp';
import type {
  VaultItem,
  LoginItem,
  SecureNoteItem,
  CardItem,
  Folder,
  VaultItemType,
} from '@lockbox/types';
import { getApiBaseUrl, setApiBaseUrl } from '../../lib/storage.js';

type Tab = 'site' | 'vault' | 'generator' | 'totp';

type ViewState =
  | { view: 'tabs' }
  | { view: 'detail'; item: VaultItem }
  | { view: 'add' }
  | { view: 'edit'; item: VaultItem };

/** Send a message to the background service worker. */
async function sendMessage<T>(message: object): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

const typeIcon = (type: string) => ({ login: '🔑', note: '📝', card: '💳' })[type] ?? '📄';

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
        <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
          Connect to your server
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
      >
        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '12px',
              color: '#dc2626',
            }}
          >
            {error}
          </div>
        )}

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 500,
              color: '#374151',
              marginBottom: '4px',
            }}
          >
            Vault URL
          </label>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://lockbox-api.you.workers.dev"
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px',
              outline: 'none',
            }}
          />
          <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
            The URL of your self-hosted Lockbox vault
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '10px',
            background: saving ? '#94a3b8' : '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
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
        <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
          Sign in to your vault
        </p>
      </div>

      <form
        onSubmit={handleUnlock}
        style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
      >
        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '12px',
              color: '#dc2626',
            }}
          >
            {error}
          </div>
        )}

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 500,
              color: '#374151',
              marginBottom: '4px',
            }}
          >
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px',
              outline: 'none',
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 500,
              color: '#374151',
              marginBottom: '4px',
            }}
          >
            Master Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Master password"
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px',
              outline: 'none',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px',
            background: loading ? '#94a3b8' : '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Unlocking...' : 'Unlock Vault'}
        </button>
      </form>
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
}: {
  item: VaultItem;
  folders: Folder[];
  onEdit: () => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
  const [showCardNumber, setShowCardNumber] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [totpRemaining, setTotpRemaining] = useState(0);

  const login = item.type === 'login' ? (item as LoginItem) : null;
  const note = item.type === 'note' ? (item as SecureNoteItem) : null;
  const card = item.type === 'card' ? (item as CardItem) : null;
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
    <div style={{ marginBottom: '8px' }}>
      <div
        style={{
          fontSize: '10px',
          fontWeight: 600,
          color: '#94a3b8',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.05em',
          marginBottom: '2px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px',
          background: '#f8fafc',
          borderRadius: '4px',
        }}
      >
        <span
          style={{
            fontSize: '12px',
            fontFamily: opts?.hidden ? 'inherit' : 'monospace',
            color: '#1e293b',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap' as const,
            maxWidth: '220px',
          }}
        >
          {opts?.hidden && !opts?.shown ? '••••••••••••' : value}
        </span>
        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
          {opts?.toggle && (
            <button
              onClick={opts.toggle}
              style={{
                padding: '2px 4px',
                fontSize: '10px',
                border: '1px solid #e2e8f0',
                borderRadius: '3px',
                background: 'white',
                cursor: 'pointer',
              }}
            >
              {opts?.shown ? '🙈' : '👁️'}
            </button>
          )}
          <button
            onClick={() => copyField(value, fieldId)}
            style={{
              padding: '2px 4px',
              fontSize: '10px',
              border: '1px solid #e2e8f0',
              borderRadius: '3px',
              background: copied === fieldId ? '#dcfce7' : 'white',
              cursor: 'pointer',
            }}
          >
            {copied === fieldId ? '✓' : '📋'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 12px',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <button
          onClick={onBack}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '2px',
            color: '#64748b',
          }}
        >
          ←
        </button>
        <span style={{ fontSize: '18px' }}>{typeIcon(item.type)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#1e293b',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
            }}
          >
            {item.name}
          </div>
          {folder && <div style={{ fontSize: '10px', color: '#94a3b8' }}>📁 {folder.name}</div>}
        </div>
        <button
          onClick={onEdit}
          style={{
            padding: '4px 10px',
            fontSize: '11px',
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            background: 'white',
            cursor: 'pointer',
            color: '#4f46e5',
            fontWeight: 500,
          }}
        >
          Edit
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {item.favorite && (
          <div style={{ fontSize: '11px', color: '#eab308', marginBottom: '8px' }}>⭐ Favorite</div>
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
              <div style={{ marginBottom: '8px' }}>
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#94a3b8',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.05em',
                    marginBottom: '2px',
                  }}
                >
                  TOTP Code
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    background: '#f8fafc',
                    borderRadius: '4px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '18px',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      color: '#4f46e5',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {totpCode.slice(0, 3)} {totpCode.slice(3)}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        color: totpRemaining <= 5 ? '#ef4444' : '#64748b',
                      }}
                    >
                      {totpRemaining}s
                    </span>
                    <button
                      onClick={() => copyField(totpCode, 'totp')}
                      style={{
                        padding: '2px 4px',
                        fontSize: '10px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '3px',
                        background: copied === 'totp' ? '#dcfce7' : 'white',
                        cursor: 'pointer',
                      }}
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
                <div key={idx} style={{ marginBottom: '4px' }}>
                  {idx === 0 && (
                    <div
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#94a3b8',
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.05em',
                        marginBottom: '2px',
                      }}
                    >
                      URIs
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      background: '#f8fafc',
                      borderRadius: '4px',
                    }}
                  >
                    <a
                      href={uri.startsWith('http') ? uri : `https://${uri}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: '12px',
                        color: '#4f46e5',
                        textDecoration: 'none',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap' as const,
                        maxWidth: '250px',
                      }}
                    >
                      {uri}
                    </a>
                    <button
                      onClick={() => copyField(uri, `uri-${idx}`)}
                      style={{
                        padding: '2px 4px',
                        fontSize: '10px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '3px',
                        background: copied === `uri-${idx}` ? '#dcfce7' : 'white',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
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
            <div
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: '#94a3b8',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.05em',
                marginBottom: '4px',
              }}
            >
              Note
            </div>
            <div
              style={{
                padding: '8px',
                background: '#f8fafc',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#1e293b',
                whiteSpace: 'pre-wrap' as const,
                maxHeight: '200px',
                overflowY: 'auto',
              }}
            >
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
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#94a3b8',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.05em',
                    marginBottom: '2px',
                  }}
                >
                  Expires
                </div>
                <div
                  style={{
                    padding: '6px 8px',
                    background: '#f8fafc',
                    borderRadius: '4px',
                    fontSize: '12px',
                    color: '#1e293b',
                  }}
                >
                  {card.expMonth}/{card.expYear}
                </div>
              </div>
              {card.cvv && (
                <div style={{ flex: 1 }}>
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
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#94a3b8',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.05em',
                    marginBottom: '2px',
                  }}
                >
                  Brand
                </div>
                <div
                  style={{
                    padding: '6px 8px',
                    background: '#f8fafc',
                    borderRadius: '4px',
                    fontSize: '12px',
                    color: '#1e293b',
                  }}
                >
                  {card.brand}
                </div>
              </div>
            )}
          </>
        )}

        {/* Delete */}
        <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
          {confirmDelete ? (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                padding: '10px',
              }}
            >
              <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '8px' }}>
                Delete this item? This cannot be undone.
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    background: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '12px',
                color: '#dc2626',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
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
      let itemData: object;
      if (type === 'login') {
        itemData = {
          name,
          folderId: folderId || undefined,
          tags: editItem?.tags || [],
          favorite,
          username,
          password,
          uris: uris.filter((u) => u.trim()),
          totp: totpSecret || undefined,
        };
      } else if (type === 'note') {
        itemData = {
          name,
          folderId: folderId || undefined,
          tags: editItem?.tags || [],
          favorite,
          content,
        };
      } else {
        itemData = {
          name,
          folderId: folderId || undefined,
          tags: editItem?.tags || [],
          favorite,
          cardholderName,
          number,
          expMonth,
          expYear,
          cvv,
          brand: brand || undefined,
        };
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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '12px',
    outline: 'none',
    boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '2px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={onCancel}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '2px',
              color: '#64748b',
            }}
          >
            ←
          </button>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
            {isEdit ? 'Edit Item' : 'New Item'}
          </span>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '5px 14px',
            fontSize: '12px',
            background: saving ? '#94a3b8' : '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontWeight: 600,
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '4px',
              padding: '6px 10px',
              fontSize: '11px',
              color: '#dc2626',
            }}
          >
            {error}
          </div>
        )}

        {/* Type selector (add mode only) */}
        {!isEdit && (
          <div
            style={{
              display: 'flex',
              gap: '3px',
              background: '#f1f5f9',
              padding: '3px',
              borderRadius: '6px',
            }}
          >
            {(['login', 'note', 'card'] as VaultItemType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                style={{
                  flex: 1,
                  padding: '5px',
                  fontSize: '11px',
                  border: 'none',
                  borderRadius: '4px',
                  background: type === t ? 'white' : 'transparent',
                  color: type === t ? '#1e293b' : '#64748b',
                  cursor: 'pointer',
                  fontWeight: type === t ? 600 : 400,
                  boxShadow: type === t ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                }}
              >
                {typeIcon(t)} {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        )}

        {/* Common fields */}
        <div>
          <label style={labelStyle}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My Bank"
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Folder</label>
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
              style={{ ...inputStyle, padding: '5px 8px' }}
            >
              <option value="">No folder</option>
              {localFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
              <option value="__new__">+ New folder…</option>
            </select>
            {creatingFolder && (
              <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
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
                  style={{ ...inputStyle, flex: 1 }}
                  autoFocus
                />
                <button
                  onClick={handleCreateFolder}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    background: '#4f46e5',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  ✓
                </button>
                <button
                  onClick={() => {
                    setCreatingFolder(false);
                    setNewFolderName('');
                  }}
                  style={{
                    padding: '4px 6px',
                    fontSize: '11px',
                    color: '#94a3b8',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: '4px',
              paddingBottom: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              color: '#374151',
              whiteSpace: 'nowrap' as const,
            }}
          >
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
            />
            ⭐
          </label>
        </div>

        {/* Login fields */}
        {type === 'login' && (
          <>
            <div>
              <label style={labelStyle}>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Password</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ ...inputStyle, paddingRight: '28px' }}
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '4px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '2px',
                    }}
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
                  style={{
                    padding: '4px 8px',
                    fontSize: '10px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    background: 'white',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap' as const,
                  }}
                >
                  Gen
                </button>
              </div>
            </div>
            <div>
              <label style={labelStyle}>TOTP Secret</label>
              <input
                type="text"
                value={totpSecret}
                onChange={(e) => setTotpSecret(e.target.value)}
                placeholder="Base32 or otpauth:// URI"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>URIs</label>
              {uris.map((uri, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '3px', marginBottom: '3px' }}>
                  <input
                    type="text"
                    value={uri}
                    onChange={(e) => {
                      const u = [...uris];
                      u[idx] = e.target.value;
                      setUris(u);
                    }}
                    placeholder="https://example.com"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    onClick={() => setUris(uris.filter((_, i) => i !== idx))}
                    style={{
                      padding: '2px 6px',
                      fontSize: '11px',
                      color: '#dc2626',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => setUris([...uris, ''])}
                style={{
                  fontSize: '11px',
                  color: '#4f46e5',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 0',
                }}
              >
                + Add URI
              </button>
            </div>
          </>
        )}

        {/* Note fields */}
        {type === 'note' && (
          <div>
            <label style={labelStyle}>Secure Note</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              style={{ ...inputStyle, resize: 'vertical' as const }}
            />
          </div>
        )}

        {/* Card fields */}
        {type === 'card' && (
          <>
            <div>
              <label style={labelStyle}>Cardholder Name</label>
              <input
                type="text"
                value={cardholderName}
                onChange={(e) => setCardholderName(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Card Number</label>
              <input
                type="text"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Month</label>
                <select
                  value={expMonth}
                  onChange={(e) => setExpMonth(e.target.value)}
                  style={{ ...inputStyle, padding: '5px 8px' }}
                >
                  {Array.from({ length: 12 }, (_, i) => {
                    const m = (i + 1).toString().padStart(2, '0');
                    return (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Year</label>
                <input
                  type="text"
                  value={expYear}
                  onChange={(e) => setExpYear(e.target.value)}
                  placeholder="YYYY"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>CVV</label>
                <input
                  type="password"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Brand</label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                style={{ ...inputStyle, padding: '5px 8px' }}
              >
                <option value="">Select...</option>
                <option value="Visa">Visa</option>
                <option value="Mastercard">Mastercard</option>
                <option value="Amex">American Express</option>
                <option value="Discover">Discover</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </>
        )}
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
}: {
  items: VaultItem[];
  folders: Folder[];
  onSelectItem: (item: VaultItem) => void;
  onAddItem: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  const filtered = items.filter((i) => {
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <div style={{ display: 'flex', gap: '4px' }}>
          <input
            type="text"
            placeholder="Search vault..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              padding: '6px 10px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '12px',
              outline: 'none',
            }}
          />
          <button
            onClick={onAddItem}
            title="Add item"
            style={{
              padding: '6px 10px',
              background: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            +
          </button>
        </div>
        {folders.length > 0 && (
          <select
            value={selectedFolderId ?? ''}
            onChange={(e) => setSelectedFolderId(e.target.value || null)}
            style={{
              width: '100%',
              padding: '4px 8px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '11px',
              outline: 'none',
              color: '#374151',
              background: 'white',
            }}
          >
            <option value="">All folders</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                📁 {f.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            {search || selectedFolderId ? 'No matching items' : 'No items in vault'}
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelectItem(item)}
              style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <span style={{ fontSize: '14px', flexShrink: 0 }}>{typeIcon(item.type)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: '#1e293b',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap' as const,
                      }}
                    >
                      {item.name}
                    </div>
                    {item.type === 'login' && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#64748b',
                          marginTop: '1px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap' as const,
                        }}
                      >
                        {(item as LoginItem).username}
                      </div>
                    )}
                  </div>
                </div>
                {item.type === 'login' && (
                  <div style={{ display: 'flex', gap: '3px', flexShrink: 0, marginLeft: '4px' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard((item as LoginItem).username, `u-${item.id}`);
                      }}
                      title="Copy username"
                      style={{
                        padding: '3px 6px',
                        fontSize: '10px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '4px',
                        background: copied === `u-${item.id}` ? '#dcfce7' : 'white',
                        cursor: 'pointer',
                      }}
                    >
                      {copied === `u-${item.id}` ? '✓' : '👤'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard((item as LoginItem).password, `p-${item.id}`);
                      }}
                      title="Copy password"
                      style={{
                        padding: '3px 6px',
                        fontSize: '10px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '4px',
                        background: copied === `p-${item.id}` ? '#dcfce7' : 'white',
                        cursor: 'pointer',
                      }}
                    >
                      {copied === `p-${item.id}` ? '✓' : '🔑'}
                    </button>
                  </div>
                )}
                {item.favorite && <span style={{ fontSize: '10px', marginLeft: '2px' }}>⭐</span>}
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
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginBottom: '6px' }}>
            {item.name}
          </div>
          {item.type === 'login' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  {(item as LoginItem).username}
                </span>
                <button
                  onClick={() => copyToClipboard((item as LoginItem).username, `u-${item.id}`)}
                  style={{
                    padding: '3px 8px',
                    fontSize: '11px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    background: copied === `u-${item.id}` ? '#dcfce7' : 'white',
                    cursor: 'pointer',
                  }}
                >
                  {copied === `u-${item.id}` ? '✓ Copied' : 'Copy User'}
                </button>
              </div>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontSize: '12px', color: '#64748b' }}>••••••••</span>
                <button
                  onClick={() => copyToClipboard((item as LoginItem).password, `p-${item.id}`)}
                  style={{
                    padding: '3px 8px',
                    fontSize: '11px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    background: copied === `p-${item.id}` ? '#dcfce7' : 'white',
                    cursor: 'pointer',
                  }}
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
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', gap: '4px' }}>
        {(['password', 'passphrase'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              flex: 1,
              padding: '6px',
              fontSize: '12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              background: mode === m ? '#4f46e5' : 'white',
              color: mode === m ? 'white' : '#374151',
              cursor: 'pointer',
              fontWeight: mode === m ? 600 : 400,
            }}
          >
            {m === 'password' ? 'Password' : 'Passphrase'}
          </button>
        ))}
      </div>

      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          padding: '10px',
          fontFamily: 'monospace',
          fontSize: '13px',
          wordBreak: 'break-all' as const,
          minHeight: '40px',
          color: '#1e293b',
        }}
      >
        {generated}
      </div>

      {strength && (
        <div>
          <div
            style={{
              height: '4px',
              background: '#e2e8f0',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(strength.score + 1) * 20}%`,
                background: strengthColors[strength.score],
                transition: 'width 0.3s',
              }}
            />
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
            <input
              type="range"
              min={8}
              max={64}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              style={{ width: '120px' }}
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
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '12px',
                color: '#374151',
                cursor: 'pointer',
              }}
            >
              {label}
              <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} />
            </label>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', color: '#374151' }}>Words: {wordCount}</label>
          <input
            type="range"
            min={3}
            max={10}
            value={wordCount}
            onChange={(e) => setWordCount(Number(e.target.value))}
            style={{ width: '120px' }}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          onClick={generate}
          style={{
            flex: 1,
            padding: '8px',
            fontSize: '12px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            background: 'white',
            cursor: 'pointer',
          }}
        >
          ↻ Regenerate
        </button>
        <button
          onClick={copy}
          style={{
            flex: 1,
            padding: '8px',
            fontSize: '12px',
            border: 'none',
            borderRadius: '6px',
            background: copied ? '#22c55e' : '#4f46e5',
            color: 'white',
            cursor: 'pointer',
            fontWeight: 600,
          }}
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
    <div
      style={{
        padding: '10px 12px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div>
        <div style={{ fontSize: '12px', fontWeight: 500, color: '#1e293b' }}>{item.name}</div>
        <div
          style={{
            fontSize: '20px',
            fontWeight: 700,
            fontFamily: 'monospace',
            color: '#4f46e5',
            letterSpacing: '0.1em',
            marginTop: '2px',
          }}
        >
          {code.slice(0, 3)} {code.slice(3)}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        <div style={{ fontSize: '11px', color: remaining <= 5 ? '#ef4444' : '#64748b' }}>
          {remaining}s
        </div>
        <button
          onClick={copy}
          style={{
            padding: '4px 8px',
            fontSize: '11px',
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            background: copied ? '#dcfce7' : 'white',
            cursor: 'pointer',
          }}
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
      <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔑</div>
        No TOTP codes configured
      </div>
    );
  }

  return (
    <div style={{ overflowY: 'auto' }}>
      {totpItems.map((item) => (
        <TotpItem key={item.id} item={item} />
      ))}
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
  const [loading, setLoading] = useState(true);
  const [viewState, setViewState] = useState<ViewState>({ view: 'tabs' });

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
    sendMessage<{ items: VaultItem[]; folders: Folder[] }>({ type: 'get-vault' })
      .then(({ items, folders: f }) => {
        setAllItems(items);
        setFolders(f ?? []);
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
          .then(({ items }) => setSiteItems(items))
          .catch(console.error);
      }
    });
  }, [unlocked, loadVault]);

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
          .then(({ items }) => setSiteItems(items))
          .catch(console.error);
      }
    });
  }

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '200px',
          color: '#94a3b8',
          fontSize: '13px',
        }}
      >
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
      <div style={{ display: 'flex', flexDirection: 'column', height: '480px' }}>
        <ItemDetailView
          item={viewState.item}
          folders={folders}
          onEdit={() => setViewState({ view: 'edit', item: viewState.item })}
          onDelete={handleSaveOrDelete}
          onBack={() => setViewState({ view: 'tabs' })}
        />
      </div>
    );
  }

  if (viewState.view === 'add') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '480px' }}>
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
      <div style={{ display: 'flex', flexDirection: 'column', height: '480px' }}>
        <AddEditView
          editItem={viewState.item}
          folders={folders}
          onSave={handleSaveOrDelete}
          onCancel={() => setViewState({ view: 'detail', item: viewState.item })}
        />
      </div>
    );
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 12px',
          borderBottom: '1px solid #e2e8f0',
          background: '#4f46e5',
        }}
      >
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'white' }}>🔐 Lockbox</span>
        <button
          onClick={handleLock}
          title="Lock vault"
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 8px',
            color: 'white',
            fontSize: '12px',
            cursor: 'pointer',
          }}
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
            style={{
              flex: 1,
              padding: '8px 4px',
              fontSize: '11px',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #4f46e5' : '2px solid transparent',
              background: 'white',
              color: activeTab === tab.id ? '#4f46e5' : '#64748b',
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'site' && <SiteTab items={siteItems} />}
        {activeTab === 'vault' && (
          <VaultTab
            items={allItems}
            folders={folders}
            onSelectItem={(item) => setViewState({ view: 'detail', item })}
            onAddItem={() => setViewState({ view: 'add' })}
          />
        )}
        {activeTab === 'generator' && <GeneratorTab />}
        {activeTab === 'totp' && <TotpTab items={allItems} />}
      </div>
    </div>
  );
}
