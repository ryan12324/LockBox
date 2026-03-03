import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth.js';
import { decryptVaultItem } from '../lib/crypto.js';
import { Button } from '@lockbox/design';
import { useToast } from '../providers/ToastProvider.js';
import type { VaultItem } from '@lockbox/types';

interface ItemHistoryPanelProps {
  itemId: string;
  onClose: () => void;
  onRestore: () => void;
}

interface ItemVersion {
  id: string;
  revisionDate: string;
  createdAt: string;
}

interface FetchedVersion {
  id: string;
  itemId: string;
  encryptedData: string;
  revisionDate: string;
  createdAt: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function formatRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ItemHistoryPanel({ itemId, onClose, onRestore }: ItemHistoryPanelProps) {
  const { session, userKey } = useAuthStore();
  const { toast } = useToast();
  const [versions, setVersions] = useState<ItemVersion[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedVersion, setSelectedVersion] = useState<FetchedVersion | null>(null);
  const [decryptedData, setDecryptedData] = useState<VaultItem | null>(null);
  const [loadingVersion, setLoadingVersion] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!session) return;

    fetch(`${API_BASE}/api/vault/items/${itemId}/versions`, {
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setVersions(data.versions || []);
      })
      .catch((err) => toast((err as Error).message, 'error'))
      .finally(() => setLoading(false));
  }, [itemId, session]);

  const handleView = async (versionId: string) => {
    if (!session || !userKey) return;
    setLoadingVersion(true);

    try {
      const res = await fetch(`${API_BASE}/api/vault/items/${itemId}/versions/${versionId}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch version');

      const v: FetchedVersion = data.version;
      setSelectedVersion(v);

      const decrypted = await decryptVaultItem(v.encryptedData, userKey, v.itemId, v.revisionDate);
      setDecryptedData(decrypted);
    } catch (err: Error | unknown) {
      toast((err as Error).message || 'Failed to load version details', 'error');
    } finally {
      setLoadingVersion(false);
    }
  };

  const handleRestore = async (versionId: string) => {
    if (!session) return;
    setRestoring(true);

    try {
      const res = await fetch(
        `${API_BASE}/api/vault/items/${itemId}/versions/${versionId}/restore`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token}` },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to restore');

      onRestore();
    } catch (err: Error | unknown) {
      toast((err as Error).message || 'Failed to restore version', 'error');
      setRestoring(false);
    }
  };

  interface DecryptedItem {
    username?: string;
    password?: string;
    totp?: string;
    uris?: string[];
    content?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    number?: string;
    expMonth?: string;
    expYear?: string;
  }
  const renderDecryptedFields = (item: DecryptedItem) => {
    const fields = [];
    if (item.username) fields.push(['Username', item.username]);
    if (item.password) fields.push(['Password', '••••••••']); // Just show mask for history if we don't need reveal
    if (item.totp) fields.push(['TOTP Secret', item.totp]);
    if (item.uris && item.uris.length) fields.push(['URIs', item.uris.join(', ')]);
    if (item.content) fields.push(['Note', item.content]);

    // Identity fields
    if (item.firstName || item.lastName)
      fields.push(['Name', `${item.firstName || ''} ${item.lastName || ''}`.trim()]);
    if (item.email) fields.push(['Email', item.email]);
    if (item.phone) fields.push(['Phone', item.phone]);

    // Card fields
    if (item.number) fields.push(['Card Number', `••••${item.number.slice(-4)}`]);
    if (item.expMonth && item.expYear) fields.push(['Expires', `${item.expMonth}/${item.expYear}`]);

    if (fields.length === 0)
      return (
        <div className="text-[var(--color-text-tertiary)] text-sm italic">No details to show</div>
      );

    return (
      <div className="space-y-3">
        {fields.map(([label, val], i) => (
          <div
            key={i}
            className="bg-[var(--color-bg-subtle)] p-3 rounded-[var(--radius-md)] border border-[var(--color-border)]"
          >
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              {label}
            </span>
            <span className="text-sm text-[var(--color-text)] font-mono">{val}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full sm:w-[450px] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] border-l border-[var(--color-border)] z-[70] flex flex-col transform transition-transform duration-300 ease-in-out translate-x-0">
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Version History</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="text-[var(--color-text-tertiary)] text-sm text-center py-8">
              Loading history...
            </div>
          ) : versions.length === 0 ? (
            <div className="text-[var(--color-text-tertiary)] text-sm text-center py-8">
              No previous versions found.
            </div>
          ) : (
            <div className="space-y-4">
              {versions.map((v) => {
                const isSelected = selectedVersion?.id === v.id;
                const d = new Date(v.revisionDate);

                return (
                  <div
                    key={v.id}
                    className={`p-4 rounded-[var(--radius-lg)] border transition-colors ${isSelected ? 'bg-[var(--color-aura-dim)] border-[var(--color-primary)]' : 'bg-[var(--color-bg-subtle)] border-[var(--color-border)]'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm text-[var(--color-text)] font-medium">
                          {formatRelativeTime(v.revisionDate)}
                        </div>
                        <div className="text-xs text-[var(--color-text-tertiary)] mt-1">
                          {d.toLocaleString()}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {isSelected ? (
                          <Button
                            variant="primary"
                            size="sm"
                            loading={restoring}
                            onClick={() => handleRestore(v.id)}
                          >
                            Restore
                          </Button>
                        ) : (
                          <Button variant="secondary" size="sm" onClick={() => handleView(v.id)}>
                            View
                          </Button>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                        {loadingVersion ? (
                          <div className="text-[var(--color-text-tertiary)] text-xs">
                            Decrypting...
                          </div>
                        ) : decryptedData ? (
                          renderDecryptedFields(decryptedData as unknown as DecryptedItem)
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
