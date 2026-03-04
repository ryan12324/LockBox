import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/auth.js';
import { useSearchStore } from '../store/search.js';
import { api } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import { copyWithFeedback } from '../lib/copy-utils.js';
import { useVaultFilterStore } from '../store/vault.js';
import type {
  VaultItem,
  Folder,
  PasskeyItem,
  LoginItem,
  SecureNoteItem,
  CardItem,
  IdentityItem,
  DocumentItem,
} from '@lockbox/types';
import { Card, Badge, Button, Input, Select, Aura } from '@lockbox/design';
import ItemPanel from '../components/ItemPanel.js';

interface EncryptedItem {
  id: string;
  type: string;
  encryptedData: string;
  folderId: string | null;
  tags: string | null;
  favorite: number;
  revisionDate: string;
  createdAt: string;
  deletedAt: string | null;
}

const typeLabels: Record<string, string> = {
  login: 'Login',
  card: 'Card',
  note: 'Note',
  identity: 'Identity',
  passkey: 'Passkey',
  document: 'Document',
};

const typeIcons: Record<string, string> = {
  login: '\u{1F511}',
  note: '\u{1F4DD}',
  card: '\u{1F4B3}',
  identity: '\u{1F4DB}',
  passkey: '\u{1F5DD}\uFE0F',
  document: '\u{1F4C4}',
};

const typeFilters: Array<{ key: string | null; label: string; icon: string }> = [
  { key: null, label: 'All', icon: '\u{1F30D}' },
  { key: 'login', label: 'Logins', icon: '\u{1F511}' },
  { key: 'card', label: 'Cards', icon: '\u{1F4B3}' },
  { key: 'note', label: 'Notes', icon: '\u{1F4DD}' },
  { key: 'identity', label: 'Identity', icon: '\u{1F4DB}' },
  { key: 'passkey', label: 'Passkeys', icon: '\u{1F5DD}\uFE0F' },
  { key: 'document', label: 'Documents', icon: '\u{1F4C4}' },
];

function getSecondaryText(item: VaultItem): string {
  switch (item.type) {
    case 'login':
      return (item as LoginItem).username ?? '';
    case 'passkey': {
      const pk = item as PasskeyItem;
      return pk.userName ? `${pk.rpName} (${pk.userName})` : pk.rpName;
    }
    case 'card': {
      const ci = item as CardItem;
      return ci.brand
        ? `${ci.brand} \u2022\u2022\u2022\u2022 ${ci.number.slice(-4)}`
        : `\u2022\u2022\u2022\u2022 ${ci.number.slice(-4)}`;
    }
    case 'identity': {
      const id = item as IdentityItem;
      return [id.firstName, id.lastName].filter(Boolean).join(' ') || id.email || '';
    }
    default:
      return '';
  }
}

function getPreviewText(item: VaultItem): string | null {
  if (item.type === 'note') {
    const content = (item as SecureNoteItem).content;
    if (content) return content.length > 100 ? content.slice(0, 100) + '\u2026' : content;
  }
  if (item.type === 'document') {
    const desc = (item as DocumentItem).description;
    if (desc) return desc.length > 100 ? desc.slice(0, 100) + '\u2026' : desc;
  }
  return null;
}

