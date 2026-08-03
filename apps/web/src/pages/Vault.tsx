import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Icon,
  Input,
  Select,
  SiteFavicon,
  getEntryFaviconSources,
  type IconName,
} from '@lockbox/design';
import type {
  VaultItem,
  EncryptedVaultItem,
  PasskeyItem,
  LoginItem,
  SecureNoteItem,
  CardItem,
  IdentityItem,
  DocumentItem,
} from '@lockbox/types';
import { useAuthStore } from '../store/auth.js';
import { useSearchStore } from '../store/search.js';
import { useVaultFilterStore } from '../store/vault.js';
import { useToast } from '../providers/ToastProvider.js';
import { api } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import { copyWithFeedback } from '../lib/copy-utils.js';
import { syncNativeAutofillIndex } from '../lib/native-autofill.js';
import { syncPendingNativeCredentialSaves } from '../lib/native-credential-save-sync.js';
import { syncPendingNativePasskeys } from '../lib/native-passkey-sync.js';
import { fetchFreshVaultItem } from '../lib/vault-freshness.js';
import ItemPanel from '../components/ItemPanel.js';
import NativeAutofillSetup from '../components/NativeAutofillSetup.js';
import NativeTotpSetupPrompt from '../components/NativeTotpSetupPrompt.js';

const typeLabels: Record<string, string> = {
  login: 'Login',
  card: 'Card',
  note: 'Secure note',
  identity: 'Identity',
  passkey: 'Passkey',
  document: 'Document',
};

const typeIcons: Record<string, IconName> = {
  login: 'key',
  note: 'note',
  card: 'credit-card',
  identity: 'id',
  passkey: 'fingerprint',
  document: 'file-description',
};

const typeOptions = [
  { value: '', label: 'All types' },
  { value: 'login', label: 'Logins' },
  { value: 'card', label: 'Cards' },
  { value: 'note', label: 'Secure notes' },
  { value: 'identity', label: 'Identities' },
  { value: 'passkey', label: 'Passkeys' },
  { value: 'document', label: 'Documents' },
];

function getSecondaryText(item: VaultItem): string {
  switch (item.type) {
    case 'login':
      return (item as LoginItem).username ?? '';
    case 'passkey': {
      const passkey = item as PasskeyItem;
      return passkey.userName ? `${passkey.rpName} · ${passkey.userName}` : passkey.rpName;
    }
    case 'card': {
      const card = item as CardItem;
      return card.brand
        ? `${card.brand} ·••• ${card.number.slice(-4)}`
        : `•••• ${card.number.slice(-4)}`;
    }
    case 'identity': {
      const identity = item as IdentityItem;
      return [identity.firstName, identity.lastName].filter(Boolean).join(' ') || identity.email || '';
    }
    default:
      return '';
  }
}

function getPreviewText(item: VaultItem): string | null {
  if (item.type === 'note') {
    const content = (item as SecureNoteItem).content;
    if (content) return content.length > 100 ? `${content.slice(0, 100)}…` : content;
  }
  if (item.type === 'document') {
    const description = (item as DocumentItem).description;
    if (description) return description.length > 100 ? `${description.slice(0, 100)}…` : description;
  }
  return null;
}

