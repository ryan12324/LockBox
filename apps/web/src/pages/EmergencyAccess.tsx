import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/auth.js';
import { api } from '../lib/api.js';
import type { EmergencyAccessGrant, EmergencyAccessRequest } from '@lockbox/types';

type TabId = 'trusted' | 'requests';

const WAIT_PERIODS = [
  { label: '1 day', value: 1 },
  { label: '3 days', value: 3 },
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
];

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    pending: {
      bg: 'bg-[var(--color-warning-subtle)]',
      text: 'text-[var(--color-warning)]',
      label: 'Pending',
    },
    confirmed: {
      bg: 'bg-[var(--color-aura-dim)]',
      text: 'text-[var(--color-primary)]',
      label: 'Confirmed',
    },
    waiting: {
      bg: 'bg-[var(--color-warning-subtle)]',
      text: 'text-[var(--color-warning)]',
      label: 'Waiting',
    },
    approved: {
      bg: 'bg-[var(--color-success-subtle)]',
      text: 'text-[var(--color-success)]',
      label: 'Approved',
    },
    rejected: {
      bg: 'bg-[var(--color-error-subtle)]',
      text: 'text-[var(--color-error)]',
      label: 'Rejected',
    },
    revoked: {
      bg: 'bg-[var(--color-surface)]',
      text: 'text-[var(--color-text-tertiary)]',
      label: 'Revoked',
    },
  };
  const s = map[status] ?? {
    bg: 'bg-[var(--color-surface)]',
    text: 'text-[var(--color-text-tertiary)]',
    label: status,
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-[var(--radius-full)] text-xs font-medium ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}

