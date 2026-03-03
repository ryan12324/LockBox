import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/auth.js';
import { useVaultFilterStore } from '../store/vault.js';
import { api } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import type { VaultItem } from '@lockbox/types';

interface EncryptedItemWithTrash {
  id: string;
  type: string;
  encryptedData: string;
  folderId: string | null;
  tags: string | null;
  favorite: number;
  revisionDate: string;
  createdAt: string;
  deletedAt: string | null;
  daysRemaining: number;
}

export interface TrashVaultItem extends VaultItem {
  daysRemaining: number;
  deletedAt: string;
}

export default function Trash() {
  const { session, userKey } = useAuthStore();
  const { triggerUpdate } = useVaultFilterStore();

  const [items, setItems] = useState<TrashVaultItem[]>([]);
  const [corruptItems, setCorruptItems] = useState<EncryptedItemWithTrash[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTrash = useCallback(async () => {
    if (!session || !userKey) return;
    setLoading(true);
    try {
      const API_BASE = import.meta.env.VITE_API_URL ?? '';
      const res = await fetch(`${API_BASE}/api/vault/trash`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) throw new Error('Failed to load trash');
      const data = (await res.json()) as { items: EncryptedItemWithTrash[] };

      const decrypted: TrashVaultItem[] = [];
      const corrupt: EncryptedItemWithTrash[] = [];

      await Promise.all(
        data.items.map(async (i) => {
          try {
            const d = await decryptVaultItem(i.encryptedData, userKey, i.id, i.revisionDate);
            decrypted.push({ ...d, daysRemaining: i.daysRemaining, deletedAt: i.deletedAt! });
          } catch (err) {
            corrupt.push(i);
          }
        })
      );
      setItems(decrypted);
      setCorruptItems(corrupt);
    } catch (err) {
      console.error('Failed to load trash:', err);
    } finally {
      setLoading(false);
    }
  }, [session, userKey]);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  async function handleRestore(id: string) {
    if (!session) return;
    try {
      await api.vault.restoreItem(id, session.token);
      triggerUpdate(); // notify vault of update
      loadTrash();
    } catch (err) {
      console.error('Failed to restore:', err);
    }
  }

  async function handlePermanentDelete(id: string) {
    if (!session) return;
    if (
      !window.confirm(
        'Are you sure you want to permanently delete this item? This cannot be undone.'
      )
    )
      return;
    try {
      await api.vault.permanentDelete(id, session.token);
      loadTrash();
    } catch (err) {
      console.error('Failed to permanent delete:', err);
    }
  }

  const typeIcon = (type: string): string =>
    ({ login: '🔑', note: '📝', card: '💳', identity: '📛' })[type] ?? '📄';

  return (
    <>
      <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex gap-3">
        <h1 className="text-xl font-bold text-[var(--color-text)] leading-10">🗑️ Trash</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-[var(--color-text-tertiary)]">
            Loading trash...
          </div>
        ) : items.length === 0 && corruptItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-[var(--color-text-tertiary)]">
            <div className="text-5xl mb-4">🗑️</div>
            <p className="text-lg font-medium">Trash is empty</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 flex items-center gap-4 relative overflow-hidden"
              >
                <div className="text-2xl">{typeIcon(item.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-[var(--color-text)] truncate">{item.name}</p>
                    <span className="text-[10px] text-[var(--color-text-secondary)] bg-[var(--color-surface-raised)] px-2 py-0.5 rounded">
                      {item.daysRemaining} days left
                    </span>
                  </div>
                  <p className="text-sm text-[var(--color-text-tertiary)] truncate capitalize">
                    {item.type}
                  </p>
                </div>
                <button
                  onClick={() => handleRestore(item.id)}
                  className="px-3 py-1.5 text-xs bg-[var(--color-aura-dim)] hover:bg-[var(--color-aura)] text-[var(--color-primary)] rounded-[var(--radius-sm)] transition-colors"
                >
                  Restore
                </button>
                <button
                  onClick={() => handlePermanentDelete(item.id)}
                  className="px-3 py-1.5 text-xs bg-[var(--color-error-subtle)] hover:bg-[var(--color-error-subtle)] text-[var(--color-error)] rounded-[var(--radius-sm)] transition-colors"
                >
                  Delete Permanently
                </button>
              </div>
            ))}
            {corruptItems.map((ci) => (
              <div
                key={ci.id}
                className="bg-[var(--color-error-subtle)] rounded-[var(--radius-lg)] border border-[var(--color-error)] p-4 flex items-center gap-4"
              >
                <div className="text-2xl">⚠️</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-[var(--color-text)]">Undecryptable item</p>
                    <span className="text-[10px] text-[var(--color-text-secondary)] bg-[var(--color-surface-raised)] px-2 py-0.5 rounded">
                      {ci.daysRemaining} days left
                    </span>
                  </div>
                  <p className="text-sm text-[var(--color-text-tertiary)] truncate">
                    Type: {ci.type}
                  </p>
                </div>
                <button
                  onClick={() => handleRestore(ci.id)}
                  className="px-3 py-1.5 text-xs bg-[var(--color-aura-dim)] hover:bg-[var(--color-aura)] text-[var(--color-primary)] rounded-[var(--radius-sm)] transition-colors"
                >
                  Restore
                </button>
                <button
                  onClick={() => handlePermanentDelete(ci.id)}
                  className="px-3 py-1.5 text-xs bg-[var(--color-error)] hover:bg-[var(--color-error)] text-[var(--color-text)] rounded-[var(--radius-sm)] transition-colors"
                >
                  Delete Permanently
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
