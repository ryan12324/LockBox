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
  const [showFilterPanel, setShowFilterPanel] = useState(false);
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
  const isVaultActive = isNavActive('/vault');

  const getPageTitle = (): string => {
    if (location.pathname === '/vault') {
      if (showFavorites) return 'Favorites';
      if (selectedType) {
        const labels: Record<string, string> = {
          login: 'Logins',
          note: 'Secure Notes',
          card: 'Cards',
          identity: 'Identities',
          passkey: 'Passkeys',
          document: 'Documents',
        };
        return labels[selectedType] ?? 'Vault';
      }
      const folder = folders.find((f) => f.id === selectedFolder);
      if (folder) return folder.name;
      return 'Vault';
    }
    if (location.pathname === '/trash') return 'Trash';
    if (location.pathname === '/chat') return 'Assistant';
    if (location.pathname === '/health') return 'Security';
    if (location.pathname.startsWith('/teams')) return 'Teams';
    if (location.pathname === '/emergency-access') return 'Emergency Access';
    if (location.pathname === '/generator') return 'Generator';
    if (location.pathname.startsWith('/settings')) return 'Settings';
    return 'Lockbox';
  };

  /* ── Rail icon button style ── */
  const getRailStyle = (isActive: boolean): React.CSSProperties => ({
    width: 36,
    height: 36,
    minHeight: 36,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'none',
    fontSize: '1rem',
    borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
    background: isActive ? 'var(--color-aura-dim)' : 'transparent',
    color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
    transition: 'all 150ms ease',
  });

  /* ── Filter panel nav item style ── */
  const getFilterItemStyle = (isActive: boolean): React.CSSProperties => ({
    width: '100%',
    justifyContent: 'flex-start',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'none',
    ...(isActive
      ? { background: 'var(--color-aura-dim)', color: 'var(--color-primary)' }
      : { color: 'var(--color-text-secondary)' }),
  });

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--color-bg)' }}>
      {/* ═══ Top Bar (56px) ═══ */}
      <header
        className="flex items-center shrink-0"
        style={{
          height: 56,
          paddingRight: 16,
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {/* Logo — aligned with 48px rail */}
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 48, height: 56 }}
        >
          <span style={{ fontSize: '1.25rem' }}>🔐</span>
        </div>

        <h1 className="text-sm font-semibold ml-3" style={{ color: 'var(--color-text)' }}>
          {getPageTitle()}
        </h1>

        <div className="flex-1" />

        {/* User area */}
        <div className="flex items-center gap-3">
          <span
            className="text-xs truncate hidden sm:block"
            style={{ color: 'var(--color-text-tertiary)', maxWidth: 180 }}
          >
            {session?.email}
          </span>
          <div
            className="flex items-center justify-center rounded-full text-xs font-bold shrink-0"
            style={{
              width: 30,
              height: 30,
              background: 'var(--color-aura-dim)',
              color: 'var(--color-primary)',
            }}
          >
            {session?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
        </div>
      </header>

      {/* ═══ Body: Aura + Rail + Content ═══ */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Aura glow — 80px wide, bleeds 32px past the 48px rail into content */}
        <Aura state={auraState} position="sidebar" style={{ zIndex: 1 }} />

        {/* ── Icon Rail (48px) ── */}
        <nav className="relative shrink-0 flex flex-col" style={{ width: 48, zIndex: 20 }}>
          {/* Primary nav */}
          <div className="flex flex-col items-center gap-0.5 pt-2 flex-1">
            <Button
              variant="ghost"
              size="sm"
              title="All Items"
              onClick={() => {
                setSelectedFolder(null);
                setSelectedType(null);
                setShowFavorites(false);
                navToVault();
              }}
              style={getRailStyle(
                isVaultActive && !selectedFolder && !selectedType && !showFavorites
              )}
            >
              📋
            </Button>

            <Button
              variant="ghost"
              size="sm"
              title="Favorites"
              onClick={() => {
                setShowFavorites(true);
                setSelectedType(null);
                setSelectedFolder(null);
                navToVault();
              }}
              style={getRailStyle(isVaultActive && showFavorites)}
            >
              ⭐
            </Button>

            <Button
              variant="ghost"
              size="sm"
              title="Trash"
              onClick={() => navigate('/trash')}
              style={getRailStyle(isNavActive('/trash'))}
            >
              🗑️
            </Button>

            <Button
              variant="ghost"
              size="sm"
              title="Assistant"
              onClick={() => navigate('/chat')}
              style={getRailStyle(isNavActive('/chat'))}
            >
              ✨
            </Button>

            <Button
              variant="ghost"
              size="sm"
              title="Security"
              onClick={() => navigate('/health')}
              style={getRailStyle(isNavActive('/health'))}
            >
              🛡️
            </Button>

            <Button
              variant="ghost"
              size="sm"
              title="Teams"
              onClick={() => navigate('/teams')}
              style={getRailStyle(location.pathname.startsWith('/teams'))}
            >
              👥
            </Button>

            <Button
              variant="ghost"
              size="sm"
              title="Emergency Access"
              onClick={() => navigate('/emergency-access')}
              style={getRailStyle(isNavActive('/emergency-access'))}
            >
              🆘
            </Button>

            {/* Divider */}
            <div
              style={{
                width: 20,
                height: 1,
                background: 'var(--color-border)',
                margin: '4px 0',
                opacity: 0.5,
              }}
            />

            <Button
              variant="ghost"
              size="sm"
              title="Filters & Folders"
              onClick={() => setShowFilterPanel(!showFilterPanel)}
              style={getRailStyle(
                showFilterPanel || (isVaultActive && (!!selectedType || !!selectedFolder))
              )}
            >
              ≡
            </Button>

            <Button
              variant="ghost"
              size="sm"
              title="Generator"
              onClick={() => navigate('/generator')}
              style={getRailStyle(isNavActive('/generator'))}
            >
              🎲
            </Button>
          </div>

          {/* Bottom nav */}
          <div className="flex flex-col items-center gap-0.5 pb-3">
            <Button
              variant="ghost"
              size="sm"
              title="Settings"
              onClick={() => navigate('/settings')}
              style={getRailStyle(location.pathname.startsWith('/settings'))}
            >
              ⚙️
            </Button>

            <Button
              variant="ghost"
              size="sm"
              title="Lock"
              onClick={lock}
              style={{ ...getRailStyle(false), color: 'var(--color-text-secondary)' }}
            >
              🔒
            </Button>

            <Button
              variant="ghost"
              size="sm"
              title="Sign Out"
              onClick={handleLogout}
              style={{ ...getRailStyle(false), color: 'var(--color-error)' }}
            >
              🚪
            </Button>
          </div>
        </nav>

        {/* ── Filter Panel (slide-over) ── */}
        {showFilterPanel && (
          <aside
            className="overflow-y-auto shrink-0"
            style={{
              width: 220,
              background: 'color-mix(in srgb, var(--color-surface) 88%, transparent)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderRight: '1px solid var(--color-border)',
              padding: 12,
              zIndex: 15,
            }}
          >
            {/* Types */}
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-2 px-2"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Types
            </p>
            <div className="space-y-0.5 mb-4">
              {(['login', 'note', 'card', 'identity', 'passkey', 'document'] as const).map(
                (type) => (
                  <Button
                    key={type}
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedType(type);
                      setSelectedFolder(null);
                      setShowFavorites(false);
                      navToVault();
                      setShowFilterPanel(false);
                    }}
                    style={getFilterItemStyle(isVaultActive && selectedType === type)}
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
                )
              )}
            </div>

            {/* Folders */}
            <div className="flex items-center justify-between mb-2">
              <p
                className="text-xs font-semibold uppercase tracking-wider px-2"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
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
              <div className="flex gap-1 px-1 mb-1">
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
                  style={{
                    padding: '4px 8px',
                    minHeight: 'auto',
                    fontSize: 'var(--font-size-xs)',
                  }}
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
                <div key={folder.id} className="flex gap-1 px-1 mb-1">
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
                    style={{
                      padding: '4px 8px',
                      minHeight: 'auto',
                      fontSize: 'var(--font-size-xs)',
                    }}
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
                <div key={folder.id} className="px-2 py-2">
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
                      setShowFilterPanel(false);
                    }}
                    style={{
                      ...getFilterItemStyle(isVaultActive && selectedFolder === folder.id),
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
          </aside>
        )}

        {/* ── Main Content ── */}
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
        </main>
      </div>
    </div>
  );
}
