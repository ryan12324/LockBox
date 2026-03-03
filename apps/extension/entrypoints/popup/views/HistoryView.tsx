import React, { useState, useEffect } from 'react';
import { Button, Card } from '@lockbox/design';
import type { VaultItem, LoginItem } from '@lockbox/types';
import { sendMessage, typeIcon } from './shared.js';

export function VersionHistoryView({ item, onBack }: { item: VaultItem; onBack: () => void }) {
  const [versions, setVersions] = useState<
    Array<{ id: string; revisionDate: string; createdAt: string; data: VaultItem | null }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    sendMessage<{ success: boolean; versions?: typeof versions; error?: string }>({
      type: 'get-versions',
      itemId: item.id,
    })
      .then((res) => {
        if (res.success && res.versions) setVersions(res.versions);
        else setError(res.error ?? 'Failed to load versions');
      })
      .catch(() => setError('Failed to connect'))
      .finally(() => setLoading(false));
  }, [item.id]);

  function relativeTime(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  async function handleRestore(versionId: string) {
    setRestoringId(versionId);
    setError('');
    try {
      const res = await sendMessage<{ success: boolean; error?: string }>({
        type: 'restore-version',
        itemId: item.id,
        versionId,
      });
      if (!res.success) setError(res.error ?? 'Failed to restore');
    } catch {
      setError('Failed to restore version');
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-border)]">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ←
        </Button>
        <span className="text-lg">{typeIcon(item.type)}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[var(--color-text)] truncate">{item.name}</div>
          <div className="text-[10px] text-[var(--color-text-tertiary)]">Version History</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {error && (
          <div className="px-3 py-2 bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-sm)] text-[var(--color-error)] text-xs">
            {error}
          </div>
        )}
        {loading ? (
          <div className="text-center text-[var(--color-text-tertiary)] text-sm mt-10">
            Loading versions...
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center mt-6">
            <div className="text-3xl mb-3">📜</div>
            <p className="text-sm text-[var(--color-text-secondary)] mb-1">No version history</p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Previous versions will appear here after edits.
            </p>
          </div>
        ) : (
          versions.map((version, idx) => (
            <Card key={version.id} variant="surface" padding="sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-[var(--color-text)] font-medium">
                    {idx === 0 ? 'Latest version' : `Version ${versions.length - idx}`}
                  </div>
                  <div className="text-[10px] text-[var(--color-text-tertiary)]">
                    {relativeTime(version.revisionDate)}
                  </div>
                </div>
                {idx > 0 && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleRestore(version.id)}
                    disabled={restoringId === version.id}
                  >
                    {restoringId === version.id ? '...' : 'Restore'}
                  </Button>
                )}
              </div>
              {version.data && (
                <div className="mt-2 text-[10px] text-[var(--color-text-tertiary)] truncate">
                  {version.data.name}
                  {version.data.type === 'login'
                    ? ` • ${(version.data as LoginItem).username ?? ''}`
                    : ''}
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
