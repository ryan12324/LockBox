import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Input,
  Select,
  Badge,
  Card,
  Icon,
  SiteFavicon,
  getEntryFaviconSources,
  type IconName,
} from '@lockbox/design';
import { generateTotp } from '@lockbox/totp';
import {
  generatePassword,
  generatePassphrase,
  evaluateStrength,
  detectPasswordRules,
  generateCompliant,
} from '@lockbox/generator';
import type { VaultItem, LoginItem, Folder } from '@lockbox/types';
import type { SearchResult } from '@lockbox/ai';
import type { PasswordRules, PasswordFieldMetadata } from '@lockbox/generator';
import { openWebVault } from '../../../lib/web-vault.js';
import { getTotpErrorMessage } from '../../../lib/totp-errors.js';
import { refreshItemFromServer, sendMessage } from './shared.js';

const itemTypeIcon = (type: string): IconName =>
  (({
    login: 'key',
    note: 'note',
    card: 'credit-card',
    identity: 'id',
    passkey: 'fingerprint',
    document: 'file-description',
  })[type] as IconName) ?? 'file';

async function getFreshLoginField(itemId: string, field: 'username' | 'password'): Promise<string> {
  const item = await refreshItemFromServer(itemId);
  if (item.type !== 'login') throw new Error('This item is no longer a login.');
  return (item as LoginItem)[field] ?? '';
}