export default function Vault() {
  const { session, userKey } = useAuthStore();
  const { toast } = useToast();
  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [refreshingItemId, setRefreshingItemId] = useState<string | null>(null);
  const [corruptItems, setCorruptItems] = useState<EncryptedVaultItem[]>([]);
  const [deletingCorruptId, setDeletingCorruptId] = useState<string | null>(null);
  const [panelState, setPanelState] = useState<{
    mode: 'view' | 'edit' | 'add';
    item: VaultItem | null;
  } | null>(null);

  const {
    query: search,
    searching,
    results: searchResults,
    indexed,
    search: performSearch,
    indexItems,
  } = useSearchStore();
  const {
    selectedFolder,
    selectedType,
    showFavorites,
    folders,
    setFolders,
    setSelectedFolder,
    setSelectedType,
    setShowFavorites,
    lastUpdated,
  } = useVaultFilterStore();

  const loadVault = useCallback(async () => {
    if (!session || !userKey) return;
    setLoading(true);
    setLoadError(false);
    try {
      const response = await api.vault.list(session.token);
      setFolders(response.folders);

      const decrypted: VaultItem[] = [];
      const corrupt: EncryptedVaultItem[] = [];
      await Promise.all(
        response.items
          .filter((item) => !item.deletedAt)
          .map(async (item) => {
            try {
              decrypted.push(
                await decryptVaultItem(item.encryptedData, userKey, item.id, item.revisionDate)
              );
            } catch {
              corrupt.push(item);
            }
          })
      );

      decrypted.sort((a, b) => a.name.localeCompare(b.name));
      setItems(decrypted);
      setCorruptItems(corrupt);
      void indexItems(decrypted);
      void (async () => {
        let nativeItems = decrypted;
        const existingItemIds = response.items
          .filter((item) => !item.deletedAt)
          .map((item) => item.id);

        try {
          const saveResult = await syncPendingNativeCredentialSaves({
            items: nativeItems,
            existingItemIds,
            accountId: session.userId,
            token: session.token,
            userKey,
          });
          if (saveResult.changedItems.length > 0) {
            const changedById = new Map(
              saveResult.changedItems.map((item) => [item.id, item] as const)
            );
            nativeItems = [
              ...nativeItems.map((item) => changedById.get(item.id) ?? item),
              ...saveResult.changedItems.filter(
                (item) => !nativeItems.some((candidate) => candidate.id === item.id)
              ),
            ].sort((a, b) => a.name.localeCompare(b.name));
            setItems(nativeItems);
            void indexItems(nativeItems);
          }
          if (saveResult.syncedCount > 0) {
            toast(
              `${saveResult.syncedCount} device ${saveResult.syncedCount === 1 ? 'login was' : 'logins were'} saved to your encrypted vault.`,
              'success'
            );
          }
          if (saveResult.remainingCount > 0) {
            toast('A device-saved login is still protected here and will retry.', 'warning');
          }
        } catch {
          toast('Device-saved login import will retry the next time you unlock.', 'warning');
        }

        try {
          await syncNativeAutofillIndex(nativeItems, session.userId, userKey);
        } catch {
          toast('Vault loaded, but device autofill and passkeys could not refresh yet.', 'warning');
        }

        try {
          const syncResult = await syncPendingNativePasskeys({
            items: nativeItems,
            existingItemIds: [
              ...existingItemIds,
              ...nativeItems.map((item) => item.id),
            ],
            token: session.token,
            userKey,
          });
          if (syncResult.addedItems.length > 0) {
            const merged = [...nativeItems, ...syncResult.addedItems]
              .sort((a, b) => a.name.localeCompare(b.name));
            setItems(merged);
            void indexItems(merged);
          }
          if (syncResult.syncedCount > 0) {
            toast(
              `${syncResult.syncedCount} device ${syncResult.syncedCount === 1 ? 'passkey' : 'passkeys'} synced to your encrypted vault.`,
              'success'
            );
          }
          if (syncResult.remainingCount > 0) {
            toast('Your passkey is still safe on this device and will sync after biometric approval.', 'warning');
          }
        } catch {
          toast('Device passkey sync will retry the next time you unlock your vault.', 'warning');
        }
      })();
    } catch {
      setLoadError(true);
      toast('Your vault could not be loaded. Check your connection and try again.', 'error');
    } finally {
      setLoading(false);
    }
  }, [indexItems, session, setFolders, toast, userKey]);

  useEffect(() => {
    void loadVault();
  }, [loadVault, lastUpdated]);

  useEffect(() => {
    const refreshPendingDeviceChanges = () => {
      if (document.visibilityState === 'visible') void loadVault();
    };
    document.addEventListener('visibilitychange', refreshPendingDeviceChanges);
    return () => document.removeEventListener('visibilitychange', refreshPendingDeviceChanges);
  }, [loadVault]);

  useEffect(() => {
    if (search.trim()) window.dispatchEvent(new CustomEvent('lockbox:search'));
  }, [search]);

  const filteredItems = items.filter((item) => {
    if (search && !indexed && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedFolder && item.folderId !== selectedFolder) return false;
    if (selectedType && item.type !== selectedType) return false;
    if (showFavorites && !item.favorite) return false;
    return true;
  });

  const displayItems = (
    search && indexed
      ? searchResults
      : filteredItems.map((item) => ({ item, score: 1 }))
  ).filter((result) => {
    if (selectedFolder && result.item.folderId !== selectedFolder) return false;
    if (selectedType && result.item.type !== selectedType) return false;
    if (showFavorites && !result.item.favorite) return false;
    return true;
  });

  const folderOptions = [
    { value: '', label: 'All folders' },
    ...folders.map((folder) => ({ value: folder.id, label: folder.name })),
  ];
  const hasFilters = Boolean(search || selectedFolder || selectedType || showFavorites);

  function clearFilters() {
    void performSearch('');
    setSelectedFolder(null);
    setSelectedType(null);
    setShowFavorites(false);
  }

  async function copyToClipboard(text: string, id: string, element?: HTMLElement | null) {
    if (!text) {
      toast('This item has nothing to copy in that field.', 'warning');
      return;
    }
    try {
      await copyWithFeedback(text, element);
      setCopiedId(id);
      setTimeout(() => {
        navigator.clipboard.writeText('').catch(() => {});
        setCopiedId(null);
      }, 30_000);
    } catch {
      toast('Could not copy to the clipboard.', 'error');
    }
  }

  function commitFreshItem(freshItem: VaultItem) {
    setItems((current) =>
      current
        .map((candidate) => (candidate.id === freshItem.id ? freshItem : candidate))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  async function getFreshItem(itemId: string): Promise<VaultItem> {
    if (!session || !userKey) throw new Error('Session expired — please log in again.');
    const freshItem = await fetchFreshVaultItem(itemId, session.token, userKey);
    commitFreshItem(freshItem);
    setPanelState((current) =>
      current?.item?.id === freshItem.id ? { ...current, item: freshItem } : current
    );
    return freshItem;
  }

  async function openFreshItem(itemId: string) {
    setRefreshingItemId(itemId);
    try {
      setPanelState({ mode: 'view', item: await getFreshItem(itemId) });
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'This item could not be refreshed from the server.',
        'error'
      );
    } finally {
      setRefreshingItemId(null);
    }
  }

  async function copyFreshLoginField(
    itemId: string,
    field: 'username' | 'password',
    copyId: string,
    element: HTMLElement
  ) {
    setRefreshingItemId(itemId);
    try {
      const freshItem = await getFreshItem(itemId);
      if (freshItem.type !== 'login') throw new Error('This item is no longer a login.');
      await copyToClipboard((freshItem as LoginItem)[field] ?? '', copyId, element);
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'This item could not be refreshed from the server.',
        'error'
      );
    } finally {
      setRefreshingItemId(null);
    }
  }

  async function deleteCorruptItem(id: string) {
    if (!session) return;
    try {
      await api.vault.deleteItem(id, session.token);
      setDeletingCorruptId(null);
      toast('Undecryptable item moved to Trash.', 'success');
      await loadVault();
    } catch {
      toast('The undecryptable item could not be moved to Trash.', 'error');
    }
  }

  return (
    <div className="vault-page">
      <div className="vault-toolbar">
        <div className="vault-search">
          <Icon name="search" size={20} className="vault-search__icon" />
          <Input
            type="search"
            placeholder="Search names, usernames, sites, and tags"
            aria-label="Search vault"
            value={search}
            onChange={(event) => void performSearch(event.target.value)}
          />
          {searching && <Icon name="loader-2" size={18} className="vault-search__spinner" label="Searching" />}
        </div>
        <Button onClick={() => setPanelState({ mode: 'add', item: null })}>
          <Icon name="plus" size={20} />
          Add item
        </Button>
      </div>

      <div className="vault-filters" aria-label="Vault filters">
        <Select
          label="Item type"
          options={typeOptions}
          value={selectedType ?? ''}
          onChange={(event) => setSelectedType(event.target.value || null)}
        />
        <Select
          label="Folder"
          options={folderOptions}
          value={selectedFolder ?? ''}
          onChange={(event) => setSelectedFolder(event.target.value || null)}
        />
        <Button
          variant={showFavorites ? 'secondary' : 'ghost'}
          className="vault-filters__favorite"
          aria-pressed={showFavorites}
          onClick={() => setShowFavorites(!showFavorites)}
        >
          <Icon name="star" size={18} />
          Favorites
        </Button>
        {hasFilters && (
          <Button variant="ghost" className="vault-filters__clear" onClick={clearFilters}>
            <Icon name="x" size={18} />
            Clear filters
          </Button>
        )}
        <span className="vault-filters__status">
          <Icon name={indexed ? 'circle-check' : 'search'} size={16} />
          {indexed ? 'Local search ready' : 'Name search'}
        </span>
        {session && userKey && !loading && (
          <NativeAutofillSetup
            accountId={session.userId}
            items={items}
            userKey={userKey}
            onManualAdd={() => setPanelState({ mode: 'add', item: null })}
          />
        )}
      </div>

      {session && userKey && !loading && (
        <NativeTotpSetupPrompt
          accountId={session.userId}
          token={session.token}
          userKey={userKey}
          items={items}
          onComplete={() => void loadVault()}
        />
      )}

      <div className="vault-workspace">
        <section className="vault-list-pane" aria-label="Vault items">
          <div className="vault-list__header">
            <p>{displayItems.length} {displayItems.length === 1 ? 'item' : 'items'}</p>
            {panelState?.item && <span>Selected: {panelState.item.name}</span>}
          </div>

          <div className="vault-list__scroll">
            {loading ? (
              <div className="vault-state" role="status">
                <Icon name="loader-2" size={24} className="vault-state__spinner" />
                <strong>Opening your vault</strong>
                <span>Decrypting items on this device…</span>
              </div>
            ) : loadError ? (
              <div className="vault-state" role="alert">
                <Icon name="alert-circle" size={32} />
                <strong>Vault unavailable</strong>
                <span>Your local session is still locked down. Check your connection and try again.</span>
                <Button variant="secondary" onClick={() => void loadVault()}>
                  <Icon name="refresh" size={18} />
                  Try again
                </Button>
              </div>
            ) : displayItems.length === 0 && corruptItems.length === 0 ? (
              <div className="vault-state">
                <Icon name={hasFilters ? 'search' : 'shield-lock'} size={36} />
                <strong>{hasFilters ? 'No matching items' : 'Your vault is ready'}</strong>
                <span>
                  {hasFilters
                    ? 'Clear a filter or try a broader search.'
                    : 'Add a login, passkey, card, note, identity, or document.'}
                </span>
                {hasFilters ? (
                  <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
                ) : (
                  <Button onClick={() => setPanelState({ mode: 'add', item: null })}>
                    <Icon name="plus" size={18} />
                    Add your first item
                  </Button>
                )}
              </div>
            ) : (
              <div className="vault-list" role="list">
                {displayItems.map(({ item, score }) => {
                  const secondary = getSecondaryText(item);
                  const preview = getPreviewText(item);
                  const selected = panelState?.item?.id === item.id;
                  const usernameCopied = copiedId === `${item.id}-username`;
                  const passwordCopied = copiedId === item.id;
                  const itemRefreshing = refreshingItemId === item.id;
                  return (
                    <article key={item.id} className="vault-row" data-selected={selected ? 'true' : undefined} role="listitem">
                      <button
                        type="button"
                        className="vault-row__main"
                        onClick={() => void openFreshItem(item.id)}
                        disabled={itemRefreshing}
                        aria-label={`Open ${item.name}`}
                      >
                        <span className="vault-row__icon" aria-hidden="true">
                          <SiteFavicon
                            sources={getEntryFaviconSources(item)}
                            fallbackIcon={typeIcons[item.type] ?? 'file'}
                            size={22}
                            fill
                          />
                        </span>
                        <span className="vault-row__content">
                          <span className="vault-row__title-line">
                            <strong>{item.name}</strong>
                            {item.favorite && <Icon name="star" size={15} label="Favorite" />}
                          </span>
                          {secondary && <span className="vault-row__secondary">{secondary}</span>}
                          {preview && <span className="vault-row__preview">{preview}</span>}
                          <span className="vault-row__meta">
                            <Badge>{typeLabels[item.type] ?? item.type}</Badge>
                            {search && indexed && score < 1 && <span>Match {Math.round(score * 100)}%</span>}
                          </span>
                        </span>
                      </button>

                      {item.type === 'login' && (
                        <div className="vault-row__actions">
                          <button
                            type="button"
                            className="lb-icon-button vault-row__action"
                            data-copied={usernameCopied}
                            data-tooltip={
                              itemRefreshing
                                ? 'Refreshing login'
                                : usernameCopied
                                  ? 'Username copied'
                                  : 'Copy username'
                            }
                            onClick={(event) => void copyFreshLoginField(
                              item.id,
                              'username',
                              `${item.id}-username`,
                              event.currentTarget
                            )}
                            disabled={itemRefreshing}
                            aria-busy={itemRefreshing}
                            aria-label={`${usernameCopied ? 'Username copied for' : 'Copy username for'} ${item.name}`}
                          >
                            <Icon name={usernameCopied ? 'check' : 'user'} size={18} />
                          </button>
                          <button
                            type="button"
                            className="lb-icon-button vault-row__action"
                            data-copied={passwordCopied}
                            data-tooltip={
                              itemRefreshing
                                ? 'Refreshing login'
                                : passwordCopied
                                  ? 'Password copied'
                                  : 'Copy password'
                            }
                            onClick={(event) => void copyFreshLoginField(
                              item.id,
                              'password',
                              item.id,
                              event.currentTarget
                            )}
                            disabled={itemRefreshing}
                            aria-busy={itemRefreshing}
                            aria-label={`${passwordCopied ? 'Password copied for' : 'Copy password for'} ${item.name}`}
                          >
                            <Icon name={passwordCopied ? 'check' : 'copy'} size={18} />
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}

                {corruptItems.map((item) => (
                  <article key={item.id} className="vault-row vault-row--corrupt" role="listitem">
                    <div className="vault-row__main">
                      <span className="vault-row__icon"><Icon name="alert-triangle" size={20} /></span>
                      <span className="vault-row__content">
                        <span className="vault-row__title-line"><strong>Undecryptable item</strong></span>
                        <span className="vault-row__secondary">
                          {item.type} · created {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                        <span className="vault-row__meta"><Badge variant="error">Needs attention</Badge></span>
                      </span>
                    </div>
                    <div className="vault-row__corrupt-action">
                      {deletingCorruptId === item.id ? (
                        <div className="vault-row__confirm" role="alert">
                          <span>Move this item to Trash?</span>
                          <Button variant="danger" size="sm" onClick={() => void deleteCorruptItem(item.id)}>Move</Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeletingCorruptId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <Button variant="secondary" size="sm" onClick={() => setDeletingCorruptId(item.id)}>Review</Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="vault-panel-host" aria-label="Selected item">
          {panelState ? (
            <ItemPanel
              mode={panelState.mode}
              item={panelState.item}
              folders={folders}
              items={items}
              onSave={() => {
                setPanelState(null);
                void loadVault();
              }}
              onDelete={() => {
                setPanelState(null);
                void loadVault();
              }}
              onClose={() => setPanelState(null)}
              refreshItem={getFreshItem}
            />
          ) : (
            <div className="vault-detail-empty">
              <span className="vault-detail-empty__icon"><Icon name="shield-lock" size={26} /></span>
              <strong>Select an item</strong>
              <span>Its details will stay here while you move through the vault.</span>
              <Button variant="secondary" onClick={() => setPanelState({ mode: 'add', item: null })}>
                <Icon name="plus" size={18} />
                Add item
              </Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
