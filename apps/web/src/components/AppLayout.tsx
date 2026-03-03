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
  const [isTravelMode, setIsTravelMode] = useState(false);

  useEffect(() => {
    if (session) {
      api.vault
        .list(session.token)
        .then((res: { folders: Folder[] }) => setFolders(res.folders))
        .catch(console.error);

      api.settings
        .getTravelMode(session.token)
        .then((res) => setIsTravelMode(res.enabled))
        .catch(console.error);
    }
  }, [session, setFolders]);

  async function handleLogout() {
    if (session) await api.auth.logout(session.token).catch(() => {});
    logout();
    navigate('/login');
  }

  const typeIcon = (type: string): string =>
    ({ login: '🔑', note: '📝', card: '💳', identity: '📛', passkey: '🗝️', document: '📄' })[
      type
    ] ?? '📄';

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
    `w-full text-left px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors ${
      isActive
        ? 'bg-[var(--color-aura-dim)] text-[var(--color-primary)]'
        : 'hover:bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)]'
    }`;

  const isVaultActive = isNavActive('/vault');

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col">
        <div className="p-4 border-b border-[var(--color-border)]">
          <h1 className="text-xl font-bold text-[var(--color-text)]">🔐 Lockbox</h1>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1 truncate">
            {session?.email}
          </p>
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
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-[var(--radius-md)] transition-colors ${
              isNavActive('/chat')
                ? 'bg-[var(--color-aura-dim)] text-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text)]'
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
          <button
            onClick={() => navigate('/emergency-access')}
            className={getNavItemClass(isNavActive('/emergency-access'))}
          >
            🛡️ Emergency
          </button>

          <div className="pt-2 pb-1">
            <p className="px-3 text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
              Types
            </p>
          </div>
          {['login', 'note', 'card', 'identity', 'passkey', 'document'].map((type) => (
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
              {type === 'login'
                ? 'Logins'
                : type === 'note'
                  ? 'Secure Notes'
                  : type === 'card'
                    ? 'Cards'
                    : type === 'identity'
                      ? 'Identities'
                      : type === 'passkey'
                        ? 'Passkeys'
                        : 'Documents'}
            </button>
          ))}

          {/* Folders */}
          <div className="pt-2 pb-1 flex items-center justify-between">
            <p className="px-3 text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
              Folders
            </p>
            <button
              onClick={() => setShowNewFolder(true)}
              className="px-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary-hover)] transition-colors text-sm"
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
                className="flex-1 px-2 py-1 text-sm border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)] placeholder-[var(--color-text-tertiary)]"
                autoFocus
              />
              <button
                onClick={handleCreateFolder}
                className="px-2 py-1 text-xs bg-[var(--color-primary)] text-[var(--color-primary-fg)] rounded hover:bg-[var(--color-primary-hover)]"
              >
                ✓
              </button>
              <button
                onClick={() => {
                  setShowNewFolder(false);
                  setNewFolderName('');
                }}
                className="px-2 py-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
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
                  className="flex-1 px-2 py-1 text-sm border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)] placeholder-[var(--color-text-tertiary)]"
                  autoFocus
                />
                <button
                  onClick={handleRenameFolder}
                  className="px-2 py-1 text-xs bg-[var(--color-primary)] text-[var(--color-primary-fg)] rounded hover:bg-[var(--color-primary-hover)]"
                >
                  ✓
                </button>
                <button
                  onClick={() => setEditingFolder(null)}
                  className="px-2 py-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                >
                  ✕
                </button>
              </div>
            ) : deletingFolderId === folder.id ? (
              <div key={folder.id} className="px-3 py-2">
                <p className="text-xs text-[var(--color-text-secondary)] mb-2">
                  Delete "{folder.name}"? Items will be moved to root.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDeleteFolder(folder.id)}
                    className="px-2 py-1 text-xs bg-[var(--color-error)] hover:bg-[var(--color-error)] text-[var(--color-primary-fg)] rounded"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setDeletingFolderId(null)}
                    className="px-2 py-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
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
                  className={`flex-1 text-left px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors truncate ${
                    isVaultActive && selectedFolder === folder.id
                      ? 'bg-[var(--color-aura-dim)] text-[var(--color-primary)]'
                      : 'hover:bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)]'
                  }`}
                >
                  📁 {folder.name}
                </button>
                <div className="hidden group-hover:flex gap-0.5 pr-1 shrink-0">
                  <button
                    onClick={() => setEditingFolder({ id: folder.id, name: folder.name })}
                    className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary-hover)] transition-colors"
                    title="Rename"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => setDeletingFolderId(folder.id)}
                    className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] transition-colors"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          )}
        </nav>

        <div className="p-3 border-t border-[var(--color-border)] space-y-1">
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
            className="w-full text-left px-3 py-2 rounded-[var(--radius-md)] text-sm hover:bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)] transition-colors"
          >
            🔒 Lock
          </button>
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded-[var(--radius-md)] text-sm hover:bg-[var(--color-surface-raised)] text-[var(--color-error)] transition-colors"
          >
            🚪 Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {isTravelMode && (
          <div className="bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-warning)] text-[var(--color-text)] px-4 py-2 text-sm flex items-center justify-between shadow-md z-50">
            <span className="flex items-center gap-2 font-medium">
              <span>⚠️</span>
              Travel mode active — some items are hidden
            </span>
            <button
              onClick={() => navigate('/settings')}
              className="hover:text-[var(--color-primary-hover)] underline"
            >
              Settings
            </button>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
