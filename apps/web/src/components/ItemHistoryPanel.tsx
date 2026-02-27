import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth.js';
import { decryptVaultItem } from '../lib/crypto.js';
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
  const [versions, setVersions] = useState<ItemVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [itemId, session]);

  const handleView = async (versionId: string) => {
    if (!session || !userKey) return;
    setLoadingVersion(true);
    setError('');

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
      setError((err as Error).message || 'Failed to load version details');
    } finally {
      setLoadingVersion(false);
    }
  };

  const handleRestore = async (versionId: string) => {
    if (!session) return;
    setRestoring(true);
    setError('');

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
      setError((err as Error).message || 'Failed to restore version');
      setRestoring(false);
    }
  };

  interface DecryptedItem { username?: string; password?: string; totp?: string; uris?: string[]; content?: string; firstName?: string; lastName?: string; email?: string; phone?: string; number?: string; expMonth?: string; expYear?: string; }
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
      return <div className="text-white/40 text-sm italic">No details to show</div>;

    return (
      <div className="space-y-3">
        {fields.map(([label, val], i) => (
          <div key={i} className="bg-white/[0.04] p-3 rounded-lg border border-white/[0.06]">
            <span className="block text-xs font-semibold text-white/30 uppercase mb-1">
              {label}
            </span>
            <span className="text-sm text-white font-mono">{val}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full sm:w-[450px] backdrop-blur-2xl bg-slate-900/90 shadow-[0_16px_48px_rgba(0,0,0,0.5)] border-l border-white/[0.1] z-[70] flex flex-col transform transition-transform duration-300 ease-in-out translate-x-0">
        <div className="flex items-center justify-between p-4 border-b border-white/[0.1]">
          <h2 className="text-lg font-semibold text-white">Version History</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-white/30 hover:text-white/60 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 text-red-300 border border-red-400/20 text-sm rounded-lg mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-white/50 text-sm text-center py-8">Loading history...</div>
          ) : versions.length === 0 ? (
            <div className="text-white/50 text-sm text-center py-8">
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
                    className={`p-4 rounded-xl border transition-colors ${isSelected ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-white/[0.02] border-white/[0.06]'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm text-white font-medium">
                          {formatRelativeTime(v.revisionDate)}
                        </div>
                        <div className="text-xs text-white/40 mt-1">{d.toLocaleString()}</div>
                      </div>
                      <div className="flex gap-2">
                        {isSelected ? (
                          <button
                            disabled={restoring}
                            onClick={() => handleRestore(v.id)}
                            className="px-3 py-1.5 text-xs bg-indigo-600/80 hover:bg-indigo-500/90 text-white backdrop-blur-sm rounded-lg transition-colors disabled:opacity-50"
                          >
                            {restoring ? 'Restoring...' : 'Restore'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleView(v.id)}
                            className="px-3 py-1.5 text-xs bg-white/[0.08] hover:bg-white/[0.14] text-white/70 rounded-lg transition-colors"
                          >
                            View
                          </button>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <div className="mt-4 pt-4 border-t border-white/[0.06]">
                        {loadingVersion ? (
                          <div className="text-white/40 text-xs">Decrypting...</div>
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