export default function EmergencyAccess() {
  const { session } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabId>('trusted');

  const [grants, setGrants] = useState<EmergencyAccessGrant[]>([]);
  const [requests, setRequests] = useState<
    (EmergencyAccessRequest & {
      grantorEmail?: string;
      granteeEmail?: string;
      status?: string;
      waitPeriodDays?: number;
      createdAt?: string;
    })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addWait, setAddWait] = useState(7);
  const [adding, setAdding] = useState(false);

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [gRes, rRes] = await Promise.all([
        api.emergency.listGrants(session.token),
        api.emergency.listRequests(session.token),
      ]);
      setGrants(gRes.grants ?? []);
      setRequests(rRes.requests ?? []);
    } catch (err) {
      setError('Failed to load emergency access data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateGrant() {
    if (!session || !addEmail.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await api.emergency.createGrant(
        {
          granteeEmail: addEmail.trim(),
          waitPeriodDays: addWait,
          encryptedUserKey: 'pending-exchange',
        },
        session.token
      );
      setAddEmail('');
      setShowAdd(false);
      await loadData();
    } catch (err) {
      setError('Failed to create grant.');
      console.error(err);
    } finally {
      setAdding(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!session) return;
    try {
      await api.emergency.revokeGrant(id, session.token);
      await loadData();
    } catch (err) {
      setError('Failed to revoke grant.');
      console.error(err);
    }
  }

  async function handleConfirm(id: string) {
    if (!session) return;
    try {
      await api.emergency.confirmGrant(id, session.token);
      await loadData();
    } catch (err) {
      setError('Failed to confirm grant.');
      console.error(err);
    }
  }

  async function handleRequestAccess(grantId: string) {
    if (!session) return;
    try {
      await api.emergency.requestAccess(grantId, session.token);
      await loadData();
    } catch (err) {
      setError('Failed to request access.');
      console.error(err);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="w-16 h-16 border-4 border-[var(--color-primary)] border-t-transparent rounded-[var(--radius-full)] animate-spin mb-4" />
        <h2 className="text-xl font-medium text-[var(--color-text)] mb-2">
          Loading Emergency Access
        </h2>
        <p className="text-[var(--color-text-secondary)]">Fetching your emergency contacts…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-1">🛡️ Emergency Access</h1>
        <p className="text-[var(--color-text-secondary)] mb-6">
          Grant trusted contacts access to your vault in case of emergency, or manage access granted
          to you by others.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-md)] text-[var(--color-error)] text-sm">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-[var(--color-surface)] p-1 rounded-[var(--radius-md)]">
          {[
            { id: 'trusted' as TabId, label: 'Trusted Contacts', count: grants.length },
            { id: 'requests' as TabId, label: 'Access Requests', count: requests.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-fg)] shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-[var(--radius-full)] bg-[var(--color-surface-raised)] text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Trusted Contacts Tab */}
        {activeTab === 'trusted' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">
                Your Trusted Contacts
              </h2>
              <button
                onClick={() => setShowAdd(true)}
                className="px-4 py-2 bg-[var(--color-primary)] text-[var(--color-primary-fg)] rounded-[var(--radius-md)] text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors"
              >
                + Add Trusted Contact
              </button>
            </div>

            {showAdd && (
              <div className="mb-6 p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)]">
                <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">
                  Add Trusted Contact
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                      Email address
                    </label>
                    <input
                      type="email"
                      value={addEmail}
                      onChange={(e) => setAddEmail(e.target.value)}
                      placeholder="trusted@example.com"
                      className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm text-[var(--color-text)] placeholder-[var(--color-text-tertiary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                      Wait period
                    </label>
                    <select
                      value={addWait}
                      onChange={(e) => setAddWait(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm text-[var(--color-text)]"
                    >
                      {WAIT_PERIODS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                      Time to wait after access is requested before it's automatically approved.
                    </p>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleCreateGrant}
                      disabled={adding || !addEmail.trim()}
                      className="px-4 py-2 bg-[var(--color-primary)] text-[var(--color-primary-fg)] rounded-[var(--radius-md)] text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-50"
                    >
                      {adding ? 'Creating…' : 'Create Grant'}
                    </button>
                    <button
                      onClick={() => {
                        setShowAdd(false);
                        setAddEmail('');
                      }}
                      className="px-4 py-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {grants.length === 0 ? (
              <div className="text-center py-12 text-[var(--color-text-tertiary)]">
                <p className="text-4xl mb-3">🛡️</p>
                <p className="font-medium mb-1">No trusted contacts yet</p>
                <p className="text-sm">
                  Add someone you trust to access your vault in an emergency.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {grants.map((grant) => (
                  <div
                    key={grant.id}
                    className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[var(--color-text)] font-medium text-sm">
                          {grant.granteeEmail}
                        </span>
                        {statusBadge(grant.status)}
                      </div>
                      <p className="text-xs text-[var(--color-text-tertiary)]">
                        Wait period: {grant.waitPeriodDays}{' '}
                        {grant.waitPeriodDays === 1 ? 'day' : 'days'} · Created{' '}
                        {new Date(grant.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {grant.status !== 'expired' && grant.status !== 'rejected' && (
                      <button
                        onClick={() => handleRevoke(grant.id)}
                        className="px-3 py-1.5 text-xs text-[var(--color-error)] hover:bg-[var(--color-error-subtle)] rounded-[var(--radius-md)] transition-colors"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Access Requests Tab */}
        {activeTab === 'requests' && (
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">
              Grants Available to You
            </h2>

            {requests.length === 0 ? (
              <div className="text-center py-12 text-[var(--color-text-tertiary)]">
                <p className="text-4xl mb-3">📬</p>
                <p className="font-medium mb-1">No access grants</p>
                <p className="text-sm">
                  No one has granted you emergency access to their vault yet.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((grant) => (
                  <div
                    key={grant.id}
                    className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)]"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[var(--color-text)] font-medium text-sm">
                            {grant.grantorEmail ?? grant.granteeEmail ?? 'Unknown'}
                          </span>
                          {grant.status && statusBadge(grant.status)}
                        </div>
                        <p className="text-xs text-[var(--color-text-tertiary)]">
                          Wait period: {grant.waitPeriodDays ?? '?'}{' '}
                          {grant.waitPeriodDays === 1 ? 'day' : 'days'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {grant.status === 'pending' && (
                          <button
                            onClick={() => handleConfirm(grant.id)}
                            className="px-3 py-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-primary-fg)] rounded-[var(--radius-md)] hover:bg-[var(--color-primary-hover)] transition-colors"
                          >
                            Confirm
                          </button>
                        )}
                        {grant.status === 'confirmed' && (
                          <button
                            onClick={() => handleRequestAccess(grant.id)}
                            className="px-3 py-1.5 text-xs bg-[var(--color-warning)] text-[var(--color-text)] rounded-[var(--radius-md)] hover:bg-[var(--color-warning)] transition-colors"
                          >
                            Request Access
                          </button>
                        )}
                        {grant.status === 'approved' && (
                          <button className="px-3 py-1.5 text-xs bg-[var(--color-success)] text-[var(--color-text)] rounded-[var(--radius-md)] hover:bg-[var(--color-success)] transition-colors">
                            View Vault
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