export function SiteTab({
  items,
  siteHost,
  onOpenVault,
}: {
  items: VaultItem[];
  siteHost: string;
  onOpenVault: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [useError, setUseError] = useState('');

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function copyFreshField(itemId: string, field: 'username' | 'password', copyId: string) {
    setUseError('');
    try {
      await copyToClipboard(await getFreshLoginField(itemId, field), copyId);
    } catch (error) {
      setUseError(error instanceof Error ? error.message : 'Could not refresh this item.');
    }
  }

  if (items.length === 0) {
    return (
      <div className="extension-site">
        <div className="extension-section-heading">
          <span>{siteHost}</span>
          <small>Saved for this page</small>
        </div>
        <div className="extension-empty">
          <span>
            <Icon name="world" size={24} />
          </span>
          <strong>No saved logins for this site</strong>
          <p>Browse your full vault to find another item.</p>
          <Button variant="secondary" size="sm" onClick={onOpenVault}>
            <Icon name="shield-lock" size={16} />
            Browse vault
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="extension-site">
      <div className="extension-section-heading">
        <span>{siteHost}</span>
        <small>
          {items.length} {items.length === 1 ? 'saved item' : 'saved items'} for this page
        </small>
      </div>
      {useError && (
        <p role="alert" className="px-3 text-xs text-[var(--color-error)]">
          {useError}
        </p>
      )}
      <div className="extension-site__list">
        {items.map((item) => (
          <article key={item.id} className="extension-site__item">
            <div className="extension-site__title">
              <span>
                <SiteFavicon
                  sources={getEntryFaviconSources(item)}
                  fallbackIcon={itemTypeIcon(item.type)}
                  size={20}
                  fill
                />
              </span>
              <div>
                <strong>{item.name}</strong>
                <small>{item.type === 'login' ? (item as LoginItem).username : item.type}</small>
              </div>
            </div>
            {item.type === 'login' && (
              <div className="extension-site__actions">
                <Button
                  variant={copied === `u-${item.id}` ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => void copyFreshField(item.id, 'username', `u-${item.id}`)}
                >
                  <Icon name={copied === `u-${item.id}` ? 'check' : 'user'} size={17} />
                  {copied === `u-${item.id}` ? 'Copied' : 'Username'}
                </Button>
                <Button
                  variant={copied === `p-${item.id}` ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => void copyFreshField(item.id, 'password', `p-${item.id}`)}
                >
                  <Icon name={copied === `p-${item.id}` ? 'check' : 'copy'} size={17} />
                  {copied === `p-${item.id}` ? 'Copied' : 'Password'}
                </Button>
              </div>
            )}
          </article>
        ))}
      </div>
      <p className="extension-site__hint">
        <Icon name="info-circle" size={16} /> Use the Authwell icon inside a form field to fill this
        page.
      </p>
    </div>
  );
}

export function VaultTab({
  items,
  folders,
  onSelectItem,
  onAddItem,
  rotationMap,
  attachmentCounts,
}: {
  items: VaultItem[];
  folders: Folder[];
  onSelectItem: (item: VaultItem) => void;
  onAddItem: () => void;
  rotationMap?: Map<string, 'overdue' | 'due-soon'>;
  attachmentCounts: Map<string, number>;
}) {
  const [search, setSearch] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [useError, setUseError] = useState('');
  const [semanticResults, setSemanticResults] = useState<SearchResult[] | null>(null);
  const [searchingRemote, setSearchingRemote] = useState(false);

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function copyFreshField(itemId: string, field: 'username' | 'password', copyId: string) {
    setUseError('');
    try {
      await copyToClipboard(await getFreshLoginField(itemId, field), copyId);
    } catch (error) {
      setUseError(error instanceof Error ? error.message : 'Could not refresh this item.');
    }
  }

  useEffect(() => {
    if (!search || search.length < 2) {
      setSemanticResults(null);
      return;
    }
    setSearchingRemote(true);
    const timer = setTimeout(() => {
      sendMessage<{ results: SearchResult[] }>({ type: 'search-vault', query: search })
        .then((res) => setSemanticResults(res.results ?? null))
        .catch(() => setSemanticResults(null))
        .finally(() => setSearchingRemote(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      setSearchingRemote(false);
    };
  }, [search]);

  const filtered =
    semanticResults && search.length >= 2
      ? semanticResults
          .map((r) => r.item)
          .filter((i) => !selectedFolderId || i.folderId === selectedFolderId)
      : items.filter((i) => {
          if (search) {
            const q = search.toLowerCase();
            if (
              !i.name.toLowerCase().includes(q) &&
              !(i.type === 'login' && (i as LoginItem).username?.toLowerCase().includes(q))
            )
              return false;
          }
          if (selectedFolderId && i.folderId !== selectedFolderId) return false;
          return true;
        });

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col gap-1 p-3 border-b border-[var(--color-border)]">
        <div className="flex gap-1">
          <Input
            type="search"
            placeholder="Search vault"
            aria-label="Search vault"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <Button variant="primary" size="sm" onClick={onAddItem} title="Add item">
            <Icon name="plus" size={19} />
          </Button>
        </div>
        {searchingRemote && (
          <div className="text-[10px] text-[var(--color-text-tertiary)] px-1">Searching...</div>
        )}
        {semanticResults && search.length >= 2 && !searchingRemote && (
          <div className="text-[10px] text-[var(--color-text-tertiary)] px-1">
            {semanticResults.length} local result{semanticResults.length !== 1 ? 's' : ''}
          </div>
        )}
        {folders.length > 0 && (
          <Select
            value={selectedFolderId ?? ''}
            onChange={(e) => setSelectedFolderId(e.target.value || null)}
            options={[
              { value: '', label: 'All folders' },
              ...folders.map((f) => ({ value: f.id, label: f.name })),
            ]}
          />
        )}
        {useError && (
          <div role="alert" className="text-xs text-[var(--color-error)] px-1">
            {useError}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-[var(--color-text-tertiary)] text-sm">
            {search || selectedFolderId ? 'No matching items' : 'No items in vault'}
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelectItem(item)}
              className="p-3 border-b border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-bg-subtle)] transition-colors"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="extension-type-icon">
                    <SiteFavicon
                      sources={getEntryFaviconSources(item)}
                      fallbackIcon={itemTypeIcon(item.type)}
                      size={20}
                      fill
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <div className="text-sm font-medium text-[var(--color-text)] truncate">
                        {item.name}
                      </div>
                      {(attachmentCounts.get(item.id) ?? 0) > 0 && (
                        <Badge variant="primary">
                          <Icon name="paperclip" size={13} />
                          {attachmentCounts.get(item.id)}
                        </Badge>
                      )}
                      {rotationMap?.get(item.id) && (
                        <Badge variant="warning">
                          <Icon name="refresh" size={13} />
                          {rotationMap.get(item.id) === 'overdue' ? 'Rotation due' : 'Due soon'}
                        </Badge>
                      )}
                    </div>
                    {item.type === 'login' && (
                      <div className="text-xs text-[var(--color-text-tertiary)] mt-[1px] truncate">
                        {(item as LoginItem).username}
                      </div>
                    )}
                  </div>
                </div>
                {item.type === 'login' && (
                  <div className="flex gap-1 shrink-0 ml-1">
                    <Button
                      variant={copied === `u-${item.id}` ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyFreshField(item.id, 'username', `u-${item.id}`);
                      }}
                      title="Copy username"
                    >
                      <Icon name={copied === `u-${item.id}` ? 'check' : 'user'} size={17} />
                    </Button>
                    <Button
                      variant={copied === `p-${item.id}` ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyFreshField(item.id, 'password', `p-${item.id}`);
                      }}
                      title="Copy password"
                    >
                      <Icon name={copied === `p-${item.id}` ? 'check' : 'copy'} size={17} />
                    </Button>
                  </div>
                )}
                {item.favorite && (
                  <Icon
                    name="star"
                    size={15}
                    className="text-[var(--color-warning)]"
                    label="Favorite"
                  />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function SharedTab({
  sharedItems,
  sharedFolders,
  hasKeyPair,
  onSelectItem,
}: {
  sharedItems: VaultItem[];
  sharedFolders: Array<{
    folderId: string;
    teamId: string;
    folderName: string;
    permissionLevel: string;
  }>;
  hasKeyPair: boolean;
  onSelectItem: (item: VaultItem) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [useError, setUseError] = useState('');
  const [openingWebVault, setOpeningWebVault] = useState(false);
  const [webVaultError, setWebVaultError] = useState('');

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function copyFreshField(itemId: string, field: 'username' | 'password', copyId: string) {
    setUseError('');
    try {
      await copyToClipboard(await getFreshLoginField(itemId, field), copyId);
    } catch (error) {
      setUseError(error instanceof Error ? error.message : 'Could not refresh this item.');
    }
  }

  async function handleOpenTeams() {
    setOpeningWebVault(true);
    setWebVaultError('');

    try {
      await openWebVault('/teams');
    } catch (error) {
      setWebVaultError(
        error instanceof Error ? error.message : 'Authwell could not open the web vault.'
      );
    } finally {
      setOpeningWebVault(false);
    }
  }

  if (!hasKeyPair) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <Icon name="shield-lock" size={30} className="mb-3 text-[var(--color-primary)]" />
        <p className="text-sm text-[var(--color-text-secondary)] mb-2">
          Encryption keys not set up
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4 max-w-[28ch]">
          Set up your key pair in the web vault to access shared items.
        </p>
        <Button
          variant="primary"
          size="sm"
          loading={openingWebVault}
          onClick={() => void handleOpenTeams()}
        >
          {!openingWebVault && <Icon name="external-link" size={16} />}
          {openingWebVault ? 'Opening web vault…' : 'Set up sharing keys'}
        </Button>
        {webVaultError && (
          <p role="alert" className="mt-3 text-xs text-[var(--color-error)] max-w-[32ch]">
            {webVaultError}
          </p>
        )}
      </div>
    );
  }

  if (sharedItems.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <Icon name="users" size={30} className="mb-3 text-[var(--color-primary)]" />
        <p className="text-sm text-[var(--color-text-secondary)] mb-2">No shared items</p>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4 max-w-[28ch]">
          Items shared with you through teams will appear here.
        </p>
        <Button
          variant="secondary"
          size="sm"
          loading={openingWebVault}
          onClick={() => void handleOpenTeams()}
        >
          {!openingWebVault && <Icon name="external-link" size={16} />}
          {openingWebVault ? 'Opening web vault…' : 'Manage teams'}
        </Button>
        {webVaultError && (
          <p role="alert" className="mt-3 text-xs text-[var(--color-error)] max-w-[32ch]">
            {webVaultError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {useError && (
        <p role="alert" className="px-3 pt-2 text-xs text-[var(--color-error)]">
          {useError}
        </p>
      )}
      {sharedItems.map((item) => {
        const folderName = sharedFolders.find((f) => f.folderId === item.folderId)?.folderName;
        return (
          <div
            key={item.id}
            onClick={() => onSelectItem(item)}
            className="p-3 border-b border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-bg-subtle)] transition-colors"
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="extension-type-icon">
                  <SiteFavicon
                    sources={getEntryFaviconSources(item)}
                    fallbackIcon={itemTypeIcon(item.type)}
                    size={20}
                    fill
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-[1px]">
                    <div className="text-sm font-medium text-[var(--color-text)] truncate">
                      {item.name}
                    </div>
                    {folderName && (
                      <Badge variant="default">
                        <Icon name="folder" size={13} />
                        {folderName}
                      </Badge>
                    )}
                  </div>
                  {item.type === 'login' && (
                    <div className="text-xs text-[var(--color-text-tertiary)] truncate">
                      {(item as LoginItem).username}
                    </div>
                  )}
                </div>
              </div>
              {item.type === 'login' && (
                <div className="flex gap-1 shrink-0 ml-1">
                  <Button
                    variant={copied === `u-${item.id}` ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      void copyFreshField(item.id, 'username', `u-${item.id}`);
                    }}
                    title="Copy username"
                  >
                    <Icon name={copied === `u-${item.id}` ? 'check' : 'user'} size={17} />
                  </Button>
                  <Button
                    variant={copied === `p-${item.id}` ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      void copyFreshField(item.id, 'password', `p-${item.id}`);
                    }}
                    title="Copy password"
                  >
                    <Icon name={copied === `p-${item.id}` ? 'check' : 'copy'} size={17} />
                  </Button>
                </div>
              )}
              {item.favorite && (
                <Icon
                  name="star"
                  size={15}
                  className="text-[var(--color-warning)]"
                  label="Favorite"
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GeneratorTab() {
  const [mode, setMode] = useState<'password' | 'passphrase'>('password');
  const [length, setLength] = useState(20);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [wordCount, setWordCount] = useState(5);
  const [generated, setGenerated] = useState('');
  const [copied, setCopied] = useState(false);
  const [detectedRules, setDetectedRules] = useState<PasswordRules | null>(null);
  const [detectingRules, setDetectingRules] = useState(false);

  const generate = useCallback(() => {
    if (mode === 'password') {
      setGenerated(generatePassword({ length, uppercase, lowercase, digits, symbols }));
    } else {
      setGenerated(generatePassphrase({ wordCount, separator: '-', capitalize: true }));
    }
  }, [mode, length, uppercase, lowercase, digits, symbols, wordCount]);

  useEffect(() => {
    generate();
  }, [generate]);

  const strength = generated ? evaluateStrength(generated) : null;
  const strengthColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];

  async function copy() {
    await navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-3 flex flex-col gap-2.5">
      <div className="flex gap-1">
        {(['password', 'passphrase'] as const).map((m) => (
          <Button
            key={m}
            variant={mode === m ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setMode(m)}
            className="flex-1"
          >
            {m === 'password' ? 'Password' : 'Passphrase'}
          </Button>
        ))}
      </div>

      <div className="bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] p-2.5 font-mono text-sm break-all min-h-[40px] text-[var(--color-primary)]">
        {generated}
      </div>

      {strength && (
        <div>
          <div className="h-1 bg-[var(--color-surface-raised)] rounded-[var(--radius-full)] overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${(strength.score + 1) * 20}%`,
                background: strengthColors[strength.score],
              }}
            />
          </div>
          <div className="text-xs text-[var(--color-text-tertiary)] mt-1">
            Entropy: {strength.entropy.toFixed(0)} bits
          </div>
        </div>
      )}

      {mode === 'password' ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center">
            <label className="text-xs text-[var(--color-text)]">Length: {length}</label>
            <input
              type="range"
              min={8}
              max={64}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              className="w-[120px] accent-[var(--color-primary)]"
            />
          </div>
          {[
            { label: 'A-Z', value: uppercase, set: setUppercase },
            { label: 'a-z', value: lowercase, set: setLowercase },
            { label: '0-9', value: digits, set: setDigits },
            { label: '!@#', value: symbols, set: setSymbols },
          ].map(({ label, value, set }) => (
            <label
              key={label}
              className="flex justify-between items-center text-xs text-[var(--color-text)] cursor-pointer"
            >
              {label}
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => set(e.target.checked)}
                className="accent-[var(--color-primary)]"
              />
            </label>
          ))}
        </div>
      ) : (
        <div className="flex justify-between items-center">
          <label className="text-xs text-[var(--color-text)]">Words: {wordCount}</label>
          <input
            type="range"
            min={3}
            max={10}
            value={wordCount}
            onChange={(e) => setWordCount(Number(e.target.value))}
            className="w-[120px] accent-[var(--color-primary)]"
          />
        </div>
      )}

      <div className="border-t border-[var(--color-border)] pt-2 mt-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5">
          Smart Generation
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={async () => {
              setDetectingRules(true);
              try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab?.id) {
                  const results = await chrome.tabs.sendMessage(tab.id, {
                    type: 'get-password-field-metadata',
                  });
                  if (results) {
                    const metadata: PasswordFieldMetadata = {
                      minLength: results.minLength,
                      maxLength: results.maxLength,
                      pattern: results.pattern,
                      title: results.title,
                      ariaDescription: results.ariaDescription,
                      nearbyText: results.nearbyText,
                    };
                    setDetectedRules(detectPasswordRules(metadata));
                  } else {
                    setDetectedRules(detectPasswordRules({}));
                  }
                } else {
                  setDetectedRules(detectPasswordRules({}));
                }
              } catch {
                setDetectedRules(detectPasswordRules({}));
              } finally {
                setDetectingRules(false);
              }
            }}
            disabled={detectingRules}
          >
            {detectingRules ? (
              'Detecting…'
            ) : (
              <>
                <Icon name="search" size={16} />
                Detect site rules
              </>
            )}
          </Button>
          {detectedRules && (
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              onClick={() => {
                const pw = generateCompliant(detectedRules);
                setGenerated(pw);
              }}
            >
              <Icon name="wand" size={16} />
              Generate compliant
            </Button>
          )}
        </div>
        {detectedRules && (
          <Card variant="surface" padding="sm" style={{ marginTop: 6 }}>
            <div className="text-[10px] text-[var(--color-text-tertiary)]">
              Length: {detectedRules.minLength}–{detectedRules.maxLength}
              {detectedRules.requireUppercase && ' · A-Z'}
              {detectedRules.requireLowercase && ' · a-z'}
              {detectedRules.requireDigit && ' · 0-9'}
              {detectedRules.requireSpecial && ' · !@#'}
              {detectedRules.allowedSpecialChars && ` (${detectedRules.allowedSpecialChars})`}
              {detectedRules.forbiddenChars && ` · Forbidden: ${detectedRules.forbiddenChars}`}
            </div>
            <div className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">
              Source: {detectedRules.source}
            </div>
          </Card>
        )}
      </div>

      <div className="flex gap-1.5 mt-1">
        <Button variant="secondary" size="sm" onClick={generate} className="flex-1">
          <Icon name="refresh" size={16} />
          Regenerate
        </Button>
        <Button
          variant={copied ? 'primary' : 'primary'}
          size="sm"
          onClick={copy}
          className="flex-1"
        >
          <Icon name={copied ? 'check' : 'copy'} size={16} />
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

function TotpItem({ item }: { item: LoginItem }) {
  const [code, setCode] = useState('------');
  const [remaining, setRemaining] = useState(30);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    async function generate(secret: string) {
      try {
        const result = await generateTotp(secret);
        if (cancelled) return;
        setCode(result.code);
        setRemaining(result.remaining);
        setError('');
      } catch (generationError) {
        if (cancelled) return;
        setCode('------');
        setRemaining(0);
        setError(getTotpErrorMessage(generationError));
      }
    }

    void (async () => {
      try {
        const freshItem = await refreshItemFromServer(item.id);
        if (freshItem.type !== 'login' || !(freshItem as LoginItem).totp) {
          throw new Error('This item has no authenticator key.');
        }
        const secret = (freshItem as LoginItem).totp!;
        await generate(secret);
        if (!cancelled) interval = setInterval(() => void generate(secret), 1000);
      } catch (refreshError) {
        if (cancelled) return;
        setCode('------');
        setRemaining(0);
        setError(
          refreshError instanceof Error ? refreshError.message : 'Could not refresh this item.'
        );
      }
    })();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [item.id]);

  async function copy() {
    if (error || !/^\d{6,8}$/.test(code)) return;
    try {
      const freshItem = await refreshItemFromServer(item.id);
      if (freshItem.type !== 'login' || !(freshItem as LoginItem).totp) {
        throw new Error('This item has no authenticator key.');
      }
      const freshCode = await generateTotp((freshItem as LoginItem).totp!);
      await navigator.clipboard.writeText(freshCode.code);
      setCode(freshCode.code);
      setRemaining(freshCode.remaining);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : 'Could not refresh this item.');
    }
  }

  return (
    <div className="p-3 border-b border-[var(--color-border)] flex justify-between items-center hover:bg-[var(--color-bg-subtle)] transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className="extension-type-icon">
          <SiteFavicon sources={getEntryFaviconSources(item)} fallbackIcon="key" size={20} fill />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-medium text-[var(--color-text)] truncate">{item.name}</div>
          {error ? (
            <div className="text-xs text-[var(--color-error)] mt-1">{error}</div>
          ) : (
            <div className="text-[20px] font-bold font-mono text-[var(--color-primary)] tracking-[0.1em] mt-0.5">
              {code.slice(0, code.length / 2)} {code.slice(code.length / 2)}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <div
          className={`text-xs ${remaining <= 5 ? 'text-[var(--color-error)]' : 'text-[var(--color-text-tertiary)]'}`}
        >
          {remaining}s
        </div>
        <Button
          variant={copied ? 'primary' : 'secondary'}
          size="sm"
          onClick={copy}
          disabled={Boolean(error)}
        >
          <Icon name={copied ? 'check' : 'copy'} size={16} />
          <span className="sr-only">{copied ? 'Copied' : 'Copy code'}</span>
        </Button>
      </div>
    </div>
  );
}

export function TotpTab({ items, onAddItem }: { items: VaultItem[]; onAddItem: () => void }) {
  const totpItems = items.filter(
    (i): i is LoginItem => i.type === 'login' && Boolean((i as LoginItem).totp)
  );

  if (totpItems.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <Icon name="key" size={26} className="mb-3 text-[var(--color-primary)]" />
        <p className="text-sm text-[var(--color-text-secondary)] mb-2">No authenticator codes</p>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4 max-w-[28ch]">
          Add a TOTP secret to a login to generate codes here.
        </p>
        <Button variant="primary" size="sm" onClick={onAddItem}>
          <Icon name="plus" size={16} />
          Add a login
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {totpItems.map((item) => (
        <TotpItem key={item.id} item={item} />
      ))}
    </div>
  );
}
