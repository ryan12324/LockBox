import React, { useState, useEffect } from 'react';
import { Button } from '@lockbox/design';
import type { VaultItem } from '@lockbox/types';
import { sendMessage, typeIcon } from './shared.js';

export function TrashView({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<Array<VaultItem & { deletedAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    sendMessage<{
      success: boolean;
      items?: Array<VaultItem & { deletedAt: string }>;
      error?: string;
    }>({ type: 'get-trash' })
      .then((res) => {
        if (res.success && res.items) setItems(res.items);
        else setError(res.error ?? 'Failed to load trash');
      })
      .catch(() => setError('Failed to connect'))
      .finally(() => setLoading(false));
  }, []);

  function daysRemaining(deletedAt: string): number {
    const deleted = new Date(deletedAt).getTime();
    const purgeDays = 30;
    const purgeAt = deleted + purgeDays * 24 * 60 * 60 * 1000;
    const remaining = Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000));
    return Math.max(0, remaining);
  }

  async function handleRestore(id: string) {
    setActionId(id);
    try {
      const res = await sendMessage<{ success: boolean; error?: string }>({
        type: 'restore-item',
        id,
      });
      if (res.success) {
        setItems((prev) => prev.filter((i) => i.id !== id));
      } else {
        setError(res.error ?? 'Failed to restore');
      }
    } catch {
      setError('Failed to restore item');
    } finally {
      setActionId(null);
    }
  }

  async function handlePermanentDelete(id: string) {
    setActionId(id);
    try {
      const res = await sendMessage<{ success: boolean; error?: string }>({
        type: 'permanent-delete',
        id,
      });
      if (res.success) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        setConfirmDeleteId(null);
      } else {
        setError(res.error ?? 'Failed to delete');
      }
    } catch {
      setError('Failed to delete item');
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-border)]">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ←
        </Button>
        <span className="text-sm font-semibold text-[var(--color-text)]">🗑️ Trash</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-3 mt-3 px-3 py-2 bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-sm)] text-[var(--color-error)] text-xs">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center text-[var(--color-text-tertiary)] text-sm mt-10">
            Loading trash...
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center mt-6">
            <div className="text-3xl mb-3">🗑️</div>
            <p className="text-sm text-[var(--color-text-secondary)] mb-1">No items in trash</p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Deleted items appear here for 30 days before auto-purge.
            </p>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="p-3 border-b border-[var(--color-border)]">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="text-sm shrink-0">{typeIcon(item.type)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[var(--color-text)] truncate">
                      {item.name}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-tertiary)]">
                      {daysRemaining(item.deletedAt)} day
                      {daysRemaining(item.deletedAt) !== 1 ? 's' : ''} until auto-purge
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0 ml-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleRestore(item.id)}
                    disabled={actionId === item.id}
                  >
                    {actionId === item.id ? '...' : 'Restore'}
                  </Button>
                  {confirmDeleteId === item.id ? (
                    <div className="flex gap-1">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handlePermanentDelete(item.id)}
                        disabled={actionId === item.id}
                      >
                        {actionId === item.id ? '...' : 'Confirm'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <Button variant="danger" size="sm" onClick={() => setConfirmDeleteId(item.id)}>
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
