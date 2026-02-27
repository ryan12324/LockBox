import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth.js';
import { api } from '../lib/api.js';
import { encryptVaultItem } from '../lib/crypto.js';
import { decryptString } from '@lockbox/crypto';
import type { VaultItem, LoginItem, SecureNoteItem, CardItem, IdentityItem, CustomField, Folder, VaultItemType } from '@lockbox/types';
import { totp, getRemainingSeconds, base32Decode, parseOtpAuthUri } from '@lockbox/totp';
import { generatePassword } from '@lockbox/generator';
import { SecurityAlertEngine } from '@lockbox/ai';
import type { SecurityAlert } from '@lockbox/ai';
import ItemHistoryPanel from './ItemHistoryPanel.js';
import AttachmentSection from './AttachmentSection.js';
interface ItemPanelProps {
  mode: 'view' | 'edit' | 'add';
  item: VaultItem | null;
  folders: Folder[];
  items: VaultItem[];
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function ItemPanel({ mode, item, folders, items, onSave, onDelete, onClose }: ItemPanelProps) {
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
  const [tags, setTags] = useState<string[]>(item?.tags || []);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
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
  // Identity State
  const identityItem = item?.type === 'identity' ? (item as IdentityItem) : null;
  const [firstName, setFirstName] = useState(identityItem?.firstName || '');
  const [middleName, setMiddleName] = useState(identityItem?.middleName || '');
  const [lastName, setLastName] = useState(identityItem?.lastName || '');
  const [email, setEmail] = useState(identityItem?.email || '');
  const [phone, setPhone] = useState(identityItem?.phone || '');
  const [address1, setAddress1] = useState(identityItem?.address1 || '');
  const [address2, setAddress2] = useState(identityItem?.address2 || '');
  const [city, setCity] = useState(identityItem?.city || '');
  const [stateValue, setStateValue] = useState(identityItem?.state || '');
  const [postalCode, setPostalCode] = useState(identityItem?.postalCode || '');
  const [country, setCountry] = useState(identityItem?.country || '');
  const [company, setCompany] = useState(identityItem?.company || '');
  const [ssn, setSsn] = useState(identityItem?.ssn || '');
  const [passportNumber, setPassportNumber] = useState(identityItem?.passportNumber || '');
  const [licenseNumber, setLicenseNumber] = useState(identityItem?.licenseNumber || '');

  // Custom Fields State
  const [customFields, setCustomFields] = useState<CustomField[]>(item?.customFields || []);


  // UI State
  const [showPassword, setShowPassword] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
  const [showCardNumber, setShowCardNumber] = useState(false);
  const [showSsn, setShowSsn] = useState(false);
  const [showCustomFields, setShowCustomFields] = useState<Record<number, boolean>>({});
  const [localFolders, setLocalFolders] = useState<Folder[]>(folders);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpRemaining, setTotpRemaining] = useState(0);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  // Sync state if item changes
  useEffect(() => {
    setCurrentMode(mode);
    setType(item?.type || 'login');
    setName(item?.name || '');
    setFolderId(item?.folderId || '');
    setFavorite(item?.favorite || false);
    setTags(item?.tags || []);
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
    } else if (item?.type === 'identity') {
      const iden = item as IdentityItem;
      setFirstName(iden.firstName || '');
      setMiddleName(iden.middleName || '');
      setLastName(iden.lastName || '');
      setEmail(iden.email || '');
      setPhone(iden.phone || '');
      setAddress1(iden.address1 || '');
      setAddress2(iden.address2 || '');
      setCity(iden.city || '');
      setStateValue(iden.state || '');
      setPostalCode(iden.postalCode || '');
      setCountry(iden.country || '');
      setCompany(iden.company || '');
      setSsn(iden.ssn || '');
      setPassportNumber(iden.passportNumber || '');
      setLicenseNumber(iden.licenseNumber || '');
    }
    setCustomFields(item?.customFields || []);
    setShowConfirmDelete(false);
    setShowPassword(false);
    setShowCvv(false);
    setShowCardNumber(false);
    setShowSsn(false);
    setShowCustomFields({});
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

  // Tags generation
  useEffect(() => {
    if (currentMode !== 'view') {
      import('@lockbox/ai').then((ai: any) => {
        if (typeof ai.suggestTags === 'function') {
           // Provide all necessary data for suggestion
           const data = { name, uris, type };
           Promise.resolve(ai.suggestTags(data)).then(res => setSuggestedTags(res || []));
        } else {
           setSuggestedTags(['personal', 'work', 'finance', 'shopping']);
        }
      }).catch(() => {
        setSuggestedTags(['personal', 'work', 'finance', 'shopping']);
      });
    }
  }, [currentMode, name, uris, type]);

  // Security Alerts
  useEffect(() => {
    if (currentMode === 'view' && type === 'login' && uris.length > 0 && uris[0]) {
      try {
        const engine = new SecurityAlertEngine();
        const loginItems = items.filter(i => i.type === 'login') as LoginItem[];
        const newAlerts = engine.checkUrl(uris[0], loginItems);
        // Only keep alerts for this item specifically or global ones for the url
        // Wait, checkUrl returns alerts for matching items. We want only alerts for THIS item
        // or general URL alerts like phishing/http.
        const relevantAlerts = newAlerts.filter(a => !a.itemId || a.itemId === item?.id);
        setAlerts(relevantAlerts);
      } catch (err) {
        console.warn('Failed to run security alerts:', err);
      }
    } else {
      setAlerts([]);
    }
  }, [currentMode, type, uris, items, item]);
  async function copyToClipboard(text: string, field: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  const handleSave = async () => {
    if (!session || !userKey) {
      setError('Session expired — please log in again');
      return;
    }

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
        tags: tags,
        favorite,
        createdAt: isAdd ? now : item!.createdAt,
        updatedAt: now,
        revisionDate: now,
        customFields: customFields.filter(f => f.name.trim() !== ''),
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
      } else if (type === 'identity') {
        vaultItem = {
          ...baseItem,
          type: 'identity',
          firstName,
          middleName,
          lastName,
          email,
          phone,
          address1,
          address2,
          city,
          state: stateValue,
          postalCode,
          country,
          company,
          ssn,
          passportNumber,
          licenseNumber,
        } as IdentityItem;
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

      // Encrypt with itemId + revisionDate as AAD
      const encryptedData = await encryptVaultItem(vaultItem, userKey, itemId, now);

      if (isAdd) {
        // Send client-generated id + revisionDate so AAD matches on decrypt
        await api.vault.createItem(
          { id: itemId, type, encryptedData, folderId: folderId || undefined, tags: [], favorite, revisionDate: now },
          session.token
        );
      } else {
        // Send revisionDate so server stores the same value used in AAD
        await api.vault.updateItem(
          itemId,
          { encryptedData, folderId: folderId || undefined, tags, favorite, revisionDate: now },
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

  const typeIcon = (t: string) => ({ login: '🔑', note: '📝', card: '💳', identity: '📛' }[t] ?? '📄');

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full sm:w-[450px] backdrop-blur-2xl bg-white/[0.08] shadow-[0_16px_48px_rgba(0,0,0,0.35)] border-l border-white/[0.1] z-50 flex flex-col transform transition-transform duration-300 ease-in-out translate-x-0">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/[0.1]">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{typeIcon(type)}</span>
            <h2 className="text-lg font-semibold text-white truncate max-w-[200px]">
              {currentMode === 'add' 
                ? `New ${type.charAt(0).toUpperCase() + type.slice(1)}` 
                : (name || 'Unnamed Item')}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {currentMode === 'view' ? (
              <>
                <button
                  onClick={() => setShowHistory(true)}
                  className="px-3 py-1.5 text-sm bg-white/[0.08] hover:bg-white/[0.14] text-white/70 rounded-lg transition-colors"
                >
                  History
                </button>
                <button
                  onClick={() => setCurrentMode('edit')}
                  className="px-3 py-1.5 text-sm bg-white/[0.08] hover:bg-white/[0.14] text-white/70 rounded-lg transition-colors"
                >
                  Edit
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={currentMode === 'add' ? onClose : () => setCurrentMode('view')}
                  className="px-3 py-1.5 text-sm bg-white/[0.08] hover:bg-white/[0.14] text-white/70 rounded-lg transition-colors disabled:opacity-50"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-3 py-1.5 text-sm bg-indigo-600/80 hover:bg-indigo-500/90 text-white backdrop-blur-sm rounded-lg transition-colors disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? 'Saving...' : 'Save'}
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-white/30 hover:text-white/60 rounded-lg transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-500/10 text-red-300 border border-red-400/20 text-sm rounded-lg">
              {error}
            </div>
          )}

          {currentMode === 'add' && (
            <div className="flex bg-white/[0.06] p-1 rounded-lg">
              {(['login', 'note', 'card', 'identity'] as VaultItemType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    type === t
                      ? 'bg-white/[0.12] text-white shadow-sm'
                      : 'text-white/40 hover:text-white/70'
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
                <label className="block text-sm font-medium text-white/70 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                  placeholder="e.g. My Bank"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-white/70 mb-1">Folder</label>
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
                    className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
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
                        className="flex-1 px-2 py-1.5 text-sm border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                        autoFocus
                      />
                      <button onClick={handleCreateFolder} className="px-2.5 py-1.5 text-xs bg-indigo-600/80 hover:bg-indigo-500/90 text-white rounded-lg backdrop-blur-sm">✓</button>
                      <button onClick={() => { setCreatingFolder(false); setNewFolderName(''); }} className="px-2 py-1.5 text-xs text-white/30 hover:text-white/60">✕</button>
                    </div>
                  )}
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={favorite}
                      onChange={(e) => setFavorite(e.target.checked)}
                      className="rounded border-white/20 bg-white/10 text-indigo-500 focus:ring-indigo-500/60"
                    />
                    <span className="text-sm font-medium text-white/70">Favorite</span>
                  </label>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Tags</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags.map(t => (
                    <span key={t} className="px-2 py-1 text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full flex items-center gap-1">
                      {t}
                      <button type="button" onClick={() => setTags(tags.filter(x => x !== t))} className="hover:text-white">✕</button>
                    </span>
                  ))}
                </div>
                {suggestedTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs text-white/40 self-center">Suggested:</span>
                    {suggestedTags.filter(t => !tags.includes(t)).map(t => (
                      <button type="button" key={t} onClick={() => setTags([...tags, t])} className="px-2 py-1 text-xs bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 rounded-full text-indigo-300 transition-colors">
                        + {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Type Specific Fields - Edit/Add Mode */}
          {currentMode !== 'view' && type === 'login' && (
            <div className="space-y-4 pt-4 border-t border-white/[0.1]">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Username / Email</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="flex-1 px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!session || !userKey) return;
                      try {
                        const config = await api.aliases.getConfig(session.token);
                        const plainKey = await decryptString(config.encryptedApiKey, userKey.slice(0, 32));
                        const result = await api.aliases.generate({
                          provider: config.provider,
                          apiKey: plainKey,
                          baseUrl: config.baseUrl || undefined,
                        }, session.token);
                        setUsername(result.alias.email);
                      } catch {
                        setError('Configure email aliases in Settings first');
                      }
                    }}
                    className="px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] text-white/70 rounded-lg transition-colors text-sm whitespace-nowrap"
                    title="Generate email alias"
                  >
                    🎭 Alias
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Password</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-10 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
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
                    className="px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] text-white/70 rounded-lg transition-colors text-sm"
                  >
                    Gen
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Authenticator Key (TOTP)</label>
                <input
                  type="text"
                  value={totpSecret}
                  onChange={(e) => setTotpSecret(e.target.value)}
                  placeholder="Base32 secret or otpauth:// URI"
                  className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">URIs</label>
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
                      className="flex-1 px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setUris(uris.filter((_, i) => i !== idx))}
                      className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setUris([...uris, ''])}
                  className="text-sm text-indigo-300 hover:text-indigo-200 hover:underline"
                >
                  + Add URI
                </button>
              </div>
            </div>
          )}

          {currentMode !== 'view' && type === 'note' && (
            <div className="space-y-4 pt-4 border-t border-white/[0.1]">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Secure Note</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white resize-y"
                />
              </div>
            </div>
          )}

          {currentMode !== 'view' && type === 'card' && (
            <div className="space-y-4 pt-4 border-t border-white/[0.1]">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Cardholder Name</label>
                <input
                  type="text"
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Card Number</label>
                <input
                  type="text"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                />
              </div>
              <div className="flex gap-4">
                <div className="w-1/3">
                  <label className="block text-sm font-medium text-white/70 mb-1">Exp Month</label>
                  <select
                    value={expMonth}
                    onChange={(e) => setExpMonth(e.target.value)}
                    className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                  >
                    {Array.from({length: 12}, (_, i) => {
                      const m = (i + 1).toString().padStart(2, '0');
                      return <option key={m} value={m}>{m}</option>;
                    })}
                  </select>
                </div>
                <div className="w-1/3">
                  <label className="block text-sm font-medium text-white/70 mb-1">Exp Year</label>
                  <input
                    type="text"
                    value={expYear}
                    onChange={(e) => setExpYear(e.target.value)}
                    placeholder="YYYY"
                    className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                  />
                </div>
                <div className="w-1/3">
                  <label className="block text-sm font-medium text-white/70 mb-1">CVV</label>
                  <div className="relative">
                    <input
                      type={showCvv ? 'text' : 'password'}
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value)}
                      className="w-full px-3 py-2 pr-10 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCvv(!showCvv)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                    >
                      {showCvv ? '👁️‍🗨️' : '👁️'}
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Brand</label>
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
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

          {currentMode !== 'view' && type === 'identity' && (
            <div className="space-y-4 pt-4 border-t border-white/[0.1]">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider">Personal</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1">First Name</label>
                    <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1">Middle Name</label>
                    <input type="text" value={middleName} onChange={(e) => setMiddleName(e.target.value)} className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Last Name</label>
                  <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Phone</label>
                  <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white" />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-white/[0.1]">
                <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider">Address</h3>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Address 1</label>
                  <input type="text" value={address1} onChange={(e) => setAddress1(e.target.value)} className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Address 2</label>
                  <input type="text" value={address2} onChange={(e) => setAddress2(e.target.value)} className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1">City</label>
                    <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1">State/Province</label>
                    <input type="text" value={stateValue} onChange={(e) => setStateValue(e.target.value)} className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1">Zip/Postal Code</label>
                    <input type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1">Country</label>
                    <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white" />
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-white/[0.1]">
                <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider">Company</h3>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Company Name</label>
                  <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white" />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-white/[0.1]">
                <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider">Identification</h3>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">SSN</label>
                  <div className="relative">
                    <input type={showSsn ? 'text' : 'password'} value={ssn} onChange={(e) => setSsn(e.target.value)} className="w-full px-3 py-2 pr-10 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white" />
                    <button type="button" onClick={() => setShowSsn(!showSsn)} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                      {showSsn ? '👁️‍🗨️' : '👁️'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Passport Number</label>
                  <input type="text" value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">License Number</label>
                  <input type="text" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white" />
                </div>
              </div>
            </div>
          )}

          {/* Attachments - Edit Mode */}
          {currentMode === 'edit' && item?.id && (
            <AttachmentSection itemId={item.id} mode="edit" />
          )}

          {/* Custom Fields - Edit Mode */}
          {currentMode !== 'view' && (
            <div className="space-y-4 pt-4 border-t border-white/[0.1]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider">Custom Fields</h3>
                <button
                  type="button"
                  onClick={() => setCustomFields([...customFields, { name: '', value: '', type: 'text' }])}
                  className="px-2 py-1 text-xs bg-white/[0.08] hover:bg-white/[0.14] text-white/70 rounded-md transition-colors"
                >
                  + Add
                </button>
              </div>
              
              {customFields.map((field, idx) => (
                <div key={idx} className="flex flex-col gap-2 p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={field.name}
                      onChange={(e) => {
                        const newFields = [...customFields];
                        newFields[idx].name = e.target.value;
                        setCustomFields(newFields);
                      }}
                      placeholder="Field Name"
                      className="flex-1 px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                    />
                    <select
                      value={field.type}
                      onChange={(e) => {
                        const newFields = [...customFields];
                        newFields[idx].type = e.target.value as 'text' | 'hidden' | 'boolean';
                        if (newFields[idx].type === 'boolean' && newFields[idx].value !== 'true' && newFields[idx].value !== 'false') {
                           newFields[idx].value = 'false';
                        }
                        setCustomFields(newFields);
                      }}
                      className="w-28 px-2 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white text-sm"
                    >
                      <option value="text">Text</option>
                      <option value="hidden">Hidden</option>
                      <option value="boolean">Boolean</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setCustomFields(customFields.filter((_, i) => i !== idx))}
                      className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
                    >
                      ✕
                    </button>
                  </div>
                  
                  {field.type === 'boolean' ? (
                    <label className="flex items-center gap-2 cursor-pointer mt-1">
                      <input
                        type="checkbox"
                        checked={field.value === 'true'}
                        onChange={(e) => {
                          const newFields = [...customFields];
                          newFields[idx].value = e.target.checked ? 'true' : 'false';
                          setCustomFields(newFields);
                        }}
                        className="rounded border-white/20 bg-white/10 text-indigo-500 focus:ring-indigo-500/60"
                      />
                      <span className="text-sm font-medium text-white/70">Value</span>
                    </label>
                  ) : field.type === 'hidden' ? (
                    <div className="relative">
                      <input
                        type={showCustomFields[idx] ? 'text' : 'password'}
                        value={field.value}
                        onChange={(e) => {
                          const newFields = [...customFields];
                          newFields[idx].value = e.target.value;
                          setCustomFields(newFields);
                        }}
                        placeholder="Hidden Value"
                        className="w-full px-3 py-2 pr-10 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCustomFields(prev => ({ ...prev, [idx]: !prev[idx] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                      >
                        {showCustomFields[idx] ? '👁️‍🗨️' : '👁️'}
                      </button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={field.value}
                      onChange={(e) => {
                        const newFields = [...customFields];
                        newFields[idx].value = e.target.value;
                        setCustomFields(newFields);
                      }}
                      placeholder="Value"
                      className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* View Mode Fields */}
          {currentMode === 'view' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-2 gap-4">
                {folderId && (
                  <div>
                    <span className="block text-xs font-semibold text-white/30 uppercase">Folder</span>
                    <span className="text-sm text-white">
                      {folders.find(f => f.id === folderId)?.name || 'Unknown'}
                    </span>
                  </div>
                )}
                {favorite && (
                  <div>
                    <span className="block text-xs font-semibold text-white/30 uppercase">Favorite</span>
                    <span className="text-sm text-amber-400">⭐ Yes</span>
                  </div>
                )}
              </div>

              {type === 'login' && (
                <div className="space-y-4">
                  {username && (
                    <div>
                      <span className="block text-xs font-semibold text-white/30 uppercase mb-1">Username</span>
                      <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                        <span className="text-sm font-mono text-white truncate">{username}</span>
                        <button
                          onClick={() => copyToClipboard(username, 'user')}
                          className="p-1.5 text-white/30 hover:text-indigo-300 transition-colors"
                        >
                          {copiedField === 'user' ? '✓' : '📋'}
                        </button>
                      </div>
                    </div>
                  )}
                  {password && (
                    <div>
                      <span className="block text-xs font-semibold text-white/30 uppercase mb-1">Password</span>
                      <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                        <span className="text-sm font-mono text-white truncate">
                          {showPassword ? password : '••••••••••••••••'}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowPassword(!showPassword)}
                            className="p-1.5 text-white/40 hover:text-white/70 transition-colors"
                          >
                            {showPassword ? '👁️‍🗨️' : '👁️'}
                          </button>
                          <button
                            onClick={() => copyToClipboard(password, 'pass')}
                            className="p-1.5 text-white/30 hover:text-indigo-300 transition-colors"
                          >
                            {copiedField === 'pass' ? '✓' : '📋'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {totpSecret && (
                    <div>
                      <span className="block text-xs font-semibold text-white/30 uppercase mb-1">Authenticator Code</span>
                      <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                        <span className="text-2xl font-mono tracking-widest text-indigo-300">
                          {totpCode || '------'}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-white/30">{totpRemaining}s</span>
                          <button
                            onClick={() => copyToClipboard(totpCode, 'totp')}
                            className="p-1.5 text-white/30 hover:text-indigo-300 transition-colors"
                          >
                            {copiedField === 'totp' ? '✓' : '📋'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {uris.length > 0 && uris.some(u => u.trim()) && (
                    <div>
                      <span className="block text-xs font-semibold text-white/30 uppercase mb-1">URIs</span>
                      <div className="space-y-2">
                        {uris.filter(u => u.trim()).map((uri, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                            <a 
                              href={uri.startsWith('http') ? uri : `https://${uri}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-indigo-300 hover:text-indigo-200 hover:underline truncate"
                            >
                              {uri}
                            </a>
                            <button
                              onClick={() => copyToClipboard(uri, `uri-${idx}`)}
                              className="p-1.5 text-white/30 hover:text-indigo-300 transition-colors"
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
                  <span className="block text-xs font-semibold text-white/30 uppercase mb-1">Note Content</span>
                  <div className="p-4 bg-white/[0.04] rounded-lg border border-white/[0.06] whitespace-pre-wrap text-sm text-white">
                    {content}
                  </div>
                </div>
              )}

              {type === 'card' && (
                <div className="space-y-4">
                  {cardholderName && (
                    <div>
                      <span className="block text-xs font-semibold text-white/30 uppercase mb-1">Cardholder Name</span>
                      <div className="p-3 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-white">
                        {cardholderName}
                      </div>
                    </div>
                  )}
                  {number && (
                    <div>
                      <span className="block text-xs font-semibold text-white/30 uppercase mb-1">Card Number</span>
                      <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                        <span className="text-sm font-mono text-white">{showCardNumber ? number : '•••• •••• •••• ' + number.slice(-4)}</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowCardNumber(!showCardNumber)}
                            className="p-1.5 text-white/40 hover:text-white/70 transition-colors"
                          >
                            {showCardNumber ? '👁️‍🗨️' : '👁️'}
                          </button>
                          <button
                            onClick={() => copyToClipboard(number, 'cardnum')}
                            className="p-1.5 text-white/30 hover:text-indigo-300 transition-colors"
                          >
                            {copiedField === 'cardnum' ? '✓' : '📋'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="block text-xs font-semibold text-white/30 uppercase mb-1">Expiration</span>
                      <div className="p-3 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-white">
                        {expMonth} / {expYear}
                      </div>
                    </div>
                    {cvv && (
                      <div>
                        <span className="block text-xs font-semibold text-white/30 uppercase mb-1">CVV</span>
                        <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                          <span className="text-sm font-mono text-white">
                            {showCvv ? cvv : '•••'}
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowCvv(!showCvv)}
                              className="p-1.5 text-white/40 hover:text-white/70 transition-colors"
                            >
                              {showCvv ? '👁️‍🗨️' : '👁️'}
                            </button>
                            <button
                              onClick={() => copyToClipboard(cvv, 'cvv')}
                              className="p-1.5 text-white/30 hover:text-indigo-300 transition-colors"
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
                      <span className="block text-xs font-semibold text-white/30 uppercase mb-1">Brand</span>
                      <div className="p-3 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-white">
                        {brand}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {type === 'identity' && (
                <div className="space-y-4">
                  {(firstName || middleName || lastName) && (
                    <div>
                      <span className="block text-xs font-semibold text-white/30 uppercase mb-1">Name</span>
                      <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                        <span className="text-sm font-medium text-white">{[firstName, middleName, lastName].filter(Boolean).join(' ')}</span>
                        <button onClick={() => copyToClipboard([firstName, middleName, lastName].filter(Boolean).join(' '), 'fullname')} className="p-1.5 text-white/30 hover:text-indigo-300 transition-colors">
                          {copiedField === 'fullname' ? '✓' : '📋'}
                        </button>
                      </div>
                    </div>
                  )}
                  {email && (
                    <div>
                      <span className="block text-xs font-semibold text-white/30 uppercase mb-1">Email</span>
                      <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                        <span className="text-sm text-white">{email}</span>
                        <button onClick={() => copyToClipboard(email, 'email')} className="p-1.5 text-white/30 hover:text-indigo-300 transition-colors">
                          {copiedField === 'email' ? '✓' : '📋'}
                        </button>
                      </div>
                    </div>
                  )}
                  {phone && (
                    <div>
                      <span className="block text-xs font-semibold text-white/30 uppercase mb-1">Phone</span>
                      <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                        <span className="text-sm text-white">{phone}</span>
                        <button onClick={() => copyToClipboard(phone, 'phone')} className="p-1.5 text-white/30 hover:text-indigo-300 transition-colors">
                          {copiedField === 'phone' ? '✓' : '📋'}
                        </button>
                      </div>
                    </div>
                  )}
                  {(address1 || address2 || city || stateValue || postalCode || country) && (
                    <div>
                      <span className="block text-xs font-semibold text-white/30 uppercase mb-1">Address</span>
                      <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                        <div className="text-sm text-white space-y-1">
                          {address1 && <p>{address1}</p>}
                          {address2 && <p>{address2}</p>}
                          {(city || stateValue || postalCode) && <p>{[city, stateValue, postalCode].filter(Boolean).join(', ')}</p>}
                          {country && <p>{country}</p>}
                        </div>
                        <button onClick={() => copyToClipboard([address1, address2, [city, stateValue, postalCode].filter(Boolean).join(', '), country].filter(Boolean).join('\n'), 'address')} className="p-1.5 text-white/30 hover:text-indigo-300 transition-colors self-start">
                          {copiedField === 'address' ? '✓' : '📋'}
                        </button>
                      </div>
                    </div>
                  )}
                  {company && (
                    <div>
                      <span className="block text-xs font-semibold text-white/30 uppercase mb-1">Company</span>
                      <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                        <span className="text-sm text-white">{company}</span>
                        <button onClick={() => copyToClipboard(company, 'company')} className="p-1.5 text-white/30 hover:text-indigo-300 transition-colors">
                          {copiedField === 'company' ? '✓' : '📋'}
                        </button>
                      </div>
                    </div>
                  )}
                  {ssn && (
                    <div>
                      <span className="block text-xs font-semibold text-white/30 uppercase mb-1">SSN</span>
                      <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                        <span className="text-sm font-mono text-white">{showSsn ? ssn : '•••-••-••••'}</span>
                        <div className="flex gap-2">
                          <button onClick={() => setShowSsn(!showSsn)} className="p-1.5 text-white/40 hover:text-white/70 transition-colors">
                            {showSsn ? '👁️‍🗨️' : '👁️'}
                          </button>
                          <button onClick={() => copyToClipboard(ssn, 'ssn')} className="p-1.5 text-white/30 hover:text-indigo-300 transition-colors">
                            {copiedField === 'ssn' ? '✓' : '📋'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {passportNumber && (
                    <div>
                      <span className="block text-xs font-semibold text-white/30 uppercase mb-1">Passport Number</span>
                      <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                        <span className="text-sm font-mono text-white">{passportNumber}</span>
                        <button onClick={() => copyToClipboard(passportNumber, 'passport')} className="p-1.5 text-white/30 hover:text-indigo-300 transition-colors">
                          {copiedField === 'passport' ? '✓' : '📋'}
                        </button>
                      </div>
                    </div>
                  )}
                  {licenseNumber && (
                    <div>
                      <span className="block text-xs font-semibold text-white/30 uppercase mb-1">License Number</span>
                      <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                        <span className="text-sm font-mono text-white">{licenseNumber}</span>
                        <button onClick={() => copyToClipboard(licenseNumber, 'license')} className="p-1.5 text-white/30 hover:text-indigo-300 transition-colors">
                          {copiedField === 'license' ? '✓' : '📋'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Attachments - View Mode */}
              {currentMode === 'view' && item?.id && (
                <AttachmentSection itemId={item.id} mode="view" />
              )}

              {/* Custom Fields - View Mode */}
              {customFields.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-white/[0.1]">
                  <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Custom Fields</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {customFields.map((field, idx) => (
                      <div key={idx}>
                        <span className="block text-xs font-semibold text-white/30 uppercase mb-1">{field.name}</span>
                        <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                          {field.type === 'boolean' ? (
                            <span className="text-sm text-white">{field.value === 'true' ? 'Yes' : 'No'}</span>
                          ) : field.type === 'hidden' ? (
                            <span className="text-sm font-mono text-white">{showCustomFields[idx] ? field.value : '••••••••'}</span>
                          ) : (
                            <span className="text-sm text-white whitespace-pre-wrap">{field.value}</span>
                          )}
                          <div className="flex gap-2">
                            {field.type === 'hidden' && (
                              <button onClick={() => setShowCustomFields(prev => ({ ...prev, [idx]: !prev[idx] }))} className="p-1.5 text-white/40 hover:text-white/70 transition-colors">
                                {showCustomFields[idx] ? '👁️‍🗨️' : '👁️'}
                              </button>
                            )}
                            <button onClick={() => copyToClipboard(field.value, `cf-${idx}`)} className="p-1.5 text-white/30 hover:text-indigo-300 transition-colors">
                              {copiedField === `cf-${idx}` ? '✓' : '📋'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {alerts.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-white/[0.1]">
                  <span className="block text-xs font-semibold text-white/30 uppercase mb-2">Security Alerts</span>
                  {alerts.filter(a => !dismissedAlerts.has(a.title)).map((alert, i) => {
                    const isCritical = alert.severity === 'critical';
                    const isWarning = alert.severity === 'warning';
                    return (
                      <div key={i} className={`p-4 rounded-xl border flex items-start gap-3 backdrop-blur-md ${
                        isCritical ? 'bg-red-500/10 border-red-500/30 text-red-100' :
                        isWarning ? 'bg-amber-500/10 border-amber-500/30 text-amber-100' :
                        'bg-blue-500/10 border-blue-500/30 text-blue-100'
                      }`}>
                        <div className="text-xl">
                          {isCritical ? '🛡️' : isWarning ? '⚠️' : 'ℹ️'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <h4 className={`font-medium text-sm ${
                              isCritical ? 'text-red-300' : isWarning ? 'text-amber-300' : 'text-blue-300'
                            }`}>{alert.title}</h4>
                            {alert.dismissible && (
                              <button 
                                onClick={() => setDismissedAlerts(prev => new Set([...prev, alert.title]))}
                                className="text-white/40 hover:text-white/80 p-1 -mr-2 -mt-2"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          <p className="text-sm mt-1 opacity-80 leading-relaxed">{alert.message}</p>
                          {alert.action && (
                            <button
                              onClick={() => {
                                if (alert.action?.type === 'generate-password') {
                                  setCurrentMode('edit');
                                  setType('login');
                                  const pw = generatePassword({ length: 20, uppercase: true, lowercase: true, digits: true, symbols: true });
                                  setPassword(pw);
                                  setShowPassword(true);
                                }
                              }}
                              className={`mt-3 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                isCritical ? 'bg-red-500/20 hover:bg-red-500/30 text-red-200' :
                                isWarning ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200' :
                                'bg-blue-500/20 hover:bg-blue-500/30 text-blue-200'
                              }`}
                            >
                              {alert.action.label}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bottom Actions for View Mode */}
              <div className="pt-6 mt-6 border-t border-white/[0.1]">
                {showConfirmDelete ? (
                  <div className="p-4 bg-red-500/10 border border-red-400/20 rounded-lg">
                    <p className="text-sm text-red-300 mb-3 font-medium">Are you sure you want to delete this item? This cannot be undone.</p>
                    <div className="flex gap-3">
                      <button
                        onClick={handleDelete}
                        disabled={loading}
                        className="px-3 py-1.5 text-sm bg-red-500/80 hover:bg-red-400/90 text-white rounded-lg transition-colors disabled:opacity-50"
                      >
                        {loading ? 'Deleting...' : 'Yes, Delete'}
                      </button>
                      <button
                        onClick={() => setShowConfirmDelete(false)}
                        disabled={loading}
                        className="px-3 py-1.5 text-sm bg-white/[0.06] border border-white/[0.12] text-white/70 rounded-lg transition-colors hover:bg-white/[0.1]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowConfirmDelete(true)}
                    className="w-full px-4 py-2 text-sm text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors font-medium"
                  >
                    Delete Item
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {showHistory && item?.id && (
        <ItemHistoryPanel
          itemId={item.id}
          onClose={() => setShowHistory(false)}
          onRestore={() => {
            setShowHistory(false);
            onSave();
          }}
        />
      )}
    </>
  );
}
