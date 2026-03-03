import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/auth.js';
import { useVaultFilterStore } from '../store/vault.js';
import { api } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import { Button, Card, Badge } from '@lockbox/design';
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
              <Card
                key={item.id}
                variant="surface"
                padding="md"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div className="text-2xl">{typeIcon(item.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-[var(--color-text)] truncate">{item.name}</p>
                    <Badge>{item.daysRemaining} days left</Badge>
                  </div>
                  <p className="text-sm text-[var(--color-text-tertiary)] truncate capitalize">
                    {item.type}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => handleRestore(item.id)}>
                  Restore
                </Button>
                <Button variant="danger" size="sm" onClick={() => handlePermanentDelete(item.id)}>
                  Delete Permanently
                </Button>
              </Card>
            ))}
            {corruptItems.map((ci) => (
              <Card
                key={ci.id}
                variant="surface"
                padding="md"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  background: 'var(--color-error-subtle)',
                  border: '1px solid var(--color-error)',
                }}
              >
                <div className="text-2xl">⚠️</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-[var(--color-text)]">Undecryptable item</p>
                    <Badge>{ci.daysRemaining} days left</Badge>
                  </div>
                  <p className="text-sm text-[var(--color-text-tertiary)] truncate">
                    Type: {ci.type}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => handleRestore(ci.id)}>
                  Restore
                </Button>
                <Button variant="danger" size="sm" onClick={() => handlePermanentDelete(ci.id)}>
                  Delete Permanently
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
