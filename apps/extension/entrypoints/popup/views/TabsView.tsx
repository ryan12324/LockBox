import React, { useState, useEffect, useCallback } from 'react';
import { Button, Input, Select, Badge, Card } from '@lockbox/design';
import {
  generatePassword,
  generatePassphrase,
  evaluateStrength,
  detectPasswordRules,
  generateCompliant,
} from '@lockbox/generator';
import { getRemainingSeconds } from '@lockbox/totp';
import type { VaultItem, LoginItem, Folder } from '@lockbox/types';
import type { SearchResult } from '@lockbox/ai';
import type { PasswordRules, PasswordFieldMetadata } from '@lockbox/generator';
import { sendMessage, typeIcon } from './shared.js';

export function SiteTab({ items }: { items: VaultItem[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-[var(--color-text-tertiary)] text-sm">
        <div className="text-2xl mb-2">🔍</div>
        No saved passwords for this site
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {items.map((item) => (
        <div
          key={item.id}
          className="p-3 border-b border-[var(--color-border)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          <div className="text-sm font-semibold text-[var(--color-text)] mb-1.5 truncate">
            {item.name}
          </div>
          {item.type === 'login' && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--color-text-tertiary)] truncate pr-2">
                  {(item as LoginItem).username}
                </span>
                <Button
                  variant={copied === `u-${item.id}` ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => copyToClipboard((item as LoginItem).username, `u-${item.id}`)}
                  className="shrink-0"
                >
                  {copied === `u-${item.id}` ? '✓ Copied' : 'Copy User'}
                </Button>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--color-text-tertiary)]">••••••••</span>
                <Button
                  variant={copied === `p-${item.id}` ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => copyToClipboard((item as LoginItem).password, `p-${item.id}`)}
                  className="shrink-0"
                >
                  {copied === `p-${item.id}` ? '✓ Copied' : 'Copy Pass'}
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
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
  const [semanticResults, setSemanticResults] = useState<SearchResult[] | null>(null);
  const [searchingRemote, setSearchingRemote] = useState(false);

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
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
            placeholder="Search vault (semantic)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <Button variant="primary" size="sm" onClick={onAddItem} title="Add item">
            +
          </Button>
        </div>
        {searchingRemote && (
          <div className="text-[10px] text-[var(--color-text-tertiary)] px-1">Searching...</div>
        )}
        {semanticResults && search.length >= 2 && !searchingRemote && (
          <div className="text-[10px] text-[var(--color-text-tertiary)] px-1">
            🔍 {semanticResults.length} semantic result{semanticResults.length !== 1 ? 's' : ''}
          </div>
        )}
        {folders.length > 0 && (
          <Select
            value={selectedFolderId ?? ''}
            onChange={(e) => setSelectedFolderId(e.target.value || null)}
            options={[
              { value: '', label: 'All folders' },
              ...folders.map((f) => ({ value: f.id, label: `📁 ${f.name}` })),
            ]}
          />
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
                  <span className="text-sm shrink-0">{typeIcon(item.type)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <div className="text-sm font-medium text-[var(--color-text)] truncate">
                        {item.name}
                      </div>
                      {(attachmentCounts.get(item.id) ?? 0) > 0 && (
                        <Badge variant="primary">📎{attachmentCounts.get(item.id)}</Badge>
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
                        copyToClipboard((item as LoginItem).username, `u-${item.id}`);
                      }}
                      title="Copy username"
                    >
                      {copied === `u-${item.id}` ? '✓' : '👤'}
                    </Button>
                    <Button
                      variant={copied === `p-${item.id}` ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard((item as LoginItem).password, `p-${item.id}`);
                      }}
                      title="Copy password"
                    >
                      {copied === `p-${item.id}` ? '✓' : '🔑'}
                    </Button>
                  </div>
                )}
                {item.favorite && <span className="text-xs ml-0.5">⭐</span>}
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

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  if (!hasKeyPair) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-3xl mb-3">🔐</div>
        <p className="text-sm text-[var(--color-text-secondary)] mb-2">
          Encryption keys not set up
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Set up your key pair in the web vault to access shared items.
        </p>
      </div>
    );
  }

  if (sharedItems.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-3xl mb-3">🤝</div>
        <p className="text-sm text-[var(--color-text-secondary)] mb-2">No shared items</p>
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Items shared with you through teams will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
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
                <span className="text-sm shrink-0">{typeIcon(item.type)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-[1px]">
                    <div className="text-sm font-medium text-[var(--color-text)] truncate">
                      {item.name}
                    </div>
                    {folderName && <Badge variant="default">📁 {folderName}</Badge>}
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
                      copyToClipboard((item as LoginItem).username, `u-${item.id}`);
                    }}
                    title="Copy username"
                  >
                    {copied === `u-${item.id}` ? '✓' : '👤'}
                  </Button>
                  <Button
                    variant={copied === `p-${item.id}` ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard((item as LoginItem).password, `p-${item.id}`);
                    }}
                    title="Copy password"
                  >
                    {copied === `p-${item.id}` ? '✓' : '🔑'}
                  </Button>
                </div>
              )}
              {item.favorite && <span className="text-xs ml-0.5">⭐</span>}
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
            {detectingRules ? 'Detecting...' : '🔍 Detect Site Rules'}
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
              ✨ Generate Compliant
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
          ↻ Regenerate
        </Button>
        <Button
          variant={copied ? 'primary' : 'primary'}
          size="sm"
          onClick={copy}
          className="flex-1"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

function TotpItem({ item }: { item: LoginItem }) {
  const [code, setCode] = useState('------');
  const [remaining, setRemaining] = useState(30);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!item.totp) return;

    async function refresh() {
      const result = await sendMessage<{ code: string | null }>({
        type: 'get-totp',
        secret: item.totp,
      });
      if (result.code) setCode(result.code);
      setRemaining(getRemainingSeconds());
    }

    refresh();
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, [item.totp]);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-3 border-b border-[var(--color-border)] flex justify-between items-center hover:bg-[var(--color-bg-subtle)] transition-colors">
      <div>
        <div className="text-xs font-medium text-[var(--color-text)]">{item.name}</div>
        <div className="text-[20px] font-bold font-mono text-[var(--color-primary)] tracking-[0.1em] mt-0.5">
          {code.slice(0, 3)} {code.slice(3)}
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <div
          className={`text-xs ${remaining <= 5 ? 'text-[var(--color-error)]' : 'text-[var(--color-text-tertiary)]'}`}
        >
          {remaining}s
        </div>
        <Button variant={copied ? 'primary' : 'secondary'} size="sm" onClick={copy}>
          {copied ? '✓' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

export function TotpTab({ items }: { items: VaultItem[] }) {
  const totpItems = items.filter(
    (i): i is LoginItem => i.type === 'login' && Boolean((i as LoginItem).totp)
  );

  if (totpItems.length === 0) {
    return (
      <div className="p-6 text-center text-[var(--color-text-tertiary)] text-sm">
        <div className="text-2xl mb-2">🔑</div>
        No TOTP codes configured
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
