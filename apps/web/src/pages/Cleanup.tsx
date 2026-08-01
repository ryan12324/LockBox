import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Icon,
  Input,
  Select,
  SiteFavicon,
  getEntryFaviconSources,
} from '@lockbox/design';
import {
  getLoginUriValidationError,
  normalizeLoginUriForStorage,
  type Folder,
  type LoginItem,
  type VaultItem,
} from '@lockbox/types';
import { useAuthStore } from '../store/auth.js';
import { useToast } from '../providers/ToastProvider.js';
import { api } from '../lib/api.js';
import { decryptVaultItem, encryptVaultItem } from '../lib/crypto.js';
import {
  buildMergedLogin,
  findCleanupCandidates,
  findDuplicateLoginGroups,
  getLocalFolderSuggestion,
  type MergeField,
  type MergeSelections,
} from '../lib/vault-cleanup.js';

type CleanupView = 'guided' | 'duplicates' | 'bulk' | 'sorting';

interface GuidedDraft {
  name: string;
  username: string;
  password: string;
  destination: string;
  folderId: string;
}

const EMPTY_DRAFT: GuidedDraft = {
  name: '',
  username: '',
  password: '',
  destination: '',
  folderId: '',
};

function loginSubtitle(item: LoginItem): string {
  return item.username || item.uris[0] || 'Missing sign-in details';
}

function optionLabel(item: LoginItem, field: MergeField, folders: readonly Folder[]): string {
  const suffix = item.username || item.uris[0] || item.name;
  if (field === 'password') return `Password from ${item.name} (${suffix})`;
  if (field === 'totp') return `Authenticator from ${item.name} (${suffix})`;
  if (field === 'folderId') {
    const folder = folders.find((candidate) => candidate.id === item.folderId);
    return folder?.name ?? 'No folder';
  }
  return item[field] || `Blank in ${item.name}`;
}

function mergeFieldValue(item: LoginItem, field: MergeField): string {
  if (field === 'folderId') return item.folderId ?? '';
  return item[field] ?? '';
}

