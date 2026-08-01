import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/auth.js';
import { useVaultFilterStore } from '../store/vault.js';
import { api } from '../lib/api.js';
import { getApiUrl } from '../lib/server-connection.js';
import { decryptVaultItem } from '../lib/crypto.js';
import {
  Button,
  Card,
  Badge,
  Icon,
  Modal,
  SiteFavicon,
  getEntryFaviconSources,
  type IconName,
} from '@lockbox/design';
import type { VaultItem } from '@lockbox/types';
import { useToast } from '../providers/ToastProvider.js';

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
  const { toast } = useToast();

  const [items, setItems] = useState<TrashVaultItem[]>([]);
  const [corruptItems, setCorruptItems] = useState<EncryptedItemWithTrash[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadTrash = useCallback(async () => {
    if (!session || !userKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl('/api/vault/trash'), {
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
      setError(err instanceof Error ? err.message : 'Failed to load trash');
    } finally {
      setLoading(false);
    }
  }, [session, userKey]);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  async function handleRestore(id: string) {
    if (!session) return;
    setActionId(id);
    try {
      await api.vault.restoreItem(id, session.token);
      triggerUpdate();
      await loadTrash();
      toast('Item restored', 'success');
    } catch (err) {
      console.error('Failed to restore:', err);
      toast(err instanceof Error ? err.message : 'Failed to restore item', 'error');
    } finally {
      setActionId(null);
    }
  }

  async function handlePermanentDelete(id: string) {
    if (!session) return;
    setActionId(id);
    try {
      await api.vault.permanentDelete(id, session.token);
      await loadTrash();
      setConfirmDeleteId(null);
      toast('Item permanently deleted', 'success');
    } catch (err) {
      console.error('Failed to permanent delete:', err);
      toast(err instanceof Error ? err.message : 'Failed to permanently delete item', 'error');
    } finally {
      setActionId(null);
    }
  }

  const typeIcon = (type: string): IconName =>
    ({ login: 'key', note: 'note', card: 'credit-card', identity: 'id', passkey: 'fingerprint', document: 'file-description' } satisfies Record<string, IconName>)[type] ?? 'file';

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
          Trash
        </h1>
        {items.length + corruptItems.length > 0 && (
          <Badge variant="default">{items.length + corruptItems.length} items</Badge>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingTop: 0 }}>
        {error ? (
          <Card variant="surface" padding="lg" style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <Icon name="alert-circle" size={22} style={{ color: 'var(--color-error)' }} />
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, color: 'var(--color-text)', fontSize: 'var(--font-size-base)' }}>Trash could not be loaded</h2>
                <p style={{ margin: '4px 0 12px', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>{error}</p>
                <Button variant="secondary" size="sm" onClick={loadTrash}>
                  <Icon name="refresh" size={16} />
                  Try again
                </Button>
              </div>
            </div>
          </Card>
        ) : loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 128,
              color: 'var(--color-text-tertiary)',
            }}
          >
            <Icon name="loader-2" size={24} className="vault-state__spinner" />
            <span style={{ marginLeft: 8 }}>Loading trash…</span>
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
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
                color: 'var(--color-text-tertiary)',
                border: '1px solid var(--color-border)',
              }}
            >
              <Icon name="trash" size={30} />
            </div>
            <h2
              style={{
                fontSize: 'var(--font-size-xl)',
                fontWeight: 700,
                color: 'var(--color-text)',
                marginBottom: 8,
              }}
            >
              Trash is empty
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
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-bg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-primary)',
                      flexShrink: 0,
                    }}
                  >
                    <SiteFavicon
                      sources={getEntryFaviconSources(item)}
                      fallbackIcon={typeIcon(item.type)}
                      size={20}
                      fill
                    />
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
                    disabled={actionId === item.id}
                    style={{ flex: 1 }}
                  >
                    <Icon name="restore" size={16} />
                    {actionId === item.id ? 'Restoring…' : 'Restore'}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmDeleteId(item.id)}
                    style={{ flex: 1 }}
                  >
                    <Icon name="trash" size={16} />
                    Delete permanently
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
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-error-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 'var(--font-size-lg)',
                      flexShrink: 0,
                    }}
                  >
                    <Icon name="alert-triangle" size={20} />
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
                    disabled={actionId === ci.id}
                    style={{ flex: 1 }}
                  >
                    <Icon name="restore" size={16} />
                    {actionId === ci.id ? 'Restoring…' : 'Restore'}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmDeleteId(ci.id)}
                    style={{ flex: 1 }}
                  >
                    <Icon name="trash" size={16} />
                    Delete permanently
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <Modal
        open={Boolean(confirmDeleteId)}
        onClose={() => setConfirmDeleteId(null)}
        title="Permanently delete item?"
        size="sm"
      >
        <div style={{ padding: 20 }}>
          <p style={{ margin: '0 0 18px', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
            This removes the encrypted item immediately. It cannot be restored afterward.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => confirmDeleteId && handlePermanentDelete(confirmDeleteId)}
              loading={Boolean(confirmDeleteId && actionId === confirmDeleteId)}
            >
              Delete permanently
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
