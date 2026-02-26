import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { api } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import type { VaultItem, Folder } from '@lockbox/types';
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
  const navigate = useNavigate();
  const { session, userKey, lock, logout } = useAuthStore();

  const [items, setItems] = useState<VaultItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [search, setSearch] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [panelState, setPanelState] = useState<{ mode: 'view' | 'edit' | 'add'; item: VaultItem | null } | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<{ id: string; name: string } | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [corruptItems, setCorruptItems] = useState<EncryptedItem[]>([]);

  const loadVault = useCallback(async () => {
    if (!session || !userKey) return;
    setLoading(true);
    try {
      const res = await api.vault.list(session.token) as { items: EncryptedItem[]; folders: Folder[] };
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
            } catch {
              corrupt.push(i);
            }
          }),
      );
      setItems(decrypted);
      setCorruptItems(corrupt);
    } catch (err) {
      console.error('Failed to load vault:', err);
    } finally {
      setLoading(false);
    }
  }, [session, userKey]);

  useEffect(() => {
    loadVault();
  }, [loadVault]);

  const filteredItems = items.filter((item) => {
    if (search) {
      const q = search.toLowerCase();
      const name = item.name.toLowerCase();
      if (!name.includes(q)) return false;
    }
    if (selectedFolder && item.folderId !== selectedFolder) return false;
    if (selectedType && item.type !== selectedType) return false;
    if (showFavorites && !item.favorite) return false;
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

  async function handleLogout() {
    if (session) await api.auth.logout(session.token).catch(() => {});
    logout();
    navigate('/login');
  }

  const typeIcon = (type: string) => ({ login: '🔑', note: '📝', card: '💳' }[type] ?? '📄');

  async function handleCreateFolder() {
    if (!session || !newFolderName.trim()) return;
    try {
      await api.vault.createFolder({ name: newFolderName.trim() }, session.token);
      setNewFolderName('');
      setShowNewFolder(false);
      loadVault();
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  }

  async function handleRenameFolder() {
    if (!session || !editingFolder || !editingFolder.name.trim()) return;
    try {
      await api.vault.updateFolder(editingFolder.id, { name: editingFolder.name.trim() }, session.token);
      setEditingFolder(null);
      loadVault();
    } catch (err) {
      console.error('Failed to rename folder:', err);
    }
  }

  async function handleDeleteFolder(id: string) {
    if (!session) return;
    try {
      await api.vault.deleteFolder(id, session.token);
      setDeletingFolderId(null);
      if (selectedFolder === id) setSelectedFolder(null);
      loadVault();
    } catch (err) {
      console.error('Failed to delete folder:', err);
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">🔐 Lockbox</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{session?.email}</p>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <button
            onClick={() => { setSelectedFolder(null); setSelectedType(null); setShowFavorites(false); }}
            className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            📋 All Items
          </button>
          <button
            onClick={() => { setShowFavorites(true); setSelectedType(null); setSelectedFolder(null); }}
            className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            ⭐ Favorites
          </button>

          <div className="pt-2 pb-1">
            <p className="px-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Types</p>
          </div>
          {['login', 'note', 'card'].map((type) => (
            <button
              key={type}
              onClick={() => { setSelectedType(type); setSelectedFolder(null); setShowFavorites(false); }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 capitalize"
            >
              {typeIcon(type)} {type === 'login' ? 'Logins' : type === 'note' ? 'Secure Notes' : 'Cards'}
            </button>
          ))}

          {/* Folders */}
          <div className="pt-2 pb-1 flex items-center justify-between">
            <p className="px-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Folders</p>
            <button
              onClick={() => setShowNewFolder(true)}
              className="px-2 text-gray-400 hover:text-indigo-500 transition-colors text-sm"
              title="New folder"
            >
              +
            </button>
          </div>

          {showNewFolder && (
            <div className="flex gap-1 px-2 mb-1">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); } }}
                placeholder="Folder name"
                className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                autoFocus
              />
              <button onClick={handleCreateFolder} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">✓</button>
              <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
            </div>
          )}

          {folders.map((folder) =>
            editingFolder?.id === folder.id ? (
              <div key={folder.id} className="flex gap-1 px-2 mb-1">
                <input
                  type="text"
                  value={editingFolder.name}
                  onChange={(e) => setEditingFolder({ ...editingFolder, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRenameFolder(); if (e.key === 'Escape') setEditingFolder(null); }}
                  className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  autoFocus
                />
                <button onClick={handleRenameFolder} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">✓</button>
                <button onClick={() => setEditingFolder(null)} className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
              </div>
            ) : deletingFolderId === folder.id ? (
              <div key={folder.id} className="px-3 py-2">
                <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">Delete "{folder.name}"? Items will be moved to root.</p>
                <div className="flex gap-2">
                  <button onClick={() => handleDeleteFolder(folder.id)} className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded">Delete</button>
                  <button onClick={() => setDeletingFolderId(null)} className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">Cancel</button>
                </div>
              </div>
            ) : (
              <div key={folder.id} className="group flex items-center">
                <button
                  onClick={() => { setSelectedFolder(folder.id); setSelectedType(null); setShowFavorites(false); }}
                  className="flex-1 text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 truncate"
                >
                  📁 {folder.name}
                </button>
                <div className="hidden group-hover:flex gap-0.5 pr-1 shrink-0">
                  <button onClick={() => setEditingFolder({ id: folder.id, name: folder.name })} className="p-1 text-gray-400 hover:text-indigo-500 transition-colors" title="Rename">
                    ✎
                  </button>
                  <button onClick={() => setDeletingFolderId(folder.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Delete">
                    ✕
                  </button>
                </div>
              </div>
            ),
          )}
        </nav>

        <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-1">
          <button
            onClick={() => navigate('/generator')}
            className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            🎲 Generator
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            ⚙️ Settings
          </button>
          <button
            onClick={lock}
            className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            🔒 Lock
          </button>
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400"
          >
            🚪 Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Search bar */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex gap-3">
          <input
            type="search"
            placeholder="Search vault..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={() => setPanelState({ mode: 'add', item: null })}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
          >
            + Add
          </button>
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-500 dark:text-gray-400">
              Loading vault...
            </div>
          ) : filteredItems.length === 0 && corruptItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
              <div className="text-5xl mb-4">{search ? '🔍' : '🔐'}</div>
              <p className="text-lg font-medium">
                {search ? 'No items match your search' : 'Your vault is empty'}
              </p>
              {!search && (
                <p className="text-sm mt-2">Add your first password to get started</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setPanelState({ mode: 'view', item })}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors cursor-pointer"
                >
                  <div className="text-2xl">{typeIcon(item.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">{item.name}</p>
                    {item.type === 'login' && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {(item as { username?: string }).username ?? ''}
                      </p>
                    )}
                  </div>
                  {item.type === 'login' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); copyToClipboard((item as { password?: string }).password ?? '', item.id); }}
                      className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-gray-700 dark:text-gray-300 rounded-md transition-colors"
                    >
                      {copiedId === item.id ? '✓ Copied' : 'Copy Password'}
                    </button>
                  )}
                  {item.favorite && <span className="text-yellow-500">⭐</span>}
                </div>
              ))}
              {corruptItems.map((ci) => (
                <div
                  key={ci.id}
                  className="bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 p-4 flex items-center gap-4"
                >
                  <div className="text-2xl">⚠️</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white">Undecryptable item</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">Type: {ci.type} · Created: {new Date(ci.createdAt).toLocaleDateString()}</p>
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
                    className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {panelState && (
        <ItemPanel
          mode={panelState.mode}
          item={panelState.item}
          folders={folders}
          onSave={() => { setPanelState(null); loadVault(); }}
          onDelete={() => { setPanelState(null); loadVault(); }}
          onClose={() => setPanelState(null)}
        />
      )}
    </div>
  );
}
