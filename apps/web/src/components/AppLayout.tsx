import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Aura, Button, Input } from '@lockbox/design';
import { useAuthStore } from '../store/auth.js';
import { useVaultFilterStore } from '../store/vault.js';
import { useAura } from '../providers/AuraProvider.js';
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
  const { state: auraState } = useAura();

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

  const getNavItemStyle = (isActive: boolean): React.CSSProperties => ({
    width: '100%',
    justifyContent: 'flex-start',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'none',
    ...(isActive
      ? {
          background: 'var(--color-aura-dim)',
          color: 'var(--color-primary)',
        }
      : {
          color: 'var(--color-text-secondary)',
        }),
  });

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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedFolder(null);
              setSelectedType(null);
              setShowFavorites(false);
              navToVault();
            }}
            style={getNavItemStyle(
              isVaultActive && !selectedFolder && !selectedType && !showFavorites
            )}
          >
            📋 All Items
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowFavorites(true);
              setSelectedType(null);
              setSelectedFolder(null);
              navToVault();
            }}
            style={getNavItemStyle(isVaultActive && showFavorites)}
          >
            ⭐ Favorites
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/trash')}
            style={getNavItemStyle(isNavActive('/trash'))}
          >
            🗑️ Trash
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/chat')}
            style={getNavItemStyle(isNavActive('/chat'))}
          >
            <span className="text-lg">✨</span>
            <span className="text-sm font-medium">Assistant</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/health')}
            style={getNavItemStyle(isNavActive('/health'))}
          >
            🛡️ Security
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/teams')}
            style={getNavItemStyle(location.pathname.startsWith('/teams'))}
          >
            👥 Teams
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/emergency-access')}
            style={getNavItemStyle(isNavActive('/emergency-access'))}
          >
            🛡️ Emergency
          </Button>

          <div className="pt-2 pb-1">
            <p className="px-3 text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
              Types
            </p>
          </div>
          {['login', 'note', 'card', 'identity', 'passkey', 'document'].map((type) => (
            <Button
              key={type}
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedType(type);
                setSelectedFolder(null);
                setShowFavorites(false);
                navToVault();
              }}
              style={getNavItemStyle(isVaultActive && selectedType === type)}
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
            </Button>
          ))}

          {/* Folders */}
          <div className="pt-2 pb-1 flex items-center justify-between">
            <p className="px-3 text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
              Folders
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNewFolder(true)}
              title="New folder"
              style={{
                padding: '2px 8px',
                minHeight: 'auto',
                boxShadow: 'none',
                color: 'var(--color-text-tertiary)',
              }}
            >
              +
            </Button>
          </div>

          {showNewFolder && (
            <div className="flex gap-1 px-2 mb-1">
              <Input
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
                className="flex-1"
                style={{ padding: '4px 8px', fontSize: 'var(--font-size-sm)' }}
                autoFocus
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateFolder}
                style={{ padding: '4px 8px', minHeight: 'auto', fontSize: 'var(--font-size-xs)' }}
              >
                ✓
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowNewFolder(false);
                  setNewFolderName('');
                }}
                style={{
                  padding: '4px 8px',
                  minHeight: 'auto',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-tertiary)',
                  boxShadow: 'none',
                }}
              >
                ✕
              </Button>
            </div>
          )}

          {folders.map((folder) =>
            editingFolder?.id === folder.id ? (
              <div key={folder.id} className="flex gap-1 px-2 mb-1">
                <Input
                  value={editingFolder.name}
                  onChange={(e) => setEditingFolder({ ...editingFolder, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameFolder();
                    if (e.key === 'Escape') setEditingFolder(null);
                  }}
                  className="flex-1"
                  style={{ padding: '4px 8px', fontSize: 'var(--font-size-sm)' }}
                  autoFocus
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRenameFolder}
                  style={{ padding: '4px 8px', minHeight: 'auto', fontSize: 'var(--font-size-xs)' }}
                >
                  ✓
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingFolder(null)}
                  style={{
                    padding: '4px 8px',
                    minHeight: 'auto',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-tertiary)',
                    boxShadow: 'none',
                  }}
                >
                  ✕
                </Button>
              </div>
            ) : deletingFolderId === folder.id ? (
              <div key={folder.id} className="px-3 py-2">
                <p className="text-xs text-[var(--color-text-secondary)] mb-2">
                  Delete &quot;{folder.name}&quot;? Items will be moved to root.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteFolder(folder.id)}
                    style={{
                      padding: '4px 8px',
                      minHeight: 'auto',
                      fontSize: 'var(--font-size-xs)',
                    }}
                  >
                    Delete
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingFolderId(null)}
                    style={{
                      padding: '4px 8px',
                      minHeight: 'auto',
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--color-text-tertiary)',
                      boxShadow: 'none',
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div key={folder.id} className="group flex items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedFolder(folder.id);
                    setSelectedType(null);
                    setShowFavorites(false);
                    navToVault();
                  }}
                  style={{
                    ...getNavItemStyle(isVaultActive && selectedFolder === folder.id),
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  📁 {folder.name}
                </Button>
                <div className="hidden group-hover:flex gap-0.5 pr-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingFolder({ id: folder.id, name: folder.name })}
                    title="Rename"
                    style={{
                      padding: '4px',
                      minHeight: 'auto',
                      boxShadow: 'none',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    ✎
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingFolderId(folder.id)}
                    title="Delete"
                    style={{
                      padding: '4px',
                      minHeight: 'auto',
                      boxShadow: 'none',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    ✕
                  </Button>
                </div>
              </div>
            )
          )}
        </nav>

        <div className="p-3 border-t border-[var(--color-border)] space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/generator')}
            style={getNavItemStyle(isNavActive('/generator'))}
          >
            🎲 Generator
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/settings')}
            style={getNavItemStyle(location.pathname.startsWith('/settings'))}
          >
            ⚙️ Settings
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={lock}
            style={{
              width: '100%',
              justifyContent: 'flex-start',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'none',
              color: 'var(--color-text-secondary)',
            }}
          >
            🔒 Lock
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            style={{
              width: '100%',
              justifyContent: 'flex-start',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'none',
              color: 'var(--color-error)',
            }}
          >
            🚪 Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {isTravelMode && (
          <div className="bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-warning)] text-[var(--color-text)] px-4 py-2 text-sm flex items-center justify-between shadow-md z-50">
            <span className="flex items-center gap-2 font-medium">
              <span>⚠️</span>
              Travel mode active — some items are hidden
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/settings')}
              style={{
                textDecoration: 'underline',
                boxShadow: 'none',
                padding: '2px 4px',
                minHeight: 'auto',
              }}
            >
              Settings
            </Button>
          </div>
        )}
        <div className="fade-in flex-1 flex flex-col overflow-hidden">
          <Outlet />
        </div>
        <Aura state={auraState} position="corner" />
      </main>
    </div>
  );
}
