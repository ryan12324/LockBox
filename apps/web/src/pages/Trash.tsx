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

function daysRemainingVariant(days: number): 'success' | 'warning' | 'error' {
  if (days >= 20) return 'success';
  if (days >= 7) return 'warning';
  return 'error';
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
      triggerUpdate();
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--color-bg)',
      }}
    >
      <div
        style={{
          padding: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <h1
          style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-text)' }}
        >
          🗑️ Trash
        </h1>
        {items.length + corruptItems.length > 0 && (
          <Badge variant="default">{items.length + corruptItems.length} items</Badge>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingTop: 0 }}>
        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 128,
              color: 'var(--color-text-tertiary)',
            }}
          >
            Loading trash...
          </div>
        ) : items.length === 0 && corruptItems.length === 0 ? (
          <Card
            variant="surface"
            padding="lg"
            style={{ textAlign: 'center', boxShadow: 'var(--shadow-lg)', marginTop: 32 }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 'var(--radius-full)',
                background: 'var(--color-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
                fontSize: 'var(--font-size-xl)',
                color: 'var(--color-text-tertiary)',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              🗑️
            </div>
            <h2
              style={{
                fontSize: 'var(--font-size-xl)',
                fontWeight: 700,
                color: 'var(--color-text)',
                marginBottom: 8,
              }}
            >
              Trash is Empty
            </h2>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
              Deleted items will appear here for 30 days before permanent removal.
            </p>
          </Card>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {items.map((item) => (
              <Card
                key={item.id}
                variant="surface"
                padding="md"
                style={{ boxShadow: 'var(--shadow-lg)' }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 'var(--radius-full)',
                      background: 'var(--color-bg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 'var(--font-size-lg)',
                      boxShadow: 'var(--shadow-sm)',
                      flexShrink: 0,
                    }}
                  >
                    {typeIcon(item.type)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontWeight: 600,
                        color: 'var(--color-text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.name}
                    </p>
                    <p
                      style={{
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-tertiary)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {item.type}
                    </p>
                  </div>
                  <Badge variant={daysRemainingVariant(item.daysRemaining)}>
                    {item.daysRemaining}d left
                  </Badge>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRestore(item.id)}
                    style={{ flex: 1 }}
                  >
                    Restore
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handlePermanentDelete(item.id)}
                    style={{ flex: 1 }}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
            {corruptItems.map((ci) => (
              <Card
                key={ci.id}
                variant="surface"
                padding="md"
                style={{
                  boxShadow: 'var(--shadow-lg)',
                  borderLeft: '4px solid var(--color-error)',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 'var(--radius-full)',
                      background: 'var(--color-error-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 'var(--font-size-lg)',
                      flexShrink: 0,
                    }}
                  >
                    ⚠️
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                      Undecryptable item
                    </p>
                    <p
                      style={{
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      Type: {ci.type}
                    </p>
                  </div>
                  <Badge variant={daysRemainingVariant(ci.daysRemaining)}>
                    {ci.daysRemaining}d left
                  </Badge>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRestore(ci.id)}
                    style={{ flex: 1 }}
                  >
                    Restore
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handlePermanentDelete(ci.id)}
                    style={{ flex: 1 }}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
