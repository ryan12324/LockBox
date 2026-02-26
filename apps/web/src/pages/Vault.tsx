import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { api } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import type { VaultItem, Folder } from '@lockbox/types';

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

  const loadVault = useCallback(async () => {
    if (!session || !userKey) return;
    setLoading(true);
    try {
      const res = await api.vault.list(session.token) as { items: EncryptedItem[]; folders: Folder[] };
      setFolders(res.folders);

      const decrypted = await Promise.all(
        res.items
          .filter((i) => !i.deletedAt)
          .map(async (i) => {
            try {
              return await decryptVaultItem(i.encryptedData, userKey, i.id, i.revisionDate);
            } catch {
              return null;
            }
          }),
      );
      setItems(decrypted.filter(Boolean) as VaultItem[]);
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

          {folders.length > 0 && (
            <>
              <div className="pt-2 pb-1">
                <p className="px-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Folders</p>
              </div>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => { setSelectedFolder(folder.id); setSelectedType(null); setShowFavorites(false); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                >
                  📁 {folder.name}
                </button>
              ))}
            </>
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
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <input
            type="search"
            placeholder="Search vault..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-500 dark:text-gray-400">
              Loading vault...
            </div>
          ) : filteredItems.length === 0 ? (
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
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors"
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
                      onClick={() => copyToClipboard((item as { password?: string }).password ?? '', item.id)}
                      className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-gray-700 dark:text-gray-300 rounded-md transition-colors"
                    >
                      {copiedId === item.id ? '✓ Copied' : 'Copy Password'}
                    </button>
                  )}
                  {item.favorite && <span className="text-yellow-500">⭐</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
