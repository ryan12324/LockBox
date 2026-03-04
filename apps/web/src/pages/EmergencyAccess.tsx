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
      <div
        className="flex flex-col items-center justify-center min-h-screen"
        style={{ padding: 16, background: 'var(--color-bg)' }}
      >
        <div className="w-16 h-16 border-4 border-[var(--color-primary)] border-t-transparent rounded-[var(--radius-full)] animate-spin mb-4" />
        <h2
          style={{
            fontSize: 'var(--font-size-lg)',
            fontWeight: 600,
            color: 'var(--color-text)',
            marginBottom: 8,
          }}
        >
          Loading Emergency Access
        </h2>
        <p style={{ color: 'var(--color-text-secondary)' }}>Fetching your emergency contacts…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', padding: 16, background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <h1
          style={{
            fontSize: 'var(--font-size-xl)',
            fontWeight: 700,
            color: 'var(--color-text)',
            marginBottom: 4,
          }}
        >
          🛡️ Emergency Access
        </h1>
        <p
          style={{
            color: 'var(--color-text-secondary)',
            marginBottom: 16,
            fontSize: 'var(--font-size-sm)',
          }}
        >
          Grant trusted contacts access to your vault in case of emergency, or manage access granted
          to you by others.
        </p>

        <Card
          variant="surface"
          padding="sm"
          style={{
            display: 'flex',
            gap: 4,
            marginBottom: 16,
            boxShadow: 'var(--shadow-md)',
          }}
        >
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
                <span
                  style={{
                    marginLeft: 8,
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--color-surface-raised)',
                    fontSize: 'var(--font-size-xs)',
                  }}
                >
                  {tab.count}
                </span>
              )}
            </Button>
          ))}
        </Card>

        {activeTab === 'trusted' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                }}
              >
                Your Trusted Contacts
              </h2>
              <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
                + Add Trusted Contact
              </Button>
            </div>

            {showAdd && (
              <Card variant="surface" padding="md" style={{ boxShadow: 'var(--shadow-lg)' }}>
                <h3
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 600,
                    color: 'var(--color-text)',
                    marginBottom: 12,
                  }}
                >
                  Add Trusted Contact
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                    <p
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-tertiary)',
                        marginTop: 4,
                      }}
                    >
                      Time to wait after access is requested before it's automatically approved.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
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
              <Card
                variant="surface"
                padding="lg"
                style={{ textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}
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
                  🛡️
                </div>
                <h2
                  style={{
                    fontSize: 'var(--font-size-lg)',
                    fontWeight: 600,
                    color: 'var(--color-text)',
                    marginBottom: 4,
                  }}
                >
                  No trusted contacts yet
                </h2>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
                  Add someone you trust to access your vault in an emergency.
                </p>
              </Card>
            ) : (
              <Card variant="surface" padding="md" style={{ boxShadow: 'var(--shadow-lg)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {grants.map((grant) => (
                    <div
                      key={grant.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 12,
                        borderRadius: 'var(--radius-organic-lg)',
                        background: 'var(--color-bg)',
                        boxShadow: 'var(--shadow-md)',
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--color-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 'var(--font-size-sm)',
                            fontWeight: 600,
                            color: 'white',
                            flexShrink: 0,
                          }}
                        >
                          {(grant.granteeEmail ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              marginBottom: 2,
                            }}
                          >
                            <span
                              style={{
                                color: 'var(--color-text)',
                                fontWeight: 500,
                                fontSize: 'var(--font-size-sm)',
                              }}
                            >
                              {grant.granteeEmail}
                            </span>
                            {statusBadge(grant.status)}
                          </div>
                          <p
                            style={{
                              fontSize: 'var(--font-size-xs)',
                              color: 'var(--color-text-tertiary)',
                            }}
                          >
                            Wait period: {grant.waitPeriodDays}{' '}
                            {grant.waitPeriodDays === 1 ? 'day' : 'days'} · Created{' '}
                            {new Date(grant.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {grant.status !== 'expired' && grant.status !== 'rejected' && (
                        <Button variant="danger" size="sm" onClick={() => handleRevoke(grant.id)}>
                          Revoke
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {activeTab === 'requests' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: 600,
                color: 'var(--color-text)',
              }}
            >
              Grants Available to You
            </h2>

            {requests.length === 0 ? (
              <Card
                variant="surface"
                padding="lg"
                style={{ textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}
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
                  📬
                </div>
                <h2
                  style={{
                    fontSize: 'var(--font-size-lg)',
                    fontWeight: 600,
                    color: 'var(--color-text)',
                    marginBottom: 4,
                  }}
                >
                  No access grants
                </h2>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
                  No one has granted you emergency access to their vault yet.
                </p>
              </Card>
            ) : (
              <Card variant="surface" padding="md" style={{ boxShadow: 'var(--shadow-lg)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {requests.map((grant) => (
                    <div
                      key={grant.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 12,
                        borderRadius: 'var(--radius-organic-lg)',
                        background: 'var(--color-bg)',
                        boxShadow: 'var(--shadow-md)',
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--color-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 'var(--font-size-sm)',
                            fontWeight: 600,
                            color: 'white',
                            flexShrink: 0,
                          }}
                        >
                          {(grant.grantorEmail ?? grant.granteeEmail ?? '?')
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              marginBottom: 2,
                            }}
                          >
                            <span
                              style={{
                                color: 'var(--color-text)',
                                fontWeight: 500,
                                fontSize: 'var(--font-size-sm)',
                              }}
                            >
                              {grant.grantorEmail ?? grant.granteeEmail ?? 'Unknown'}
                            </span>
                            {grant.status && statusBadge(grant.status)}
                          </div>
                          <p
                            style={{
                              fontSize: 'var(--font-size-xs)',
                              color: 'var(--color-text-tertiary)',
                            }}
                          >
                            Wait period: {grant.waitPeriodDays ?? '?'}{' '}
                            {grant.waitPeriodDays === 1 ? 'day' : 'days'}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
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
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
