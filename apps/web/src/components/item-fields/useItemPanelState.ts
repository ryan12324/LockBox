import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/auth.js';
import { api } from '../../lib/api.js';
import { encryptVaultItem } from '../../lib/crypto.js';
import { copyWithFeedback } from '../../lib/copy-utils.js';
import { decryptString } from '@lockbox/crypto';
import { useToast } from '../../providers/ToastProvider.js';
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
import { totp, getRemainingSeconds, base32Decode, parseOtpAuthUri } from '@lockbox/totp';
import { generatePassword } from '@lockbox/generator';
import { SecurityAlertEngine } from '@lockbox/ai';
import type { SecurityAlert } from '@lockbox/ai';

interface UseItemPanelStateArgs {
  mode: 'view' | 'edit' | 'add';
  item: VaultItem | null;
  folders: Folder[];
  items: VaultItem[];
  onSave: () => void;
  onDelete: () => void;
}

export function useItemPanelState({
  mode,
  item,
  folders,
  items,
  onSave,
  onDelete,
}: UseItemPanelStateArgs) {
  const { session, userKey } = useAuthStore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentMode, setCurrentMode] = useState(mode);
  const [type, setType] = useState<VaultItemType>(item?.type || 'login');
  const [loading, setLoading] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [name, setName] = useState(item?.name || '');
  const [folderId, setFolderId] = useState(item?.folderId || '');
  const [favorite, setFavorite] = useState(item?.favorite || false);
  const [tags, setTags] = useState<string[]>(item?.tags || []);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);

  const loginItem = item?.type === 'login' ? (item as LoginItem) : null;
  const [username, setUsername] = useState(loginItem?.username || '');
  const [password, setPassword] = useState(loginItem?.password || '');
  const [uris, setUris] = useState<string[]>(loginItem?.uris || ['']);
  const [totpSecret, setTotpSecret] = useState(loginItem?.totp || '');

  const noteItem = item?.type === 'note' ? (item as SecureNoteItem) : null;
  const [content, setContent] = useState(noteItem?.content || '');

  const cardItem = item?.type === 'card' ? (item as CardItem) : null;
  const [cardholderName, setCardholderName] = useState(cardItem?.cardholderName || '');
  const [number, setNumber] = useState(cardItem?.number || '');
  const [expMonth, setExpMonth] = useState(cardItem?.expMonth || '01');
  const [expYear, setExpYear] = useState(cardItem?.expYear || new Date().getFullYear().toString());
  const [cvv, setCvv] = useState(cardItem?.cvv || '');
  const [brand, setBrand] = useState(cardItem?.brand || '');

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

  const passkeyItem = item?.type === 'passkey' ? (item as PasskeyItem) : null;
  const [rpId, setRpId] = useState(passkeyItem?.rpId || '');
  const [rpName, setRpName] = useState(passkeyItem?.rpName || '');
  const [passkeyUserName, setPasskeyUserName] = useState(passkeyItem?.userName || '');
  const [passkeyUserId, setPasskeyUserId] = useState(passkeyItem?.userId || '');
  const [credentialId, setCredentialId] = useState(passkeyItem?.credentialId || '');
  const [publicKey, setPublicKey] = useState(passkeyItem?.publicKey || '');
  const [counter, setCounter] = useState(passkeyItem?.counter || 0);

  const documentItem = item?.type === 'document' ? (item as DocumentItem) : null;
  const [description, setDescription] = useState(documentItem?.description || '');
  const [mimeType, setMimeType] = useState(documentItem?.mimeType || '');
  const [fileSize, setFileSize] = useState(documentItem?.size || 0);
  const [isDragging, setIsDragging] = useState(false);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentQuota, setDocumentQuota] = useState<{
    used: number;
    limit: number;
  } | null>(null);

  const [customFields, setCustomFields] = useState<CustomField[]>(item?.customFields || []);
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
  const [showShareModal, setShowShareModal] = useState(false);

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
      setContent((item as SecureNoteItem).content || '');
    } else if (item?.type === 'card') {
      const c = item as CardItem;
      setCardholderName(c.cardholderName || '');
      setNumber(c.number || '');
      setExpMonth(c.expMonth || '01');
      setExpYear(c.expYear || new Date().getFullYear().toString());
      setCvv(c.cvv || '');
      setBrand(c.brand || '');
    } else if (item?.type === 'identity') {
      const i = item as IdentityItem;
      setFirstName(i.firstName || '');
      setMiddleName(i.middleName || '');
      setLastName(i.lastName || '');
      setEmail(i.email || '');
      setPhone(i.phone || '');
      setAddress1(i.address1 || '');
      setAddress2(i.address2 || '');
      setCity(i.city || '');
      setStateValue(i.state || '');
      setPostalCode(i.postalCode || '');
      setCountry(i.country || '');
      setCompany(i.company || '');
      setSsn(i.ssn || '');
      setPassportNumber(i.passportNumber || '');
      setLicenseNumber(i.licenseNumber || '');
    } else if (item?.type === 'passkey') {
      const p = item as PasskeyItem;
      setRpId(p.rpId || '');
      setRpName(p.rpName || '');
      setPasskeyUserName(p.userName || '');
      setPasskeyUserId(p.userId || '');
      setCredentialId(p.credentialId || '');
      setPublicKey(p.publicKey || '');
      setCounter(p.counter || 0);
    } else if (item?.type === 'document') {
      const d = item as DocumentItem;
      setDescription(d.description || '');
      setMimeType(d.mimeType || '');
      setFileSize(d.size || 0);
    }
    setCustomFields(item?.customFields || []);
    setShowConfirmDelete(false);
    setShowPassword(false);
    setShowCvv(false);
    setShowCardNumber(false);
    setShowSsn(false);
    setShowCustomFields({});
    setLocalFolders(folders);
    setCreatingFolder(false);
    setNewFolderName('');
  }, [mode, item]);

  useEffect(() => {
    if (currentMode !== 'view' || type !== 'login' || !totpSecret) return;
    let intervalId: ReturnType<typeof setInterval>;
    const go = async () => {
      try {
        let s: Uint8Array,
          period = 30;
        if (totpSecret.startsWith('otpauth://')) {
          const p = parseOtpAuthUri(totpSecret);
          s = p.secret;
          period = p.period || 30;
        } else {
          s = base32Decode(totpSecret);
        }
        setTotpCode(await totp(s, Date.now(), { period }));
        setTotpRemaining(getRemainingSeconds(period));
      } catch {
        setTotpCode('Invalid secret');
        setTotpRemaining(0);
      }
    };
    go();
    intervalId = setInterval(go, 1000);
    return () => clearInterval(intervalId);
  }, [currentMode, type, totpSecret]);

  useEffect(() => {
    if (currentMode !== 'view') {
      import('@lockbox/ai')
        .then((ai: any) => {
          if (typeof ai.suggestTags === 'function')
            Promise.resolve(ai.suggestTags({ name, uris, type })).then((r) =>
              setSuggestedTags(r || [])
            );
          else setSuggestedTags(['personal', 'work', 'finance', 'shopping']);
        })
        .catch(() => setSuggestedTags(['personal', 'work', 'finance', 'shopping']));
    }
  }, [currentMode, name, uris, type]);

  useEffect(() => {
    if (currentMode === 'view' && type === 'login' && uris.length > 0 && uris[0]) {
      try {
        const e = new SecurityAlertEngine();
        setAlerts(
          e
            .checkUrl(uris[0], items.filter((i) => i.type === 'login') as LoginItem[])
            .filter((a) => !a.itemId || a.itemId === item?.id)
        );
      } catch {
        /* empty */
      }
    } else setAlerts([]);
  }, [currentMode, type, uris, items, item]);

  async function copyToClipboard(text: string, field: string, element?: HTMLElement | null) {
    if (!text) return;
    await copyWithFeedback(text, element);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  const handleGenerateAlias = async () => {
    if (!session || !userKey) return;
    try {
      const cfg = await api.aliases.getConfig(session.token);
      const key = await decryptString(cfg.encryptedApiKey, userKey.slice(0, 32));
      const r = await api.aliases.generate(
        { provider: cfg.provider, apiKey: key, baseUrl: cfg.baseUrl || undefined },
        session.token
      );
      setUsername(r.alias.email);
    } catch {
      toast('Configure email aliases in Settings first', 'error');
    }
  };

  const handleGeneratePassword = () => {
    const pw = generatePassword({
      length: 20,
      uppercase: true,
      lowercase: true,
      digits: true,
      symbols: true,
    });
    setPassword(pw);
    setShowPassword(true);
  };

  const handleAlertAction = (t: string) => {
    if (t === 'generate-password') {
      setCurrentMode('edit');
      setType('login');
      handleGeneratePassword();
    }
  };

  const handleFileDrop = (f: File) => {
    setDocumentFile(f);
    setMimeType(f.type || 'application/octet-stream');
    setFileSize(f.size);
  };

  async function handleCreateFolder() {
    if (!session || !newFolderName.trim()) return;
    try {
      const r = (await api.vault.createFolder({ name: newFolderName.trim() }, session.token)) as {
        folder: Folder;
      };
      setLocalFolders((p) => [...p, r.folder]);
      setFolderId(r.folder.id);
      setCreatingFolder(false);
      setNewFolderName('');
    } catch (e) {
      console.error('Failed to create folder:', e);
    }
  }

  function buildVaultItem(id: string, now: string): VaultItem {
    const b = {
      id,
      type,
      name,
      folderId: folderId || undefined,
      tags,
      favorite,
      createdAt: currentMode === 'add' ? now : item!.createdAt,
      updatedAt: now,
      revisionDate: now,
      customFields: customFields.filter((f) => f.name.trim() !== ''),
    };
    switch (type) {
      case 'login':
        return {
          ...b,
          type: 'login',
          username,
          password,
          uris: uris.filter((u) => u.trim()),
          totp: totpSecret || undefined,
        } as LoginItem;
      case 'note':
        return { ...b, type: 'note', content } as SecureNoteItem;
      case 'identity':
        return {
          ...b,
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
      case 'passkey':
        return {
          ...b,
          type: 'passkey',
          rpId,
          rpName,
          userId: passkeyUserId,
          userName: passkeyUserName,
          credentialId,
          publicKey,
          counter,
          transports: [],
          createdAt: passkeyItem?.createdAt || now,
        } as PasskeyItem;
      case 'document':
        return {
          ...b,
          type: 'document',
          description: description || undefined,
          mimeType: mimeType || 'application/octet-stream',
          size: fileSize,
          tags,
        } as VaultItem;
      default:
        return {
          ...b,
          type: 'card',
          cardholderName,
          number,
          expMonth,
          expYear,
          cvv,
          brand: brand || undefined,
        } as CardItem;
    }
  }

  const handleSave = async () => {
    if (!session || !userKey) return toast('Session expired — please log in again', 'error');
    if (!name.trim()) return toast('Name is required', 'error');
    if (type === 'login' && !username.trim() && !password.trim())
      return toast('Username or password is required', 'error');
    if (type === 'card' && !number.trim()) return toast('Card number is required', 'error');
    if (type === 'card' && (!expMonth || !expYear.trim()))
      return toast('Expiration date is required', 'error');
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const isAdd = currentMode === 'add';
      const itemId = isAdd ? crypto.randomUUID() : item!.id;
      const enc = await encryptVaultItem(buildVaultItem(itemId, now), userKey, itemId, now);
      if (isAdd)
        await api.vault.createItem(
          {
            id: itemId,
            type,
            encryptedData: enc,
            folderId: folderId || undefined,
            tags: [],
            favorite,
            revisionDate: now,
          },
          session.token
        );
      else
        await api.vault.updateItem(
          itemId,
          {
            encryptedData: enc,
            folderId: folderId || undefined,
            tags,
            favorite,
            revisionDate: now,
          },
          session.token
        );
      onSave();
    } catch (err) {
      console.error('Failed to save item:', err);
      toast(err instanceof Error ? err.message : 'Failed to save item', 'error');
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
      toast(err instanceof Error ? err.message : 'Failed to delete item', 'error');
      setLoading(false);
    }
  };

  const typeIcon =
    { login: '🔑', note: '📝', card: '💳', identity: '📛', passkey: '🗝️', document: '📄' }[type] ??
    '📄';

  const clip = { copiedField, copyToClipboard };

  return {
    fileInputRef,
    currentMode,
    setCurrentMode,
    type,
    setType,
    loading,
    showConfirmDelete,
    setShowConfirmDelete,
    name,
    setName,
    folderId,
    setFolderId,
    favorite,
    setFavorite,
    tags,
    setTags,
    suggestedTags,
    content,
    setContent,
    customFields,
    setCustomFields,
    showCustomFields,
    setShowCustomFields,
    localFolders,
    creatingFolder,
    setCreatingFolder,
    newFolderName,
    setNewFolderName,
    alerts,
    dismissedAlerts,
    setDismissedAlerts,
    showHistory,
    setShowHistory,
    showShareModal,
    setShowShareModal,
    typeIcon,
    handleSave,
    handleDelete,
    handleCreateFolder,
    handleAlertAction,
    handleFileDrop,
    handleGeneratePassword,
    loginP: {
      username,
      setUsername,
      password,
      setPassword,
      showPassword,
      setShowPassword,
      uris,
      setUris,
      totpSecret,
      setTotpSecret,
      totpCode,
      totpRemaining,
      ...clip,
      onGenerateAlias: handleGenerateAlias,
      onGeneratePassword: handleGeneratePassword,
      onRotatePassword: undefined as unknown as () => void,
    },
    cardP: {
      cardholderName,
      setCardholderName,
      number,
      setNumber,
      expMonth,
      setExpMonth,
      expYear,
      setExpYear,
      cvv,
      setCvv,
      brand,
      setBrand,
      showCvv,
      setShowCvv,
      showCardNumber,
      setShowCardNumber,
      ...clip,
    },
    idP: {
      firstName,
      setFirstName,
      middleName,
      setMiddleName,
      lastName,
      setLastName,
      email,
      setEmail,
      phone,
      setPhone,
      address1,
      setAddress1,
      address2,
      setAddress2,
      city,
      setCity,
      stateValue,
      setStateValue,
      postalCode,
      setPostalCode,
      country,
      setCountry,
      company,
      setCompany,
      ssn,
      setSsn,
      showSsn,
      setShowSsn,
      passportNumber,
      setPassportNumber,
      licenseNumber,
      setLicenseNumber,
      ...clip,
    },
    pkP: {
      rpId,
      setRpId,
      rpName,
      setRpName,
      passkeyUserName,
      setPasskeyUserName,
      passkeyUserId,
      setPasskeyUserId,
      credentialId,
      setCredentialId,
      publicKey,
      setPublicKey,
      counter,
      setCounter,
      passkeyCreatedAt: passkeyItem?.createdAt,
      passkeyTransports: passkeyItem?.transports,
      ...clip,
    },
    docP: {
      description,
      setDescription,
      mimeType,
      fileSize,
      isDragging,
      setIsDragging,
      documentFile,
      documentQuota,
      onBrowse: () => fileInputRef.current?.click(),
      onFileDrop: handleFileDrop,
    },
    cfP: { customFields, setCustomFields, showCustomFields, setShowCustomFields, ...clip },
  };
}
