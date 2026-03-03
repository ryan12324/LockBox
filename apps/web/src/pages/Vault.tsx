import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/auth.js';
import { useSearchStore } from '../store/search.js';
import { api } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import { useVaultFilterStore } from '../store/vault.js';
import type { VaultItem, Folder, PasskeyItem } from '@lockbox/types';
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

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      navigator.clipboard.writeText('').catch(() => {});
      setCopiedId(null);
    }, 30_000);
  }

  const typeIcon = (type: string): string =>
    ({ login: '🔑', note: '📝', card: '💳', identity: '📛', passkey: '🗝️', document: '📄' })[
      type
    ] ?? '📄';
  return (
    <>
      <div className="p-4 border-b border-white/[0.1] bg-white/[0.05] backdrop-blur-lg flex gap-3">
        <div className="relative flex-1">
          <input
            type="search"
            placeholder="Search vault..."
            value={search}
            onChange={(e) => performSearch(e.target.value)}
            className="w-full px-4 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-white/[0.2]"
          />
          {indexed && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
              {searching && (
                <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
              )}
              <span className="text-[10px] font-medium uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                🔍 Smart Search
              </span>
            </div>
          )}
        </div>
        <button
          onClick={() => setPanelState({ mode: 'add', item: null })}
          className="px-4 py-2 bg-indigo-600/80 hover:bg-indigo-500/90 text-white font-medium rounded-lg backdrop-blur-sm transition-colors"
        >
          + Add
        </button>
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-white/40">
            Loading vault...
          </div>
        ) : displayItems.length === 0 && corruptItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-white/40">
            <div className="text-5xl mb-4">{search ? '🔍' : '🔐'}</div>
            <p className="text-lg font-medium">
              {search ? 'No items match your search' : 'Your vault is empty'}
            </p>
            {!search && <p className="text-sm mt-2">Add your first password to get started</p>}
          </div>
        ) : (
          <div className="space-y-2">
            {displayItems.map(({ item, score }) => (
              <div
                key={item.id}
                onClick={() => setPanelState({ mode: 'view', item })}
                className="backdrop-blur-lg bg-white/[0.06] rounded-xl border border-white/[0.1] p-4 flex items-center gap-4 hover:bg-white/[0.1] hover:border-white/[0.2] transition-all cursor-pointer relative overflow-hidden"
              >
                {search && indexed && score < 1 && (
                  <div
                    className="absolute top-0 right-0 h-full w-1 bg-indigo-500"
                    style={{ opacity: Math.max(0.1, score) }}
                  />
                )}
                <div className="text-2xl">{typeIcon(item.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white truncate">{item.name}</p>
                    {search && indexed && score < 1 && (
                      <span className="text-[10px] text-white/30 bg-white/[0.05] px-1.5 rounded">
                        {(score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {item.type === 'login' && (
                    <p className="text-sm text-white/40 truncate">
                      {(item as { username?: string }).username ?? ''}
                    </p>
                  )}
                  {item.type === 'passkey' && (
                    <p className="text-sm text-white/40 truncate">
                      {(item as PasskeyItem).rpName}
                      {(item as PasskeyItem).userName ? ` (${(item as PasskeyItem).userName})` : ''}
                    </p>
                  )}
                </div>
                {item.type === 'login' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard((item as { password?: string }).password ?? '', item.id);
                    }}
                    className="px-3 py-1.5 text-xs bg-white/[0.08] hover:bg-indigo-500/20 text-white/60 rounded-md transition-colors z-10"
                  >
                    {copiedId === item.id ? '✓ Copied' : 'Copy Password'}
                  </button>
                )}
                {item.favorite && <span className="text-yellow-500 z-10">⭐</span>}
              </div>
            ))}
            {corruptItems.map((ci) => (
              <div
                key={ci.id}
                className="bg-red-500/10 rounded-xl border border-red-400/20 backdrop-blur-sm p-4 flex items-center gap-4"
              >
                <div className="text-2xl">⚠️</div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white">Undecryptable item</p>
                  <p className="text-sm text-white/40 truncate">
                    Type: {ci.type} · Created: {new Date(ci.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (!session) return;
                    try {
                      await api.vault.deleteItem(ci.id, session.token);
                      loadVault();
                    } catch (err) {
                      console.error('Failed to delete corrupt item:', err);
                    }
                  }}
                  className="px-3 py-1.5 text-xs bg-red-500/80 hover:bg-red-400/90 text-white rounded-md transition-colors"
                >
                  Delete
                </button>
              </div>
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
