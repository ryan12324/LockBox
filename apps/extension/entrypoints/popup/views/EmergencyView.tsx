import React, { useState, useEffect } from 'react';
import { Button, Input, Select, Badge, Card } from '@lockbox/design';
import { sendMessage } from './shared.js';

export function EmergencyAccessView({ onBack }: { onBack: () => void }) {
  const [grantsAsGrantor, setGrantsAsGrantor] = useState<
    Array<{ id: string; granteeEmail: string; status: string; waitDays: number; createdAt: string }>
  >([]);
  const [grantsAsGrantee, setGrantsAsGrantee] = useState<
    Array<{ id: string; grantorEmail: string; status: string; waitDays: number; createdAt: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteWaitDays, setInviteWaitDays] = useState(7);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    sendMessage<{
      success: boolean;
      grantsAsGrantor?: typeof grantsAsGrantor;
      grantsAsGrantee?: typeof grantsAsGrantee;
      error?: string;
    }>({ type: 'get-emergency-access' })
      .then((res) => {
        if (res.success) {
          setGrantsAsGrantor(res.grantsAsGrantor ?? []);
          setGrantsAsGrantee(res.grantsAsGrantee ?? []);
        } else {
          setError(res.error ?? 'Failed to load');
        }
      })
      .catch(() => setError('Failed to connect'))
      .finally(() => setLoading(false));
  }, []);

  async function handleAction(
    grantId: string,
    action: 'approve-emergency' | 'reject-emergency' | 'revoke-emergency'
  ) {
    setActionId(grantId);
    setError('');
    try {
      const res = await sendMessage<{ success: boolean; error?: string }>({
        type: action,
        grantId,
      });
      if (res.success) {
        setGrantsAsGrantor((prev) => prev.filter((g) => g.id !== grantId));
        setGrantsAsGrantee((prev) => prev.filter((g) => g.id !== grantId));
      } else {
        setError(res.error ?? 'Action failed');
      }
    } catch {
      setError('Action failed');
    } finally {
      setActionId(null);
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError('');
    try {
      const res = await sendMessage<{
        success: boolean;
        grant?: { id: string; granteeEmail: string; status: string; waitDays: number };
        error?: string;
      }>({
        type: 'invite-emergency',
        email: inviteEmail.trim(),
        waitDays: inviteWaitDays,
      });
      if (res.success && res.grant) {
        setGrantsAsGrantor((prev) => [
          ...prev,
          { ...res.grant!, createdAt: new Date().toISOString() },
        ]);
        setInviteEmail('');
        setShowInvite(false);
      } else {
        setError(res.error ?? 'Failed to invite');
      }
    } catch {
      setError('Failed to invite');
    } finally {
      setInviting(false);
    }
  }

  const statusVariant = (
    status: string
  ): 'default' | 'primary' | 'success' | 'error' | 'warning' => {
    const map: Record<string, 'warning' | 'primary' | 'success' | 'error'> = {
      pending: 'warning',
      accepted: 'primary',
      confirmed: 'success',
      'recovery-initiated': 'error',
    };
    return map[status] ?? 'default';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            ←
          </Button>
          <span className="text-sm font-semibold text-[var(--color-text)]">
            🚨 Emergency Access
          </span>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowInvite(!showInvite)}>
          + Invite
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {error && (
          <div className="px-3 py-2 bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-sm)] text-[var(--color-error)] text-xs">
            {error}
          </div>
        )}
        {showInvite && (
          <Card variant="surface" padding="sm">
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-[var(--color-text)]">
                Invite Trusted Contact
              </div>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email address"
              />
              <Select
                label="Wait period (days)"
                value={String(inviteWaitDays)}
                onChange={(e) => setInviteWaitDays(Number(e.target.value))}
                options={[1, 3, 7, 14, 30].map((d) => ({
                  value: String(d),
                  label: `${d} day${d !== 1 ? 's' : ''}`,
                }))}
              />
              <div className="flex gap-1.5">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleInvite}
                  disabled={inviting}
                  className="flex-1"
                >
                  {inviting ? 'Inviting...' : 'Send Invite'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowInvite(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        )}
        {loading ? (
          <div className="text-center text-[var(--color-text-tertiary)] text-sm mt-10">
            Loading...
          </div>
        ) : (
          <>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] px-1 mb-2">
                My Trusted Contacts
              </h4>
              {grantsAsGrantor.length === 0 ? (
                <Card variant="surface" padding="sm">
                  <div className="text-center text-xs text-[var(--color-text-tertiary)] py-2">
                    No trusted contacts yet
                  </div>
                </Card>
              ) : (
                <div className="flex flex-col gap-2">
                  {grantsAsGrantor.map((grant) => (
                    <Card key={grant.id} variant="surface" padding="sm">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-xs text-[var(--color-text)] font-medium truncate">
                          {grant.granteeEmail}
                        </div>
                        <Badge variant={statusVariant(grant.status)}>
                          {grant.status.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-[var(--color-text-tertiary)] mb-2">
                        Wait: {grant.waitDays} day{grant.waitDays !== 1 ? 's' : ''}
                      </div>
                      <div className="flex gap-1">
                        {grant.status === 'pending' && (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleAction(grant.id, 'approve-emergency')}
                              disabled={actionId === grant.id}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleAction(grant.id, 'reject-emergency')}
                              disabled={actionId === grant.id}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleAction(grant.id, 'revoke-emergency')}
                          disabled={actionId === grant.id}
                        >
                          Revoke
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] px-1 mb-2">
                I'm a Contact For
              </h4>
              {grantsAsGrantee.length === 0 ? (
                <Card variant="surface" padding="sm">
                  <div className="text-center text-xs text-[var(--color-text-tertiary)] py-2">
                    No one has granted you access
                  </div>
                </Card>
              ) : (
                <div className="flex flex-col gap-2">
                  {grantsAsGrantee.map((grant) => (
                    <Card key={grant.id} variant="surface" padding="sm">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-xs text-[var(--color-text)] font-medium truncate">
                          {grant.grantorEmail}
                        </div>
                        <Badge variant={statusVariant(grant.status)}>
                          {grant.status.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-[var(--color-text-tertiary)]">
                        Wait: {grant.waitDays} day{grant.waitDays !== 1 ? 's' : ''}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
