import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { Button, Icon, Input, type IconName } from '@lockbox/design';
import { useAuthStore } from '../store/auth.js';
import { useVaultFilterStore } from '../store/vault.js';
import { useToast } from '../providers/ToastProvider.js';
import { api } from '../lib/api.js';
import { decryptVaultItem, encryptVaultItem } from '../lib/crypto.js';
import { clearNativeAutofillIndex } from '../lib/native-autofill.js';
import type { Folder, VaultItem } from '@lockbox/types';

const vaultTypes: Array<{ type: string; label: string; icon: IconName }> = [
  { type: 'login', label: 'Logins', icon: 'key' },
  { type: 'note', label: 'Secure notes', icon: 'note' },
  { type: 'card', label: 'Cards', icon: 'credit-card' },
  { type: 'identity', label: 'Identities', icon: 'id' },
  { type: 'passkey', label: 'Passkeys', icon: 'fingerprint' },
  { type: 'document', label: 'Documents', icon: 'file-description' },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { session, userKey, lock, logout } = useAuthStore();
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

  const [showNavigation, setShowNavigation] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<{ id: string; name: string } | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [isTravelMode, setIsTravelMode] = useState(false);

  useEffect(() => {
    if (!session) return;
    api.vault
      .list(session.token)
      .then((response: { folders: Folder[] }) => setFolders(response.folders))
      .catch(() => toast('Folders could not be loaded. Your vault items are unchanged.', 'error'));
    api.settings
      .getTravelMode(session.token)
      .then((response) => setIsTravelMode(response.enabled))
      .catch(() => toast('Travel mode status could not be checked.', 'warning'));
  }, [session, setFolders, toast]);

  useEffect(() => setShowNavigation(false), [location.pathname]);

  async function handleLogout() {
    if (session) await api.auth.logout(session.token).catch(() => {});
    await clearNativeAutofillIndex().catch(() => {});
    logout();
    navigate('/login');
  }

  async function refreshFolders() {
    if (!session) return;
    const response = await api.vault.list(session.token);
    setFolders(response.folders);
    triggerUpdate();
  }

  async function handleCreateFolder() {
    if (!session || !newFolderName.trim()) return;
    try {
      await api.vault.createFolder({ name: newFolderName.trim() }, session.token);
      setNewFolderName('');
      setShowNewFolder(false);
      await refreshFolders();
      toast('Folder created.', 'success');
    } catch {
      toast('Folder could not be created. Try again.', 'error');
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
      await refreshFolders();
      toast('Folder renamed.', 'success');
    } catch {
      toast('Folder could not be renamed. Try again.', 'error');
    }
  }

  async function handleDeleteFolder(id: string) {
    if (!session || !userKey) return;
    try {
      const vault = (await api.vault.list(session.token)) as {
        items: Array<{
          id: string;
          encryptedData: string;
          revisionDate: string;
          folderId: string | null;
        }>;
        folders: Folder[];
      };
      for (const encryptedItem of vault.items.filter((item) => item.folderId === id)) {
        const item = await decryptVaultItem(
          encryptedItem.encryptedData,
          userKey,
          encryptedItem.id,
          encryptedItem.revisionDate
        );
        const now = new Date().toISOString();
        const movedItem = {
          ...item,
          folderId: undefined,
          updatedAt: now,
          revisionDate: now,
        } as VaultItem;
        const encryptedData = await encryptVaultItem(movedItem, userKey, encryptedItem.id, now);
        await api.vault.updateItem(
          encryptedItem.id,
          {
            encryptedData,
            folderId: null,
            tags: movedItem.tags ?? [],
            favorite: movedItem.favorite ?? false,
            revisionDate: now,
            expectedRevisionDate: encryptedItem.revisionDate,
          },
          session.token
        );
      }
      await api.vault.deleteFolder(id, session.token);
      setDeletingFolderId(null);
      if (selectedFolder === id) setSelectedFolder(null);
      await refreshFolders();
      toast('Folder deleted. Its items remain in your vault.', 'success');
    } catch {
      toast('Folder could not be deleted. No items were intentionally removed.', 'error');
    }
  }

  function showVault(filter?: { type?: string; folder?: string; favorites?: boolean }) {
    setSelectedType(filter?.type ?? null);
    setSelectedFolder(filter?.folder ?? null);
    setShowFavorites(filter?.favorites ?? false);
    if (location.pathname !== '/vault') navigate('/vault');
    setShowNavigation(false);
  }

  const isVaultRoute = location.pathname === '/vault';
  const pageTitle = (() => {
    if (isVaultRoute) {
      if (showFavorites) return 'Favorites';
      if (selectedType) return vaultTypes.find((entry) => entry.type === selectedType)?.label ?? 'Vault';
      if (selectedFolder) return folders.find((folder) => folder.id === selectedFolder)?.name ?? 'Vault';
      return 'Vault';
    }
    if (location.pathname === '/trash') return 'Trash';
    if (location.pathname === '/health') return 'Security';
    if (location.pathname.startsWith('/teams')) return 'Teams';
    if (location.pathname === '/generator') return 'Generator';
    if (location.pathname.startsWith('/settings')) return 'Settings';
    return 'Lockbox';
  })();

  const navButton = (
    label: string,
    icon: IconName,
    active: boolean,
    action: () => void,
    options?: { danger?: boolean }
  ) => (
    <button
      type="button"
      className="app-nav__item"
      data-active={active ? 'true' : undefined}
      data-danger={options?.danger ? 'true' : undefined}
      aria-current={active ? 'page' : undefined}
      onClick={action}
    >
      <Icon name={icon} size={20} />
      <span className="app-nav__label">{label}</span>
    </button>
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-brandmark" aria-hidden="true">
            <img src="/brand/lockbox-app-icon.png" alt="" />
          </span>
          <span className="app-header__wordmark">Lockbox</span>
        </div>
        <button
          type="button"
          className="lb-icon-button app-header__menu"
          aria-label="Open navigation"
          aria-expanded={showNavigation}
          onClick={() => setShowNavigation((open) => !open)}
        >
          <Icon name="menu-2" size={22} />
        </button>
        <h1 className="app-header__title">{pageTitle}</h1>
        <div className="app-header__account" title={session?.email}>
          <span className="app-header__email">{session?.email}</span>
          <span className="app-avatar" aria-hidden="true">
            {session?.email?.[0]?.toUpperCase() ?? '?'}
          </span>
        </div>
      </header>

      <div className="app-shell__body">
        {showNavigation && (
          <button
            type="button"
            className="app-nav__scrim"
            aria-label="Close navigation"
            onClick={() => setShowNavigation(false)}
          />
        )}

        <aside className="app-sidebar" data-open={showNavigation ? 'true' : undefined}>
          <nav className="app-nav" aria-label="Main navigation">
            <div className="app-nav__primary">
              {navButton(
                'Vault',
                'shield-lock',
                isVaultRoute && !selectedFolder && !selectedType && !showFavorites,
                () => showVault()
              )}
              {navButton('Favorites', 'star', isVaultRoute && showFavorites, () => showVault({ favorites: true }))}
              {navButton('Security', 'shield-check', location.pathname === '/health', () => navigate('/health'))}
              {navButton('Generator', 'wand', location.pathname === '/generator', () => navigate('/generator'))}
              {navButton('Teams', 'users', location.pathname.startsWith('/teams'), () => navigate('/teams'))}
            </div>

            <div className="app-nav__section app-nav__browse">
              <p className="app-nav__section-title">Types</p>
              {vaultTypes.map((entry) => (
                <div key={entry.type}>
                  {navButton(
                    entry.label,
                    entry.icon,
                    isVaultRoute && selectedType === entry.type,
                    () => showVault({ type: entry.type })
                  )}
                </div>
              ))}
            </div>

            <div className="app-nav__section app-nav__folders">
              <div className="app-nav__section-heading">
                <p className="app-nav__section-title">Folders</p>
                <button
                  type="button"
                  className="lb-icon-button app-nav__folder-action"
                  onClick={() => setShowNewFolder(true)}
                  aria-label="Create folder"
                >
                  <Icon name="folder-plus" size={18} />
                </button>
              </div>

              {showNewFolder && (
                <form
                  className="app-nav__folder-editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleCreateFolder();
                  }}
                >
                  <Input
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setShowNewFolder(false);
                        setNewFolderName('');
                      }
                    }}
                    placeholder="Folder name"
                    aria-label="Folder name"
                    autoFocus
                  />
                  <button type="submit" className="lb-icon-button" aria-label="Save folder">
                    <Icon name="check" size={18} />
                  </button>
                  <button
                    type="button"
                    className="lb-icon-button"
                    aria-label="Cancel new folder"
                    onClick={() => {
                      setShowNewFolder(false);
                      setNewFolderName('');
                    }}
                  >
                    <Icon name="x" size={18} />
                  </button>
                </form>
              )}

              <div className="app-nav__folder-list">
                {folders.length === 0 && !showNewFolder && (
                  <p className="app-nav__empty">No folders yet</p>
                )}
                {folders.map((folder) => {
                  if (editingFolder?.id === folder.id) {
                    return (
                      <form
                        key={folder.id}
                        className="app-nav__folder-editor"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void handleRenameFolder();
                        }}
                      >
                        <Input
                          value={editingFolder.name}
                          onChange={(event) => setEditingFolder({ ...editingFolder, name: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') setEditingFolder(null);
                          }}
                          aria-label={`Rename ${folder.name}`}
                          autoFocus
                        />
                        <button type="submit" className="lb-icon-button" aria-label="Save folder name">
                          <Icon name="check" size={18} />
                        </button>
                        <button type="button" className="lb-icon-button" aria-label="Cancel rename" onClick={() => setEditingFolder(null)}>
                          <Icon name="x" size={18} />
                        </button>
                      </form>
                    );
                  }

                  if (deletingFolderId === folder.id) {
                    return (
                      <div key={folder.id} className="app-nav__folder-confirm" role="alert">
                        <p>Delete “{folder.name}”? Its items move to the main vault.</p>
                        <div>
                          <Button variant="danger" size="sm" onClick={() => void handleDeleteFolder(folder.id)}>Delete</Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeletingFolderId(null)}>Cancel</Button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={folder.id} className="app-nav__folder-row">
                      <button
                        type="button"
                        className="app-nav__item app-nav__folder-link"
                        data-active={isVaultRoute && selectedFolder === folder.id ? 'true' : undefined}
                        onClick={() => showVault({ folder: folder.id })}
                      >
                        <Icon name="folder" size={18} />
                        <span>{folder.name}</span>
                      </button>
                      <div className="app-nav__folder-actions">
                        <button
                          type="button"
                          className="lb-icon-button"
                          onClick={() => setEditingFolder({ id: folder.id, name: folder.name })}
                          aria-label={`Rename ${folder.name}`}
                        >
                          <Icon name="edit" size={16} />
                        </button>
                        <button
                          type="button"
                          className="lb-icon-button"
                          onClick={() => setDeletingFolderId(folder.id)}
                          aria-label={`Delete ${folder.name}`}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="app-nav__footer">
              {navButton('Trash', 'trash', location.pathname === '/trash', () => navigate('/trash'))}
              {navButton('Settings', 'settings', location.pathname.startsWith('/settings'), () => navigate('/settings'))}
              {navButton('Lock vault', 'lock', false, lock)}
              {navButton('Sign out', 'logout', false, () => void handleLogout(), { danger: true })}
            </div>
          </nav>
        </aside>

        <main className="app-main">
          {isTravelMode && (
            <div className="app-travel" role="status">
              <Icon name="alert-triangle" size={20} />
              <span><strong>Travel mode is on.</strong> Items outside your travel folders are hidden.</span>
              <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>Review settings</Button>
            </div>
          )}
          <div className="app-main__route"><Outlet /></div>
        </main>
      </div>

      <nav className="app-bottom-nav" aria-label="Mobile navigation">
        {navButton('Vault', 'shield-lock', isVaultRoute, () => showVault())}
        {navButton('Generator', 'wand', location.pathname === '/generator', () => navigate('/generator'))}
        {navButton('Security', 'shield-check', location.pathname === '/health', () => navigate('/health'))}
        {navButton('More', 'menu-2', showNavigation, () => setShowNavigation((open) => !open))}
      </nav>
    </div>
  );
}