export default function Cleanup() {
  const navigate = useNavigate();
  const { session, userKey } = useAuthStore();
  const { toast } = useToast();
  const [view, setView] = useState<CleanupView>('guided');
  const [items, setItems] = useState<VaultItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [corruptCount, setCorruptCount] = useState(0);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [fixedCount, setFixedCount] = useState(0);
  const [guidedDraft, setGuidedDraft] = useState<GuidedDraft>(EMPTY_DRAFT);
  const [savingGuided, setSavingGuided] = useState(false);

  const [bulkQuery, setBulkQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [keeperId, setKeeperId] = useState('');
  const [mergeSelections, setMergeSelections] = useState<MergeSelections>({});
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState('');

  const [sortingSelectedIds, setSortingSelectedIds] = useState<Set<string>>(new Set());
  const [showSortingConfirm, setShowSortingConfirm] = useState(false);
  const [sortingApplying, setSortingApplying] = useState(false);

  const skippedStorageKey = session ? `authwell-cleanup-skipped:${session.userId}` : '';

  const loadVault = useCallback(async () => {
    if (!session || !userKey) return;
    setLoading(true);
    setLoadError('');
    try {
      const response = await api.vault.list(session.token);
      const results = await Promise.allSettled(
        response.items
          .filter((item) => !item.deletedAt)
          .map((item) => decryptVaultItem(item.encryptedData, userKey, item.id, item.revisionDate))
      );
      const decrypted = results
        .filter((result): result is PromiseFulfilledResult<VaultItem> => result.status === 'fulfilled')
        .map((result) => result.value)
        .sort((left, right) => left.name.localeCompare(right.name));
      setItems(decrypted);
      setFolders(response.folders);
      setCorruptCount(results.filter((result) => result.status === 'rejected').length);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Your vault could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [session, userKey]);

  useEffect(() => {
    void loadVault();
  }, [loadVault]);

  useEffect(() => {
    if (!skippedStorageKey) return;
    try {
      const stored = JSON.parse(localStorage.getItem(skippedStorageKey) ?? '[]') as unknown;
      setSkippedIds(
        new Set(Array.isArray(stored) ? stored.filter((value): value is string => typeof value === 'string') : [])
      );
    } catch {
      setSkippedIds(new Set());
    }
  }, [skippedStorageKey]);

  const cleanupCandidates = useMemo(() => findCleanupCandidates(items), [items]);
  const visibleCleanupCandidates = cleanupCandidates.filter(
    (candidate) => !skippedIds.has(candidate.item.id)
  );
  const currentCandidate = visibleCleanupCandidates[0] ?? null;
  const duplicateGroups = useMemo(() => findDuplicateLoginGroups(items), [items]);
  const currentDuplicateGroup = duplicateGroups[0] ?? null;
  const loginItems = useMemo(
    () => items.filter((item): item is LoginItem => item.type === 'login'),
    [items]
  );
  const visibleBulkItems = loginItems.filter((item) => {
    const query = bulkQuery.trim().toLocaleLowerCase();
    if (!query) return true;
    return [item.name, item.username, ...item.uris]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query);
  });
  const sortingSuggestions = useMemo(
    () =>
      loginItems.flatMap((item) => {
        const suggestion = getLocalFolderSuggestion(item);
        return suggestion ? [{ item, ...suggestion }] : [];
      }),
    [loginItems]
  );

  useEffect(() => {
    if (!currentCandidate) {
      setGuidedDraft(EMPTY_DRAFT);
      return;
    }
    setGuidedDraft({
      name: currentCandidate.item.name,
      username: currentCandidate.item.username,
      password: currentCandidate.item.password,
      destination: currentCandidate.item.uris[0] ?? '',
      folderId: currentCandidate.item.folderId ?? '',
    });
  }, [currentCandidate?.item.id, currentCandidate?.item.revisionDate]);

  useEffect(() => {
    if (!currentDuplicateGroup) {
      setKeeperId('');
      setMergeSelections({});
      return;
    }
    const initialKeeper = currentDuplicateGroup.items[0].id;
    setKeeperId(initialKeeper);
    setMergeSelections({
      name: initialKeeper,
      username: initialKeeper,
      password: initialKeeper,
      totp: initialKeeper,
      folderId: initialKeeper,
    });
    setShowMergeConfirm(false);
    setMergeError('');
  }, [currentDuplicateGroup?.id]);

  useEffect(() => {
    setSortingSelectedIds(new Set(sortingSuggestions.map((suggestion) => suggestion.item.id)));
  }, [sortingSuggestions.length]);

  function persistSkipped(next: Set<string>) {
    setSkippedIds(next);
    if (skippedStorageKey) localStorage.setItem(skippedStorageKey, JSON.stringify([...next]));
  }

  function updateLocalItem(updated: VaultItem) {
    setItems((current) =>
      current
        .map((item) => (item.id === updated.id ? updated : item))
        .sort((left, right) => left.name.localeCompare(right.name))
    );
  }

  async function saveEncryptedItem(updated: VaultItem, expectedRevisionDate: string) {
    if (!session || !userKey) throw new Error('Your vault session has expired.');
    const encryptedData = await encryptVaultItem(
      updated,
      userKey,
      updated.id,
      updated.revisionDate
    );
    await api.vault.updateItem(
      updated.id,
      {
        encryptedData,
        folderId: updated.folderId ?? null,
        tags: updated.tags,
        favorite: updated.favorite,
        revisionDate: updated.revisionDate,
        expectedRevisionDate,
      },
      session.token
    );
  }

  async function handleGuidedSave() {
    if (!currentCandidate) return;
    const destination = guidedDraft.destination.trim();
    const uriError = getLoginUriValidationError(destination);
    if (!guidedDraft.name.trim()) return toast('Add a name before saving.', 'error');
    if (uriError) return toast(uriError, 'error');

    setSavingGuided(true);
    try {
      const now = new Date().toISOString();
      const current = currentCandidate.item;
      const nextUris = destination
        ? [normalizeLoginUriForStorage(destination), ...current.uris.slice(1)]
        : current.uris.slice(1);
      const updated: LoginItem = {
        ...current,
        name: guidedDraft.name.trim(),
        username: guidedDraft.username.trim(),
        password: guidedDraft.password,
        uris: nextUris,
        folderId: guidedDraft.folderId || undefined,
        updatedAt: now,
        revisionDate: now,
      };
      await saveEncryptedItem(updated, current.revisionDate);
      updateLocalItem(updated);
      const remainingIssueCount = findCleanupCandidates([updated])[0]?.issues.length ?? 0;
      if (remainingIssueCount < currentCandidate.issues.length) {
        setFixedCount((count) => count + 1);
      }
      persistSkipped(new Set([...skippedIds].filter((id) => id !== current.id)));
      toast('Login updated. Moving to the next cleanup prompt.', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'This login could not be updated.', 'error');
    } finally {
      setSavingGuided(false);
    }
  }

  function handleGuidedSkip() {
    if (!currentCandidate) return;
    persistSkipped(new Set([...skippedIds, currentCandidate.item.id]));
  }

  function toggleSelected(id: string, setter: (next: Set<string>) => void, current: Set<string>) {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  async function handleBulkDelete() {
    if (!session || selectedIds.size === 0) return;
    setBulkDeleting(true);
    const ids = [...selectedIds];
    const results = await Promise.allSettled(ids.map((id) => api.vault.deleteItem(id, session.token)));
    const deletedIds = new Set(
      results.flatMap((result, index) => (result.status === 'fulfilled' ? [ids[index]] : []))
    );
    const failedIds = new Set(ids.filter((id) => !deletedIds.has(id)));
    setItems((current) => current.filter((item) => !deletedIds.has(item.id)));
    setSelectedIds(failedIds);
    setShowBulkConfirm(false);
    setBulkDeleting(false);
    if (deletedIds.size > 0) {
      toast(
        `${deletedIds.size} ${deletedIds.size === 1 ? 'login' : 'logins'} moved to Trash.`,
        'success'
      );
    }
    if (failedIds.size > 0) toast(`${failedIds.size} logins could not be moved.`, 'error');
  }

  function selectKeeper(id: string) {
    setKeeperId(id);
    setMergeSelections({ name: id, username: id, password: id, totp: id, folderId: id });
  }

  function hasMergeVariants(field: MergeField): boolean {
    if (!currentDuplicateGroup) return false;
    return new Set(currentDuplicateGroup.items.map((item) => mergeFieldValue(item, field))).size > 1;
  }

  async function handleMerge() {
    if (!session || !userKey || !currentDuplicateGroup || !keeperId) return;
    setMerging(true);
    setMergeError('');
    const sourceItems = currentDuplicateGroup.items.filter((item) => item.id !== keeperId);
    try {
      const attachmentResults = await Promise.all(
        sourceItems.map((item) => api.attachments.list(item.id, session.token))
      );
      const attachmentCount = attachmentResults.reduce(
        (count, result) => count + result.attachments.length,
        0
      );
      if (attachmentCount > 0) {
        throw new Error(
          'One of the copies has attachments. Move those attachments to the primary login before merging.'
        );
      }

      const keeper = currentDuplicateGroup.items.find((item) => item.id === keeperId)!;
      const merged = buildMergedLogin(
        currentDuplicateGroup.items,
        keeperId,
        mergeSelections,
        new Date().toISOString()
      );
      await saveEncryptedItem(merged, keeper.revisionDate);
      const deleteResults = await Promise.allSettled(
        sourceItems.map((item) => api.vault.deleteItem(item.id, session.token))
      );
      const deletedIds = new Set(
        deleteResults.flatMap((result, index) =>
          result.status === 'fulfilled' ? [sourceItems[index].id] : []
        )
      );
      setItems((current) =>
        current
          .filter((item) => !deletedIds.has(item.id))
          .map((item) => (item.id === merged.id ? merged : item))
      );
      setShowMergeConfirm(false);
      toast('Login details merged. The other copies are recoverable from Trash.', 'success');
      if (deletedIds.size !== sourceItems.length) {
        toast('Some duplicate copies could not be moved to Trash and remain in your vault.', 'warning');
      }
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'These logins could not be merged.');
    } finally {
      setMerging(false);
    }
  }

  async function handleApplySorting() {
    if (!session || !userKey || sortingSelectedIds.size === 0) return;
    setSortingApplying(true);
    try {
      const selectedSuggestions = sortingSuggestions.filter((suggestion) =>
        sortingSelectedIds.has(suggestion.item.id)
      );
      const folderByName = new Map(
        folders.map((folder) => [folder.name.trim().toLocaleLowerCase(), folder])
      );
      const requiredNames = [...new Set(selectedSuggestions.map((suggestion) => suggestion.folderName))];
      const createdFolders: Folder[] = [];
      for (const name of requiredNames) {
        if (folderByName.has(name.toLocaleLowerCase())) continue;
        const response = await api.vault.createFolder({ name, parentId: null }, session.token);
        folderByName.set(name.toLocaleLowerCase(), response.folder);
        createdFolders.push(response.folder);
      }

      const updates = await Promise.allSettled(
        selectedSuggestions.map(async ({ item, folderName }) => {
          const folder = folderByName.get(folderName.toLocaleLowerCase());
          if (!folder) throw new Error(`The ${folderName} folder is unavailable.`);
          const now = new Date().toISOString();
          const updated: LoginItem = {
            ...item,
            folderId: folder.id,
            updatedAt: now,
            revisionDate: now,
          };
          await saveEncryptedItem(updated, item.revisionDate);
          return updated;
        })
      );
      const updatedItems = updates.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : []
      );
      const updatedById = new Map(updatedItems.map((item) => [item.id, item]));
      setFolders((current) => [...current, ...createdFolders]);
      setItems((current) =>
        current.map((item) => updatedById.get(item.id) ?? item)
      );
      setShowSortingConfirm(false);
      setSortingSelectedIds(new Set());
      if (updatedItems.length > 0) toast(`${updatedItems.length} logins organised locally.`, 'success');
      if (updatedItems.length !== selectedSuggestions.length) {
        toast('Some folder suggestions could not be applied.', 'warning');
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Local sorting could not be applied.', 'error');
    } finally {
      setSortingApplying(false);
    }
  }

  const folderOptions = [
    { value: '', label: 'No folder' },
    ...folders.map((folder) => ({ value: folder.id, label: folder.name })),
  ];
  const tabs: Array<{ id: CleanupView; label: string; count: number }> = [
    { id: 'guided', label: 'Simple cleanup', count: visibleCleanupCandidates.length },
    { id: 'duplicates', label: 'Duplicates', count: duplicateGroups.length },
    { id: 'bulk', label: 'Bulk cleanup', count: selectedIds.size },
    { id: 'sorting', label: 'Local sorting', count: sortingSuggestions.length },
  ];

  return (
    <main className="cleanup-page">
      <div className="cleanup-page__inner">
        <header className="cleanup-header">
          <div>
            <p className="cleanup-header__eyebrow">Vault maintenance</p>
            <h1>Cleanup</h1>
            <p>Repair incomplete logins, review duplicates, and organise your vault safely.</p>
          </div>
          <div className="cleanup-local-note">
            <Icon name="device-mobile" size={20} />
            <span><strong>Private by design</strong> Analysis happens on this device.</span>
          </div>
        </header>

        <nav className="cleanup-tabs" aria-label="Cleanup tools">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="cleanup-tabs__button"
              data-active={view === tab.id ? 'true' : undefined}
              aria-current={view === tab.id ? 'page' : undefined}
              onClick={() => setView(tab.id)}
            >
              <span>{tab.label}</span>
              {tab.count > 0 && <Badge>{tab.count}</Badge>}
            </button>
          ))}
        </nav>

        {corruptCount > 0 && (
          <div className="cleanup-notice cleanup-notice--warning" role="status">
            <Icon name="alert-triangle" size={18} />
            <span>{corruptCount} undecryptable {corruptCount === 1 ? 'item was' : 'items were'} excluded. Review them in the main vault.</span>
          </div>
        )}

        {loading ? (
          <div className="cleanup-state" role="status">
            <Icon name="loader-2" size={28} className="cleanup-spinner" />
            <strong>Checking your vault</strong>
            <span>Decrypting and analysing items on this device.</span>
          </div>
        ) : loadError ? (
          <div className="cleanup-state" role="alert">
            <Icon name="alert-triangle" size={30} />
            <strong>Cleanup is unavailable</strong>
            <span>{loadError}</span>
            <Button variant="secondary" onClick={() => void loadVault()}>
              <Icon name="refresh" size={18} /> Retry
            </Button>
          </div>
        ) : view === 'guided' ? (
          <section className="cleanup-process" aria-labelledby="guided-title">
            <div className="cleanup-process__heading">
              <div>
                <p>{fixedCount} fixed this session</p>
                <h2 id="guided-title">Simple cleanup</h2>
              </div>
              <span>{visibleCleanupCandidates.length} remaining</span>
            </div>

            {currentCandidate ? (
              <div className="cleanup-guided">
                <div className="cleanup-guided__context">
                  <div className="cleanup-item-heading">
                    <span className="cleanup-item-icon">
                      <SiteFavicon
                        sources={getEntryFaviconSources(currentCandidate.item)}
                        fallbackIcon="key"
                        size={24}
                        fill
                      />
                    </span>
                    <div>
                      <strong>{currentCandidate.item.name || 'Unnamed login'}</strong>
                      <span>{loginSubtitle(currentCandidate.item)}</span>
                    </div>
                  </div>
                  <p>Complete the useful details below. Fields that already contain data are preserved.</p>
                  <ul className="cleanup-issue-list">
                    {currentCandidate.issues.map((issue) => (
                      <li key={issue.field}>
                        <Icon name="alert-triangle" size={17} />
                        <span><strong>{issue.label}</strong>{issue.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <form
                  className="cleanup-guided__form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleGuidedSave();
                  }}
                >
                  <Input
                    label="Login name"
                    value={guidedDraft.name}
                    onChange={(event) => setGuidedDraft({ ...guidedDraft, name: event.target.value })}
                  />
                  <Input
                    label="Username or email"
                    value={guidedDraft.username}
                    onChange={(event) => setGuidedDraft({ ...guidedDraft, username: event.target.value })}
                  />
                  <Input
                    label="Password"
                    type="password"
                    autoComplete="new-password"
                    value={guidedDraft.password}
                    onChange={(event) => setGuidedDraft({ ...guidedDraft, password: event.target.value })}
                  />
                  <Input
                    label="Website or Android app"
                    placeholder="example.com or androidapp://com.example.app"
                    value={guidedDraft.destination}
                    onChange={(event) => setGuidedDraft({ ...guidedDraft, destination: event.target.value })}
                  />
                  <Select
                    label="Folder"
                    options={folderOptions}
                    value={guidedDraft.folderId}
                    onChange={(event) => setGuidedDraft({ ...guidedDraft, folderId: event.target.value })}
                  />
                  <div className="cleanup-actions cleanup-actions--split">
                    <Button type="button" variant="ghost" onClick={handleGuidedSkip}>Skip for now</Button>
                    <div>
                      <Button type="button" variant="secondary" onClick={() => navigate('/vault')}>Stop</Button>
                      <Button type="submit" loading={savingGuided}>Save and next</Button>
                    </div>
                  </div>
                </form>
              </div>
            ) : (
              <div className="cleanup-state cleanup-state--compact">
                <Icon name="circle-check" size={34} />
                <strong>{cleanupCandidates.length === 0 ? 'Your login details look complete' : 'Nothing else queued'}</strong>
                <span>
                  {cleanupCandidates.length === 0
                    ? 'No logins are missing a name, username, password, or destination.'
                    : 'You skipped the remaining prompts. Reset them whenever you are ready.'}
                </span>
                {cleanupCandidates.length > 0 && (
                  <Button variant="secondary" onClick={() => persistSkipped(new Set())}>Reset skipped prompts</Button>
                )}
              </div>
            )}
          </section>
        ) : view === 'bulk' ? (
          <section className="cleanup-process" aria-labelledby="bulk-title">
            <div className="cleanup-process__heading">
              <div><p>Recoverable deletion</p><h2 id="bulk-title">Bulk cleanup</h2></div>
              <span>{selectedIds.size} selected</span>
            </div>
            <div className="cleanup-toolbar">
              <div className="cleanup-search">
                <Icon name="search" size={18} />
                <input
                  type="search"
                  aria-label="Search logins to select"
                  placeholder="Search logins"
                  value={bulkQuery}
                  onChange={(event) => setBulkQuery(event.target.value)}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const visibleIds = visibleBulkItems.map((item) => item.id);
                  const allSelected = visibleIds.every((id) => selectedIds.has(id));
                  const next = new Set(selectedIds);
                  visibleIds.forEach((id) => allSelected ? next.delete(id) : next.add(id));
                  setSelectedIds(next);
                }}
              >
                {visibleBulkItems.length > 0 && visibleBulkItems.every((item) => selectedIds.has(item.id)) ? 'Clear visible' : 'Select visible'}
              </Button>
            </div>

            {showBulkConfirm && (
              <div className="cleanup-confirm" role="alert">
                <Icon name="trash" size={20} />
                <div><strong>Move {selectedIds.size} logins to Trash?</strong><span>They remain recoverable from Trash for 30 days.</span></div>
                <Button variant="danger" size="sm" loading={bulkDeleting} onClick={() => void handleBulkDelete()}>Move to Trash</Button>
                <Button variant="ghost" size="sm" onClick={() => setShowBulkConfirm(false)}>Cancel</Button>
              </div>
            )}

            <div className="cleanup-list" role="list">
              {visibleBulkItems.map((item) => (
                <label key={item.id} className="cleanup-select-row" role="listitem">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelected(item.id, setSelectedIds, selectedIds)}
                  />
                  <span className="cleanup-item-icon">
                    <SiteFavicon sources={getEntryFaviconSources(item)} fallbackIcon="key" size={21} fill />
                  </span>
                  <span className="cleanup-select-row__text"><strong>{item.name}</strong><small>{loginSubtitle(item)}</small></span>
                  <Badge>{item.folderId ? folders.find((folder) => folder.id === item.folderId)?.name ?? 'Folder' : 'No folder'}</Badge>
                </label>
              ))}
            </div>
            <div className="cleanup-footer-actions">
              <Button
                variant="danger"
                disabled={selectedIds.size === 0}
                onClick={() => setShowBulkConfirm(true)}
              >
                <Icon name="trash" size={18} /> Move selected to Trash
              </Button>
            </div>
          </section>
        ) : view === 'duplicates' ? (
          <section className="cleanup-process" aria-labelledby="duplicates-title">
            <div className="cleanup-process__heading">
              <div><p>Reviewed merging</p><h2 id="duplicates-title">Duplicate logins</h2></div>
              <span>{duplicateGroups.length} groups</span>
            </div>
            {currentDuplicateGroup ? (
              <div className="cleanup-merge">
                <div className="cleanup-merge__copies">
                  <p>These logins match by {currentDuplicateGroup.reasons.join(', ')}.</p>
                  {currentDuplicateGroup.items.map((item) => (
                    <label key={item.id} className="cleanup-merge-copy" data-keeper={keeperId === item.id ? 'true' : undefined}>
                      <input type="radio" name="keeper" checked={keeperId === item.id} onChange={() => selectKeeper(item.id)} />
                      <span className="cleanup-item-icon"><SiteFavicon sources={getEntryFaviconSources(item)} fallbackIcon="key" size={21} fill /></span>
                      <span><strong>{item.name}</strong><small>{loginSubtitle(item)}</small><small>Updated {new Date(item.updatedAt).toLocaleDateString()}</small></span>
                      {keeperId === item.id && <Badge variant="success">Keep</Badge>}
                    </label>
                  ))}
                </div>

                <div className="cleanup-merge__review">
                  <h3>Merge preview</h3>
                  <p>The primary login keeps its history. Unique websites, tags, and custom fields are combined.</p>
                  {(['name', 'username', 'password', 'totp', 'folderId'] as MergeField[])
                    .filter(hasMergeVariants)
                    .map((field) => (
                      <Select
                        key={field}
                        label={field === 'totp' ? 'Authenticator' : field === 'folderId' ? 'Folder' : `${field[0].toUpperCase()}${field.slice(1)}`}
                        value={mergeSelections[field] ?? keeperId}
                        options={currentDuplicateGroup.items.map((item) => ({
                          value: item.id,
                          label: optionLabel(item, field, folders),
                        }))}
                        onChange={(event) => setMergeSelections({ ...mergeSelections, [field]: event.target.value })}
                      />
                    ))}
                  <div className="cleanup-merge__combined">
                    <span><Icon name="world" size={17} /> {new Set(currentDuplicateGroup.items.flatMap((item) => item.uris)).size} destinations</span>
                    <span><Icon name="folder" size={17} /> {new Set(currentDuplicateGroup.items.flatMap((item) => item.tags)).size} tags</span>
                  </div>
                  {mergeError && <div className="cleanup-notice cleanup-notice--error" role="alert"><Icon name="alert-triangle" size={18} /><span>{mergeError}</span></div>}
                  {showMergeConfirm ? (
                    <div className="cleanup-confirm" role="alert">
                      <Icon name="copy" size={20} />
                      <div><strong>Merge these copies?</strong><span>Other copies move to Trash. Merging stops if they contain attachments.</span></div>
                      <Button size="sm" loading={merging} onClick={() => void handleMerge()}>Merge logins</Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowMergeConfirm(false)}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="cleanup-footer-actions"><Button onClick={() => setShowMergeConfirm(true)}><Icon name="copy" size={18} /> Review and merge</Button></div>
                  )}
                </div>
              </div>
            ) : (
              <div className="cleanup-state cleanup-state--compact"><Icon name="circle-check" size={34} /><strong>No likely duplicates</strong><span>Matching is performed locally using destinations, usernames, names, and passwords.</span></div>
            )}
          </section>
        ) : (
          <section className="cleanup-process" aria-labelledby="sorting-title">
            <div className="cleanup-process__heading">
              <div><p>No network or cloud model</p><h2 id="sorting-title">Local sorting</h2></div>
              <span>{sortingSuggestions.length} suggestions</span>
            </div>
            <div className="cleanup-notice">
              <Icon name="sparkles" size={18} />
              <span>Authwell currently uses small, auditable rules on this device. A downloadable local model can plug into this step later without sending vault data away.</span>
            </div>
            {sortingSuggestions.length > 0 ? (
              <>
                <div className="cleanup-list" role="list">
                  {sortingSuggestions.map((suggestion) => (
                    <label key={suggestion.item.id} className="cleanup-select-row" role="listitem">
                      <input
                        type="checkbox"
                        checked={sortingSelectedIds.has(suggestion.item.id)}
                        onChange={() => toggleSelected(suggestion.item.id, setSortingSelectedIds, sortingSelectedIds)}
                      />
                      <span className="cleanup-item-icon"><SiteFavicon sources={getEntryFaviconSources(suggestion.item)} fallbackIcon="key" size={21} fill /></span>
                      <span className="cleanup-select-row__text"><strong>{suggestion.item.name}</strong><small>Suggested from its {suggestion.reason}</small></span>
                      <Badge variant="success">{suggestion.folderName}</Badge>
                    </label>
                  ))}
                </div>
                {showSortingConfirm && (
                  <div className="cleanup-confirm" role="alert">
                    <Icon name="folder" size={20} />
                    <div><strong>Apply {sortingSelectedIds.size} folder suggestions?</strong><span>Missing folders are created. You can move items again at any time.</span></div>
                    <Button size="sm" loading={sortingApplying} onClick={() => void handleApplySorting()}>Apply suggestions</Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowSortingConfirm(false)}>Cancel</Button>
                  </div>
                )}
                <div className="cleanup-footer-actions"><Button disabled={sortingSelectedIds.size === 0} onClick={() => setShowSortingConfirm(true)}><Icon name="folder" size={18} /> Organise selected</Button></div>
              </>
            ) : (
              <div className="cleanup-state cleanup-state--compact"><Icon name="circle-check" size={34} /><strong>No local suggestions</strong><span>Your unfiled logins do not match the current private sorting rules.</span></div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
