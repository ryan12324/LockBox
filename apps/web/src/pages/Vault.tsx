import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/auth.js';
import { useSearchStore } from '../store/search.js';
import { api } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import { copyWithFeedback } from '../lib/copy-utils.js';
import { useVaultFilterStore } from '../store/vault.js';
import type { VaultItem, Folder, PasskeyItem, LoginItem } from '@lockbox/types';
import { Card, Badge, Button, Input } from '@lockbox/design';
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
  const { selectedFolder, selectedType, showFavorites, folders, setFolders, lastUpdated } =
    useVaultFilterStore();
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

  // Dispatch search event for Aura when query changes
  useEffect(() => {
    if (search.trim()) {
      window.dispatchEvent(new CustomEvent('lockbox:search'));
    }
  }, [search]);

  const typeIcon = (type: string): string =>
    ({ login: '🔑', note: '📝', card: '💳', identity: '📛', passkey: '🗝️', document: '📄' })[
      type
    ] ?? '📄';
  return (
    <>
      <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex gap-3">
        <div
          className={`relative flex-1${search.trim() && searching ? ' type-searching' : ''}${search.trim() && !searching && displayItems.length > 0 ? ' type-found' : ''}`}
        >
          <Input
            type="search"
            placeholder="Search vault..."
            value={search}
            onChange={(e) => performSearch(e.target.value)}
          />
          {indexed && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
              {searching && (
                <span className="w-3 h-3 border-2 border-[var(--color-primary)] border-t-transparent rounded-[var(--radius-full)] animate-spin"></span>
              )}
              <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-primary)] bg-[var(--color-aura-dim)] px-1.5 py-0.5 rounded">
                🔍 Smart Search
              </span>
            </div>
          )}
        </div>
        <Button onClick={() => setPanelState({ mode: 'add', item: null })}>+ Add</Button>
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-[var(--color-text-tertiary)]">
            Loading vault...
          </div>
        ) : displayItems.length === 0 && corruptItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-[var(--color-text-tertiary)]">
            <div className="text-5xl mb-4">{search ? '🔍' : '🔐'}</div>
            <p className="text-lg font-medium">
              {search ? 'No items match your search' : 'Your vault is empty'}
            </p>
            {!search && <p className="text-sm mt-2">Add your first password to get started</p>}
          </div>
        ) : (
          <div className="space-y-2">
            {displayItems.map(({ item, score }) => (
              <Card
                key={item.id}
                variant="surface"
                padding="sm"
                onClick={() => setPanelState({ mode: 'view', item })}
                style={{ position: 'relative', overflow: 'hidden' }}
              >
                {search && indexed && score < 1 && (
                  <div
                    className="absolute top-0 right-0 h-full w-1 bg-[var(--color-primary)]"
                    style={{ opacity: Math.max(0.1, score) }}
                  />
                )}
                <div className="flex items-center gap-4">
                  <div className="text-2xl">{typeIcon(item.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-[var(--color-text)] truncate">{item.name}</p>
                      <Badge variant="default">{typeLabels[item.type] ?? item.type}</Badge>
                      {search && indexed && score < 1 && (
                        <span className="text-[10px] text-[var(--color-text-tertiary)] bg-[var(--color-surface)] px-1.5 rounded">
                          {(score * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    {item.type === 'login' && (
                      <p className="text-sm text-[var(--color-text-tertiary)] truncate">
                        {(item as LoginItem).username ?? ''}
                      </p>
                    )}
                    {item.type === 'passkey' && (
                      <p className="text-sm text-[var(--color-text-tertiary)] truncate">
                        {(item as PasskeyItem).rpName}
                        {(item as PasskeyItem).userName
                          ? ` (${(item as PasskeyItem).userName})`
                          : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 z-10">
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
                        >
                          {copiedId === `${item.id}-user` ? '✓' : '👤'}
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
                        >
                          {copiedId === item.id ? '✓ Copied' : '🔒 Copy'}
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      style={{ color: item.favorite ? 'var(--color-warning)' : undefined }}
                    >
                      {item.favorite ? '⭐' : '☆'}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
            {corruptItems.map((ci) => (
              <Card
                key={ci.id}
                variant="surface"
                padding="sm"
                style={{
                  background: 'var(--color-error-subtle)',
                  borderColor: 'var(--color-error)',
                }}
              >
                <div className="flex items-center gap-4">
                  <div className="text-2xl">⚠️</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[var(--color-text)]">Undecryptable item</p>
                    <p className="text-sm text-[var(--color-text-tertiary)] truncate">
                      Type: {ci.type} · Created: {new Date(ci.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="error">Corrupt</Badge>
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