export default function Vault() {
  const { session, userKey } = useAuthStore();

  const [items, setItems] = useState<VaultItem[]>([]);
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
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [panelState, setPanelState] = useState<{
    mode: 'view' | 'edit' | 'add';
    item: VaultItem | null;
  } | null>(null);

  const [corruptItems, setCorruptItems] = useState<EncryptedItem[]>([]);

  const loadVault = useCallback(async () => {
    if (!session || !userKey) {
      return;
    }
    setLoading(true);
    try {
      const res = (await api.vault.list(session.token)) as {
        items: EncryptedItem[];
        folders: Folder[];
      };
      setFolders(res.folders);

      const decrypted: VaultItem[] = [];
      const corrupt: EncryptedItem[] = [];

      await Promise.all(
        res.items
          .filter((i) => !i.deletedAt)
          .map(async (i) => {
            try {
              const d = await decryptVaultItem(i.encryptedData, userKey, i.id, i.revisionDate);
              decrypted.push(d);
            } catch (decryptErr) {
              console.error('Failed to decrypt item:', i.id);
              corrupt.push(i);
            }
          })
      );
      setItems(decrypted);
      setCorruptItems(corrupt);
      indexItems(decrypted).catch(console.error);
    } catch (err) {
      console.error('Failed to load vault:', err);
    } finally {
      setLoading(false);
    }
  }, [session, userKey]);

  useEffect(() => {
    loadVault();
  }, [loadVault, lastUpdated]);
  const filteredItems = items.filter((item) => {
    if (search && !indexed) {
      const q = search.toLowerCase();
      const name = item.name.toLowerCase();
      if (!name.includes(q)) return false;
    }
    if (selectedFolder && item.folderId !== selectedFolder) return false;
    if (selectedType && item.type !== selectedType) return false;
    if (showFavorites && !item.favorite) return false;
    return true;
  });

  const displayItems = (
    search && indexed
      ? searchResults.map((r) => r)
      : filteredItems.map((item) => ({ item, score: 1 }))
  ).filter((r) => {
    if (selectedFolder && r.item.folderId !== selectedFolder) return false;
    if (selectedType && r.item.type !== selectedType) return false;
    if (showFavorites && !r.item.favorite) return false;
    return true;
  });

  async function copyToClipboard(text: string, id: string, element?: HTMLElement | null) {
    await copyWithFeedback(text, element);
    setCopiedId(id);
    setTimeout(() => {
      navigator.clipboard.writeText('').catch(() => {});
      setCopiedId(null);
    }, 30_000);
  }

  useEffect(() => {
    if (search.trim()) {
      window.dispatchEvent(new CustomEvent('lockbox:search'));
    }
  }, [search]);

  const typeIcon = (type: string): string => typeIcons[type] ?? '\u{1F4C4}';

  const isLargeTile = (item: VaultItem, index: number): boolean => {
    return item.favorite || index < 3;
  };

  const folderOptions = [
    { value: '', label: 'All Folders' },
    ...folders.map((f) => ({ value: f.id, label: f.name })),
  ];

  return (
    <>
      <div style={{ padding: 16 }}>
        <Card variant="surface" padding="md" style={{ overflow: 'visible' }}>
          <div className="flex items-center gap-3">
            <div
              className={`relative flex-1${search.trim() && searching ? ' type-searching' : ''}${search.trim() && !searching && displayItems.length > 0 ? ' type-found' : ''}`}
            >
              <Input
                type="search"
                placeholder="Search your vault\u2026"
                value={search}
                onChange={(e) => performSearch(e.target.value)}
                style={{
                  fontSize: 'var(--font-size-lg)',
                  padding: '14px 18px',
                  background: 'var(--color-bg)',
                  borderRadius: 'var(--radius-organic-lg)',
                  border: '1px solid var(--color-border)',
                }}
              />
              {indexed && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                  {searching && (
                    <span className="w-3 h-3 border-2 border-[var(--color-primary)] border-t-transparent rounded-[var(--radius-full)] animate-spin"></span>
                  )}
                  <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-primary)] bg-[var(--color-aura-dim)] px-1.5 py-0.5 rounded">
                    {'\u{1F50D}'} Smart Search
                  </span>
                </div>
              )}
            </div>
            <Button onClick={() => setPanelState({ mode: 'add', item: null })}>+ Add</Button>
          </div>
        </Card>
      </div>

      <div style={{ padding: '0 16px 12px' }} className="flex flex-wrap items-center gap-2">
        {typeFilters.map((tf) => (
          <Button
            key={tf.key ?? 'all'}
            variant="ghost"
            size="sm"
            onClick={() => setSelectedType(tf.key)}
            style={{
              borderRadius: 'var(--radius-full)',
              background: selectedType === tf.key ? 'var(--color-primary)' : 'var(--color-surface)',
              color:
                selectedType === tf.key ? 'var(--color-primary-fg)' : 'var(--color-text-secondary)',
              boxShadow: selectedType === tf.key ? 'var(--shadow-md)' : 'var(--shadow-sm)',
              fontWeight: selectedType === tf.key ? 600 : 500,
            }}
          >
            {tf.icon} {tf.label}
          </Button>
        ))}

        <div
          style={{
            width: 1,
            height: 24,
            background: 'var(--color-border)',
            margin: '0 4px',
          }}
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowFavorites(!showFavorites)}
          style={{
            borderRadius: 'var(--radius-full)',
            background: showFavorites ? 'var(--color-warning-subtle)' : 'var(--color-surface)',
            color: showFavorites ? 'var(--color-warning)' : 'var(--color-text-secondary)',
            boxShadow: showFavorites ? 'var(--shadow-md)' : 'var(--shadow-sm)',
            fontWeight: showFavorites ? 600 : 500,
          }}
        >
          {showFavorites ? '\u2B50' : '\u2606'} Favorites
        </Button>

        {folders.length > 0 && (
          <div style={{ minWidth: 160 }}>
            <Select
              options={folderOptions}
              value={selectedFolder ?? ''}
              onChange={(e) => setSelectedFolder(e.target.value || null)}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '6px 36px 6px 14px',
                fontSize: 'var(--font-size-sm)',
                minHeight: 32,
              }}
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '0 16px 16px' }}>
        {loading ? (
          <div className="flex items-center justify-center h-32 text-[var(--color-text-tertiary)]">
            <span className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-[var(--radius-full)] animate-spin mr-3"></span>
            Loading vault...
          </div>
        ) : displayItems.length === 0 && corruptItems.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center"
            style={{ minHeight: 400, position: 'relative' }}
          >
            <Aura state="active" position="center" />
            <div className="text-center" style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>
                {search ? '\u{1F50D}' : '\u{1F512}'}
              </div>
              <p
                style={{
                  fontSize: 'var(--font-size-xl)',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  marginBottom: 8,
                }}
              >
                {search ? 'No items match your search' : 'Your vault is empty'}
              </p>
              <p
                style={{
                  fontSize: 'var(--font-size-base)',
                  color: 'var(--color-text-tertiary)',
                  marginBottom: 24,
                }}
              >
                {search
                  ? 'Try a different query or clear your filters'
                  : 'Add your first password to get started'}
              </p>
              {!search && (
                <Button onClick={() => setPanelState({ mode: 'add', item: null })}>
                  + Add your first item
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {displayItems.map(({ item, score }, index) => {
              const large = isLargeTile(item, index);
              const secondary = getSecondaryText(item);
              const preview = getPreviewText(item);

              return (
                <Card
                  key={item.id}
                  variant="surface"
                  padding="md"
                  onClick={() => setPanelState({ mode: 'view', item })}
                  style={{
                    gridColumn: large ? 'span 2' : undefined,
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: large ? 180 : 160,
                  }}
                >
                  {search && indexed && score < 1 && (
                    <div
                      className="absolute top-0 right-0 h-full w-1 bg-[var(--color-primary)]"
                      style={{ opacity: Math.max(0.1, score) }}
                    />
                  )}

                  <div>
                    <div className="flex items-start justify-between" style={{ marginBottom: 12 }}>
                      <span style={{ fontSize: large ? 32 : 28 }}>{typeIcon(item.type)}</span>
                      <div className="flex items-center gap-2">
                        {search && indexed && score < 1 && (
                          <span className="text-[10px] text-[var(--color-text-tertiary)] bg-[var(--color-bg-subtle)] px-1.5 rounded">
                            {(score * 100).toFixed(0)}%
                          </span>
                        )}
                        <Badge variant="default">{typeLabels[item.type] ?? item.type}</Badge>
                      </div>
                    </div>

                    <p
                      className="truncate"
                      style={{
                        fontSize: large ? 20 : 18,
                        fontWeight: 600,
                        color: 'var(--color-text)',
                        lineHeight: 'var(--line-height-tight)',
                        marginBottom: 4,
                      }}
                    >
                      {item.name}
                    </p>

                    {secondary && (
                      <p
                        className="truncate"
                        style={{
                          fontSize: 'var(--font-size-sm)',
                          color: 'var(--color-text-tertiary)',
                          lineHeight: 'var(--line-height-normal)',
                        }}
                      >
                        {secondary}
                      </p>
                    )}

                    {preview && (
                      <p
                        style={{
                          fontSize: 'var(--font-size-sm)',
                          color: 'var(--color-text-tertiary)',
                          lineHeight: 'var(--line-height-relaxed)',
                          marginTop: 8,
                          display: '-webkit-box',
                          WebkitLineClamp: large ? 3 : 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {preview}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1" style={{ marginTop: 12, zIndex: 10 }}>
                    {item.type === 'login' && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(
                              (item as LoginItem).username ?? '',
                              `${item.id}-user`,
                              e.currentTarget
                            );
                          }}
                          style={{ borderRadius: 'var(--radius-full)' }}
                        >
                          {copiedId === `${item.id}-user` ? '\u2713 User' : '\u{1F464} Copy User'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(
                              (item as LoginItem).password ?? '',
                              item.id,
                              e.currentTarget
                            );
                          }}
                          style={{ borderRadius: 'var(--radius-full)' }}
                        >
                          {copiedId === item.id ? '\u2713 Copied' : '\u{1F512} Copy Pass'}
                        </Button>
                      </>
                    )}
                    <div style={{ flex: 1 }} />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      style={{
                        color: item.favorite ? 'var(--color-warning)' : undefined,
                        borderRadius: 'var(--radius-full)',
                      }}
                    >
                      {item.favorite ? '\u2B50' : '\u2606'}
                    </Button>
                  </div>
                </Card>
              );
            })}

            {corruptItems.map((ci) => (
              <Card
                key={ci.id}
                variant="surface"
                padding="md"
                style={{
                  background: 'var(--color-error-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: 160,
                }}
              >
                <div>
                  <div className="flex items-start justify-between" style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 28 }}>{'\u26A0\uFE0F'}</span>
                    <Badge variant="error">Corrupt</Badge>
                  </div>
                  <p
                    style={{
                      fontSize: 18,
                      fontWeight: 600,
                      color: 'var(--color-text)',
                      marginBottom: 4,
                    }}
                  >
                    Undecryptable item
                  </p>
                  <p
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    Type: {ci.type} {'\u00B7'} Created:{' '}
                    {new Date(ci.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={async () => {
                      if (!session) return;
                      try {
                        await api.vault.deleteItem(ci.id, session.token);
                        loadVault();
                      } catch (err) {
                        console.error('Failed to delete corrupt item:', err);
                      }
                    }}
                    style={{ borderRadius: 'var(--radius-full)' }}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {panelState && (
        <ItemPanel
          mode={panelState.mode}
          item={panelState.item}
          folders={folders}
          items={items}
          onSave={() => {
            setPanelState(null);
            loadVault();
          }}
          onDelete={() => {
            setPanelState(null);
            loadVault();
          }}
          onClose={() => setPanelState(null)}
        />
      )}
    </>
  );
}
