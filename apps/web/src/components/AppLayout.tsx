import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { useVaultFilterStore } from '../store/vault.js';
import { api } from '../lib/api.js';
import type { Folder } from '@lockbox/types';

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, lock, logout } = useAuthStore();

  const {
    selectedFolder,
    setSelectedFolder,
    selectedType,
    setSelectedType,
    showFavorites,
    setShowFavorites,
    folders,
    setFolders,
    triggerUpdate,
  } = useVaultFilterStore();

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<{ id: string; name: string } | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      api.vault
        .list(session.token)
        .then((res: { folders: Folder[] }) => setFolders(res.folders))
        .catch(console.error);
    }
  }, [session, setFolders]);

  async function handleLogout() {
    if (session) await api.auth.logout(session.token).catch(() => {});
    logout();
    navigate('/login');
  }

  const typeIcon = (type: string) => ({ login: '🔑', note: '📝', card: '💳', identity: '📛' })[type as keyof ReturnType<typeof typeIcon>] ?? '📄';

  async function handleCreateFolder() {
    if (!session || !newFolderName.trim()) return;
    try {
      await api.vault.createFolder({ name: newFolderName.trim() }, session.token);
      setNewFolderName('');
      setShowNewFolder(false);
      const res = await api.vault.list(session.token);
      setFolders(res.folders);
      triggerUpdate();
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  }

  async function handleRenameFolder() {
    if (!session || !editingFolder || !editingFolder.name.trim()) return;
    try {
      await api.vault.updateFolder(
        editingFolder.id,
        { name: editingFolder.name.trim() },
        session.token
      );
      setEditingFolder(null);
      const res = await api.vault.list(session.token);
      setFolders(res.folders);
      triggerUpdate();
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
      const res = await api.vault.list(session.token);
      setFolders(res.folders);
      triggerUpdate();
    } catch (err) {
      console.error('Failed to delete folder:', err);
    }
  }

  const navToVault = () => {
    if (location.pathname !== '/vault') navigate('/vault');
  };

  const isNavActive = (path: string) => location.pathname === path;

  const getNavItemClass = (isActive: boolean) =>
    `w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
      isActive ? 'bg-white/[0.12] text-white' : 'hover:bg-white/[0.08] text-white/70'
    }`;

  const isVaultActive = isNavActive('/vault');

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 backdrop-blur-xl bg-white/[0.07] border-r border-white/[0.12] flex flex-col">
        <div className="p-4 border-b border-white/[0.1]">
          <h1 className="text-xl font-bold text-white">🔐 Lockbox</h1>
          <p className="text-xs text-white/40 mt-1 truncate">{session?.email}</p>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <button
            onClick={() => {
              setSelectedFolder(null);
              setSelectedType(null);
              setShowFavorites(false);
              navToVault();
            }}
            className={getNavItemClass(
              isVaultActive && !selectedFolder && !selectedType && !showFavorites
            )}
          >
            📋 All Items
          </button>
          <button
            onClick={() => {
              setShowFavorites(true);
              setSelectedType(null);
              setSelectedFolder(null);
              navToVault();
            }}
            className={getNavItemClass(isVaultActive && showFavorites)}
          >
            ⭐ Favorites
          </button>
          <button
            onClick={() => navigate('/trash')}
            className={getNavItemClass(isNavActive('/trash'))}
          >
            🗑️ Trash
          </button>
          <button
            onClick={() => navigate('/chat')}
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              isNavActive('/chat')
                ? 'bg-white/[0.12] text-white'
                : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            <span className="text-lg">✨</span>
            <span className="text-sm font-medium">Assistant</span>
          </button>
          <button
            onClick={() => navigate('/health')}
            className={getNavItemClass(isNavActive('/health'))}
          >
            🛡️ Security
          </button>
          <button
            onClick={() => navigate('/teams')}
            className={getNavItemClass(location.pathname.startsWith('/teams'))}
          >
            👥 Teams
          </button>

          <div className="pt-2 pb-1">
            <p className="px-3 text-xs font-semibold text-white/30 uppercase tracking-wider">
              Types
            </p>
          </div>
          {['login', 'note', 'card', 'identity'].map((type) => (
            <button
              key={type}
              onClick={() => {
                setSelectedType(type);
                setSelectedFolder(null);
                setShowFavorites(false);
                navToVault();
              }}
              className={`${getNavItemClass(isVaultActive && selectedType === type)} capitalize`}
            >
              {typeIcon(type)}{' '}
              {type === 'login' ? 'Logins' : type === 'note' ? 'Secure Notes' : type === 'card' ? 'Cards' : 'Identities'}
            </button>
          ))}

          {/* Folders */}
          <div className="pt-2 pb-1 flex items-center justify-between">
            <p className="px-3 text-xs font-semibold text-white/30 uppercase tracking-wider">
              Folders
            </p>
            <button
              onClick={() => setShowNewFolder(true)}
              className="px-2 text-white/30 hover:text-indigo-400 transition-colors text-sm"
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                  if (e.key === 'Escape') {
                    setShowNewFolder(false);
                    setNewFolderName('');
                  }
                }}
                placeholder="Folder name"
                className="flex-1 px-2 py-1 text-sm border border-white/[0.12] rounded bg-white/[0.06] text-white placeholder-white/40"
                autoFocus
              />
              <button
                onClick={handleCreateFolder}
                className="px-2 py-1 text-xs bg-indigo-600/80 text-white rounded hover:bg-indigo-500/90"
              >
                ✓
              </button>
              <button
                onClick={() => {
                  setShowNewFolder(false);
                  setNewFolderName('');
                }}
                className="px-2 py-1 text-xs text-white/30 hover:text-white/60"
              >
                ✕
              </button>
            </div>
          )}

          {folders.map((folder) =>
            editingFolder?.id === folder.id ? (
              <div key={folder.id} className="flex gap-1 px-2 mb-1">
                <input
                  type="text"
                  value={editingFolder.name}
                  onChange={(e) => setEditingFolder({ ...editingFolder, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameFolder();
                    if (e.key === 'Escape') setEditingFolder(null);
                  }}
                  className="flex-1 px-2 py-1 text-sm border border-white/[0.12] rounded bg-white/[0.06] text-white placeholder-white/40"
                  autoFocus
                />
                <button
                  onClick={handleRenameFolder}
                  className="px-2 py-1 text-xs bg-indigo-600/80 text-white rounded hover:bg-indigo-500/90"
                >
                  ✓
                </button>
                <button
                  onClick={() => setEditingFolder(null)}
                  className="px-2 py-1 text-xs text-white/30 hover:text-white/60"
                >
                  ✕
                </button>
              </div>
            ) : deletingFolderId === folder.id ? (
              <div key={folder.id} className="px-3 py-2">
                <p className="text-xs text-white/70 mb-2">
                  Delete "{folder.name}"? Items will be moved to root.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDeleteFolder(folder.id)}
                    className="px-2 py-1 text-xs bg-red-500/80 hover:bg-red-400/90 text-white rounded"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setDeletingFolderId(null)}
                    className="px-2 py-1 text-xs text-white/30 hover:text-white/60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div key={folder.id} className="group flex items-center">
                <button
                  onClick={() => {
                    setSelectedFolder(folder.id);
                    setSelectedType(null);
                    setShowFavorites(false);
                    navToVault();
                  }}
                  className={`flex-1 text-left px-3 py-2 rounded-lg text-sm transition-colors truncate ${
                    isVaultActive && selectedFolder === folder.id
                      ? 'bg-white/[0.12] text-white'
                      : 'hover:bg-white/[0.08] text-white/70'
                  }`}
                >
                  📁 {folder.name}
                </button>
                <div className="hidden group-hover:flex gap-0.5 pr-1 shrink-0">
                  <button
                    onClick={() => setEditingFolder({ id: folder.id, name: folder.name })}
                    className="p-1 text-white/30 hover:text-indigo-400 transition-colors"
                    title="Rename"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => setDeletingFolderId(folder.id)}
                    className="p-1 text-white/30 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          )}
        </nav>

        <div className="p-3 border-t border-white/[0.1] space-y-1">
          <button
            onClick={() => navigate('/generator')}
            className={getNavItemClass(isNavActive('/generator'))}
          >
            🎲 Generator
          </button>
          <button
            onClick={() => navigate('/settings')}
            className={getNavItemClass(location.pathname.startsWith('/settings'))}
          >
            ⚙️ Settings
          </button>
          <button
            onClick={lock}
            className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/[0.08] text-white/70 transition-colors"
          >
            🔒 Lock
          </button>
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/[0.08] text-red-400 transition-colors"
          >
            🚪 Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
