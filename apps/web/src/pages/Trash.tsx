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

  const typeIcon = (type: string) => ({ login: '🔑', note: '📝', card: '💳', identity: '📛' })[type as keyof ReturnType<typeof typeIcon>] ?? '📄';

  return (
    <>
      <div className="p-4 border-b border-white/[0.1] bg-white/[0.05] backdrop-blur-lg flex gap-3">
        <h1 className="text-xl font-bold text-white leading-10">🗑️ Trash</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-white/40">
            Loading trash...
          </div>
        ) : items.length === 0 && corruptItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-white/40">
            <div className="text-5xl mb-4">🗑️</div>
            <p className="text-lg font-medium">Trash is empty</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="backdrop-blur-lg bg-white/[0.06] rounded-xl border border-white/[0.1] p-4 flex items-center gap-4 relative overflow-hidden"
              >
                <div className="text-2xl">{typeIcon(item.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white truncate">{item.name}</p>
                    <span className="text-[10px] text-white/60 bg-white/[0.1] px-2 py-0.5 rounded">
                      {item.daysRemaining} days left
                    </span>
                  </div>
                  <p className="text-sm text-white/40 truncate capitalize">{item.type}</p>
                </div>
                <button
                  onClick={() => handleRestore(item.id)}
                  className="px-3 py-1.5 text-xs bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 rounded-md transition-colors"
                >
                  Restore
                </button>
                <button
                  onClick={() => handlePermanentDelete(item.id)}
                  className="px-3 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-md transition-colors"
                >
                  Delete Permanently
                </button>
              </div>
            ))}
            {corruptItems.map((ci) => (
              <div
                key={ci.id}
                className="bg-red-500/10 rounded-xl border border-red-400/20 backdrop-blur-sm p-4 flex items-center gap-4"
              >
                <div className="text-2xl">⚠️</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white">Undecryptable item</p>
                    <span className="text-[10px] text-white/60 bg-white/[0.1] px-2 py-0.5 rounded">
                      {ci.daysRemaining} days left
                    </span>
                  </div>
                  <p className="text-sm text-white/40 truncate">Type: {ci.type}</p>
                </div>
                <button
                  onClick={() => handleRestore(ci.id)}
                  className="px-3 py-1.5 text-xs bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 rounded-md transition-colors"
                >
                  Restore
                </button>
                <button
                  onClick={() => handlePermanentDelete(ci.id)}
                  className="px-3 py-1.5 text-xs bg-red-500/80 hover:bg-red-400/90 text-white rounded-md transition-colors"
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
