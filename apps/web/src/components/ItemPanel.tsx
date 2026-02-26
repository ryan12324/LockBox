import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth.js';
import { api } from '../lib/api.js';
import { encryptVaultItem } from '../lib/crypto.js';
import type { VaultItem, LoginItem, SecureNoteItem, CardItem, Folder, VaultItemType } from '@lockbox/types';
import { totp, getRemainingSeconds, base32Decode, parseOtpAuthUri } from '@lockbox/totp';
import { generatePassword } from '@lockbox/generator';

interface ItemPanelProps {
  mode: 'view' | 'edit' | 'add';
  item: VaultItem | null;
  folders: Folder[];
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function ItemPanel({ mode, item, folders, onSave, onDelete, onClose }: ItemPanelProps) {
  const { session, userKey } = useAuthStore();
  
  const [currentMode, setCurrentMode] = useState(mode);
  const [type, setType] = useState<VaultItemType>(item?.type || 'login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  
  // Form State
  const [name, setName] = useState(item?.name || '');
  const [folderId, setFolderId] = useState(item?.folderId || '');
  const [favorite, setFavorite] = useState(item?.favorite || false);
  
  // Login State
  const loginItem = item?.type === 'login' ? (item as LoginItem) : null;
  const [username, setUsername] = useState(loginItem?.username || '');
  const [password, setPassword] = useState(loginItem?.password || '');
  const [uris, setUris] = useState<string[]>(loginItem?.uris || ['']);
  const [totpSecret, setTotpSecret] = useState(loginItem?.totp || '');
  
  // Note State
  const noteItem = item?.type === 'note' ? (item as SecureNoteItem) : null;
  const [content, setContent] = useState(noteItem?.content || '');
  
  // Card State
  const cardItem = item?.type === 'card' ? (item as CardItem) : null;
  const [cardholderName, setCardholderName] = useState(cardItem?.cardholderName || '');
  const [number, setNumber] = useState(cardItem?.number || '');
  const [expMonth, setExpMonth] = useState(cardItem?.expMonth || '01');
  const [expYear, setExpYear] = useState(cardItem?.expYear || new Date().getFullYear().toString());
  const [cvv, setCvv] = useState(cardItem?.cvv || '');
  const [brand, setBrand] = useState(cardItem?.brand || '');

  // UI State
  const [showPassword, setShowPassword] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
  const [showCardNumber, setShowCardNumber] = useState(false);
  const [localFolders, setLocalFolders] = useState<Folder[]>(folders);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpRemaining, setTotpRemaining] = useState(0);

  // Sync state if item changes
  useEffect(() => {
    setCurrentMode(mode);
    setType(item?.type || 'login');
    setName(item?.name || '');
    setFolderId(item?.folderId || '');
    setFavorite(item?.favorite || false);
    
    if (item?.type === 'login') {
      const l = item as LoginItem;
      setUsername(l.username || '');
      setPassword(l.password || '');
      setUris(l.uris?.length ? l.uris : ['']);
      setTotpSecret(l.totp || '');
    } else if (item?.type === 'note') {
      const n = item as SecureNoteItem;
      setContent(n.content || '');
    } else if (item?.type === 'card') {
      const c = item as CardItem;
      setCardholderName(c.cardholderName || '');
      setNumber(c.number || '');
      setExpMonth(c.expMonth || '01');
      setExpYear(c.expYear || new Date().getFullYear().toString());
      setCvv(c.cvv || '');
      setBrand(c.brand || '');
    }
    setShowConfirmDelete(false);
    setShowPassword(false);
    setShowCvv(false);
    setShowCardNumber(false);
    setError('');
    setLocalFolders(folders);
    setCreatingFolder(false);
    setNewFolderName('');
  }, [mode, item]);

  // TOTP generation
  useEffect(() => {
    if (currentMode !== 'view' || type !== 'login' || !totpSecret) return;

    let intervalId: ReturnType<typeof setInterval>;
    
    const updateTotp = async () => {
      try {
        let secretBytes: Uint8Array;
        let period = 30;
        
        if (totpSecret.startsWith('otpauth://')) {
          const parsed = parseOtpAuthUri(totpSecret);
          secretBytes = parsed.secret;
          period = parsed.period || 30;
        } else {
          secretBytes = base32Decode(totpSecret);
        }
        
        const code = await totp(secretBytes, Date.now(), { period });
        setTotpCode(code);
        setTotpRemaining(getRemainingSeconds(period));
      } catch (err) {
        setTotpCode('Invalid secret');
        setTotpRemaining(0);
      }
    };

    updateTotp();
    intervalId = setInterval(updateTotp, 1000);

    return () => clearInterval(intervalId);
  }, [currentMode, type, totpSecret]);

  async function copyToClipboard(text: string, field: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  const handleSave = async () => {
    if (!session || !userKey) return;

    // Validation
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (type === 'login') {
      if (!username.trim() && !password.trim()) {
        setError('Username or password is required');
        return;
      }
    }
    if (type === 'card') {
      if (!number.trim()) {
        setError('Card number is required');
        return;
      }
      if (!expMonth || !expYear.trim()) {
        setError('Expiration date is required');
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      const now = new Date().toISOString();
      const isAdd = currentMode === 'add';
      const itemId = isAdd ? crypto.randomUUID() : item!.id;
      
      const baseItem = {
        id: itemId,
        type,
        name,
        folderId: folderId || undefined,
        tags: item?.tags || [],
        favorite,
        createdAt: isAdd ? now : item!.createdAt,
        updatedAt: now,
        revisionDate: now,
      };

      let vaultItem: VaultItem;
      
      if (type === 'login') {
        vaultItem = {
          ...baseItem,
          type: 'login',
          username,
          password,
          uris: uris.filter(u => u.trim()),
          totp: totpSecret || undefined,
        } as LoginItem;
      } else if (type === 'note') {
        vaultItem = {
          ...baseItem,
          type: 'note',
          content,
        } as SecureNoteItem;
      } else {
        vaultItem = {
          ...baseItem,
          type: 'card',
          cardholderName,
          number,
          expMonth,
          expYear,
          cvv,
          brand: brand || undefined,
        } as CardItem;
      }

      const encryptedData = await encryptVaultItem(vaultItem, userKey, itemId, now);

      if (isAdd) {
        await api.vault.createItem(
          { type, encryptedData, folderId: folderId || undefined, tags: [], favorite },
          session.token
        );
      } else {
        await api.vault.updateItem(
          itemId,
          { encryptedData, folderId: folderId || undefined, tags: item!.tags, favorite },
          session.token
        );
      }
      
      onSave();
    } catch (err) {
      console.error('Failed to save item:', err);
      setError(err instanceof Error ? err.message : 'Failed to save item');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!session || !item) return;
    setLoading(true);
    try {
      await api.vault.deleteItem(item.id, session.token);
      onDelete();
    } catch (err) {
      console.error('Failed to delete item:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete item');
      setLoading(false);
    }
  };

  async function handleCreateFolder() {
    if (!session || !newFolderName.trim()) return;
    try {
      const res = await api.vault.createFolder({ name: newFolderName.trim() }, session.token) as { folder: Folder };
      setLocalFolders((prev) => [...prev, res.folder]);
      setFolderId(res.folder.id);
      setCreatingFolder(false);
      setNewFolderName('');
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  }

  const typeIcon = (t: string) => ({ login: '🔑', note: '📝', card: '💳' }[t] ?? '📄');

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full sm:w-[450px] bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col transform transition-transform duration-300 ease-in-out translate-x-0">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{typeIcon(type)}</span>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate max-w-[200px]">
              {currentMode === 'add' 
                ? `New ${type.charAt(0).toUpperCase() + type.slice(1)}` 
                : (name || 'Unnamed Item')}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {currentMode === 'view' ? (
              <button
                onClick={() => setCurrentMode('edit')}
                className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
              >
                Edit
              </button>
            ) : (
              <>
                <button
                  onClick={currentMode === 'add' ? onClose : () => setCurrentMode('view')}
                  className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors disabled:opacity-50"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? 'Saving...' : 'Save'}
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm rounded-lg">
              {error}
            </div>
          )}

          {currentMode === 'add' && (
            <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
              {(['login', 'note', 'card'] as VaultItemType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    type === t
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          )}

          {/* Common Fields */}
          {currentMode !== 'view' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g. My Bank"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Folder</label>
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
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">No folder</option>
                    {localFolders.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                    <option value="__new__">+ New folder...</option>
                  </select>
                  {creatingFolder && (
                    <div className="flex gap-1 mt-2">
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); } }}
                        placeholder="Folder name"
                        className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        autoFocus
                      />
                      <button onClick={handleCreateFolder} className="px-2.5 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">✓</button>
                      <button onClick={() => { setCreatingFolder(false); setNewFolderName(''); }} className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
                    </div>
                  )}
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={favorite}
                      onChange={(e) => setFavorite(e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Favorite</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Type Specific Fields - Edit/Add Mode */}
          {currentMode !== 'view' && type === 'login' && (
            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showPassword ? '👁️‍🗨️' : '👁️'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const pw = generatePassword({ length: 20, uppercase: true, lowercase: true, digits: true, symbols: true });
                      setPassword(pw);
                      setShowPassword(true);
                    }}
                    className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors text-sm"
                  >
                    Gen
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Authenticator Key (TOTP)</label>
                <input
                  type="text"
                  value={totpSecret}
                  onChange={(e) => setTotpSecret(e.target.value)}
                  placeholder="Base32 secret or otpauth:// URI"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URIs</label>
                {uris.map((uri, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={uri}
                      onChange={(e) => {
                        const newUris = [...uris];
                        newUris[idx] = e.target.value;
                        setUris(newUris);
                      }}
                      placeholder="https://example.com"
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setUris(uris.filter((_, i) => i !== idx))}
                      className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setUris([...uris, ''])}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  + Add URI
                </button>
              </div>
            </div>
          )}

          {currentMode !== 'view' && type === 'note' && (
            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Secure Note</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y"
                />
              </div>
            </div>
          )}

          {currentMode !== 'view' && type === 'card' && (
            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cardholder Name</label>
                <input
                  type="text"
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Card Number</label>
                <input
                  type="text"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex gap-4">
                <div className="w-1/3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Exp Month</label>
                  <select
                    value={expMonth}
                    onChange={(e) => setExpMonth(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {Array.from({length: 12}, (_, i) => {
                      const m = (i + 1).toString().padStart(2, '0');
                      return <option key={m} value={m}>{m}</option>;
                    })}
                  </select>
                </div>
                <div className="w-1/3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Exp Year</label>
                  <input
                    type="text"
                    value={expYear}
                    onChange={(e) => setExpYear(e.target.value)}
                    placeholder="YYYY"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="w-1/3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CVV</label>
                  <div className="relative">
                    <input
                      type={showCvv ? 'text' : 'password'}
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value)}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCvv(!showCvv)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showCvv ? '👁️‍🗨️' : '👁️'}
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Brand</label>
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Select Brand...</option>
                  <option value="Visa">Visa</option>
                  <option value="Mastercard">Mastercard</option>
                  <option value="Amex">American Express</option>
                  <option value="Discover">Discover</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          )}

          {/* View Mode Fields */}
          {currentMode === 'view' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-2 gap-4">
                {folderId && (
                  <div>
                    <span className="block text-xs font-semibold text-gray-500 uppercase">Folder</span>
                    <span className="text-sm text-gray-900 dark:text-white">
                      {folders.find(f => f.id === folderId)?.name || 'Unknown'}
                    </span>
                  </div>
                )}
                {favorite && (
                  <div>
                    <span className="block text-xs font-semibold text-gray-500 uppercase">Favorite</span>
                    <span className="text-sm text-yellow-500">⭐ Yes</span>
                  </div>
                )}
              </div>

              {type === 'login' && (
                <div className="space-y-4">
                  {username && (
                    <div>
                      <span className="block text-xs font-semibold text-gray-500 uppercase mb-1">Username</span>
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <span className="text-sm font-mono text-gray-900 dark:text-white truncate">{username}</span>
                        <button
                          onClick={() => copyToClipboard(username, 'user')}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors"
                        >
                          {copiedField === 'user' ? '✓' : '📋'}
                        </button>
                      </div>
                    </div>
                  )}
                  {password && (
                    <div>
                      <span className="block text-xs font-semibold text-gray-500 uppercase mb-1">Password</span>
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <span className="text-sm font-mono text-gray-900 dark:text-white truncate">
                          {showPassword ? password : '••••••••••••••••'}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowPassword(!showPassword)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                          >
                            {showPassword ? '👁️‍🗨️' : '👁️'}
                          </button>
                          <button
                            onClick={() => copyToClipboard(password, 'pass')}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors"
                          >
                            {copiedField === 'pass' ? '✓' : '📋'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {totpSecret && (
                    <div>
                      <span className="block text-xs font-semibold text-gray-500 uppercase mb-1">Authenticator Code</span>
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <span className="text-2xl font-mono tracking-widest text-indigo-600 dark:text-indigo-400">
                          {totpCode || '------'}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">{totpRemaining}s</span>
                          <button
                            onClick={() => copyToClipboard(totpCode, 'totp')}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors"
                          >
                            {copiedField === 'totp' ? '✓' : '📋'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {uris.length > 0 && uris.some(u => u.trim()) && (
                    <div>
                      <span className="block text-xs font-semibold text-gray-500 uppercase mb-1">URIs</span>
                      <div className="space-y-2">
                        {uris.filter(u => u.trim()).map((uri, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                            <a 
                              href={uri.startsWith('http') ? uri : `https://${uri}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline truncate"
                            >
                              {uri}
                            </a>
                            <button
                              onClick={() => copyToClipboard(uri, `uri-${idx}`)}
                              className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors"
                            >
                              {copiedField === `uri-${idx}` ? '✓' : '📋'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {type === 'note' && (
                <div>
                  <span className="block text-xs font-semibold text-gray-500 uppercase mb-1">Note Content</span>
                  <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg whitespace-pre-wrap text-sm text-gray-900 dark:text-white">
                    {content}
                  </div>
                </div>
              )}

              {type === 'card' && (
                <div className="space-y-4">
                  {cardholderName && (
                    <div>
                      <span className="block text-xs font-semibold text-gray-500 uppercase mb-1">Cardholder Name</span>
                      <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm text-gray-900 dark:text-white">
                        {cardholderName}
                      </div>
                    </div>
                  )}
                  {number && (
                    <div>
                      <span className="block text-xs font-semibold text-gray-500 uppercase mb-1">Card Number</span>
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <span className="text-sm font-mono text-gray-900 dark:text-white">{showCardNumber ? number : '•••• •••• •••• ' + number.slice(-4)}</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowCardNumber(!showCardNumber)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                          >
                            {showCardNumber ? '👁️‍🗨️' : '👁️'}
                          </button>
                          <button
                            onClick={() => copyToClipboard(number, 'cardnum')}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors"
                          >
                            {copiedField === 'cardnum' ? '✓' : '📋'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="block text-xs font-semibold text-gray-500 uppercase mb-1">Expiration</span>
                      <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm text-gray-900 dark:text-white">
                        {expMonth} / {expYear}
                      </div>
                    </div>
                    {cvv && (
                      <div>
                        <span className="block text-xs font-semibold text-gray-500 uppercase mb-1">CVV</span>
                        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                          <span className="text-sm font-mono text-gray-900 dark:text-white">
                            {showCvv ? cvv : '•••'}
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowCvv(!showCvv)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            >
                              {showCvv ? '👁️‍🗨️' : '👁️'}
                            </button>
                            <button
                              onClick={() => copyToClipboard(cvv, 'cvv')}
                              className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors"
                            >
                              {copiedField === 'cvv' ? '✓' : '📋'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {brand && (
                    <div>
                      <span className="block text-xs font-semibold text-gray-500 uppercase mb-1">Brand</span>
                      <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm text-gray-900 dark:text-white">
                        {brand}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Actions for View Mode */}
              <div className="pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
                {showConfirmDelete ? (
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-800 dark:text-red-300 mb-3 font-medium">Are you sure you want to delete this item? This cannot be undone.</p>
                    <div className="flex gap-3">
                      <button
                        onClick={handleDelete}
                        disabled={loading}
                        className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                      >
                        {loading ? 'Deleting...' : 'Yes, Delete'}
                      </button>
                      <button
                        onClick={() => setShowConfirmDelete(false)}
                        disabled={loading}
                        className="px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowConfirmDelete(true)}
                    className="w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors font-medium"
                  >
                    Delete Item
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
