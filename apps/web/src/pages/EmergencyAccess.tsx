import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/auth.js';
import { api } from '../lib/api.js';
import { useToast } from '../providers/ToastProvider.js';
import { Button, Input, Card, Badge, Select } from '@lockbox/design';
import type { EmergencyAccessGrant, EmergencyAccessRequest } from '@lockbox/types';

type TabId = 'trusted' | 'requests';

const WAIT_PERIODS = [
  { label: '1 day', value: 1 },
  { label: '3 days', value: 3 },
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
];

const STATUS_VARIANT: Record<string, 'default' | 'primary' | 'error' | 'success' | 'warning'> = {
  pending: 'warning',
  confirmed: 'primary',
  waiting: 'warning',
  approved: 'success',
  rejected: 'error',
  revoked: 'default',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  waiting: 'Waiting',
  approved: 'Approved',
  rejected: 'Rejected',
  revoked: 'Revoked',
};

function statusBadge(status: string) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'default'}>{STATUS_LABEL[status] ?? status}</Badge>
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
  const { toast } = useToast();

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addWait, setAddWait] = useState(7);
  const [adding, setAdding] = useState(false);

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const [gRes, rRes] = await Promise.all([
        api.emergency.listGrants(session.token),
        api.emergency.listRequests(session.token),
      ]);
      setGrants(gRes.grants ?? []);
      setRequests(rRes.requests ?? []);
    } catch (err) {
      toast('Failed to load emergency access data.', 'error');
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
      toast('Failed to create grant.', 'error');
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
      toast('Failed to revoke grant.', 'error');
      console.error(err);
    }
  }

  async function handleConfirm(id: string) {
    if (!session) return;
    try {
      await api.emergency.confirmGrant(id, session.token);
      await loadData();
    } catch (err) {
      toast('Failed to confirm grant.', 'error');
      console.error(err);
    }
  }

  async function handleRequestAccess(grantId: string) {
    if (!session) return;
    try {
      await api.emergency.requestAccess(grantId, session.token);
      await loadData();
    } catch (err) {
      toast('Failed to request access.', 'error');
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

        <div className="flex gap-1 mb-6 bg-[var(--color-surface)] p-1 rounded-[var(--radius-md)]">
          {[
            { id: 'trusted' as TabId, label: 'Trusted Contacts', count: grants.length },
            { id: 'requests' as TabId, label: 'Access Requests', count: requests.length },
          ].map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
              style={{ flex: 1 }}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-[var(--radius-full)] bg-[var(--color-surface-raised)] text-xs">
                  {tab.count}
                </span>
              )}
            </Button>
          ))}
        </div>

        {activeTab === 'trusted' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">
                Your Trusted Contacts
              </h2>
              <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
                + Add Trusted Contact
              </Button>
            </div>

            {showAdd && (
              <Card variant="surface" padding="md" style={{ marginBottom: 24 }}>
                <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">
                  Add Trusted Contact
                </h3>
                <div className="space-y-3">
                  <Input
                    type="email"
                    label="Email address"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    placeholder="trusted@example.com"
                  />
                  <div>
                    <Select
                      label="Wait period"
                      value={String(addWait)}
                      onChange={(e) => setAddWait(Number(e.target.value))}
                      options={WAIT_PERIODS.map((p) => ({
                        value: String(p.value),
                        label: p.label,
                      }))}
                    />
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                      Time to wait after access is requested before it's automatically approved.
                    </p>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleCreateGrant}
                      disabled={adding || !addEmail.trim()}
                      loading={adding}
                    >
                      {adding ? 'Creating…' : 'Create Grant'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowAdd(false);
                        setAddEmail('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
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
                  <Card
                    key={grant.id}
                    variant="surface"
                    padding="md"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
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
                      <Button variant="danger" size="sm" onClick={() => handleRevoke(grant.id)}>
                        Revoke
                      </Button>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

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
                  <Card key={grant.id} variant="surface" padding="md">
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
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleConfirm(grant.id)}
                          >
                            Confirm
                          </Button>
                        )}
                        {grant.status === 'confirmed' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleRequestAccess(grant.id)}
                          >
                            Request Access
                          </Button>
                        )}
                        {grant.status === 'approved' && (
                          <Button variant="primary" size="sm">
                            View Vault
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
