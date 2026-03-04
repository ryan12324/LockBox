import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { useTeamsStore } from '../store/teams.js';
import { api } from '../lib/api.js';
import { createKeyPair } from '../lib/team-crypto.js';
import { useToast } from '../providers/ToastProvider.js';
import { Button, Input, Card, Badge } from '@lockbox/design';

export default function Teams() {
  const navigate = useNavigate();
  const { session, userKey } = useAuthStore();
  const { teams, setTeams, hasKeyPair, setHasKeyPair, loading, setLoading } = useTeamsStore();
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [creating, setCreating] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const [acceptingInvite, setAcceptingInvite] = useState(false);

  const loadTeams = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await api.teams.list(session.token);
      setTeams(res.teams);
    } catch (err) {
      console.error('Failed to load teams:', err);
    } finally {
      setLoading(false);
    }
  }, [session, setTeams, setLoading]);

  const checkKeyPair = useCallback(async () => {
    if (!session) return;
    try {
      await api.keypair.get(session.token);
      setHasKeyPair(true);
    } catch {
      setHasKeyPair(false);
    }
  }, [session, setHasKeyPair]);

  useEffect(() => {
    loadTeams();
    checkKeyPair();
  }, [loadTeams, checkKeyPair]);

  async function handleSetupKeyPair() {
    if (!session || !userKey) return;
    setSetupLoading(true);
    try {
      const kp = await createKeyPair(userKey);
      await api.keypair.create(kp, session.token);
      setHasKeyPair(true);
    } catch (err) {
      toast('Failed to set up encryption keys.', 'error');
      console.error(err);
    } finally {
      setSetupLoading(false);
    }
  }

  async function handleCreateTeam() {
    if (!session || !newTeamName.trim()) return;
    setCreating(true);
    try {
      await api.teams.create({ name: newTeamName.trim() }, session.token);
      setNewTeamName('');
      setShowCreate(false);
      await loadTeams();
    } catch (err) {
      toast('Failed to create team.', 'error');
      console.error(err);
    } finally {
      setCreating(false);
    }
  }

  async function handleAcceptInvite() {
    if (!session || !inviteToken.trim()) return;
    setAcceptingInvite(true);
    try {
      await api.teams.acceptInvite({ token: inviteToken.trim() }, session.token);
      setInviteToken('');
      await loadTeams();
    } catch (err) {
      toast('Failed to accept invite. Check the token and try again.', 'error');
      console.error(err);
    } finally {
      setAcceptingInvite(false);
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
          Loading Teams
        </h2>
        <p style={{ color: 'var(--color-text-secondary)' }}>Fetching your teams…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', padding: 16, background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button variant="ghost" size="sm" onClick={() => navigate('/vault')}>
              ← Back
            </Button>
            <h1
              style={{
                fontSize: 'var(--font-size-xl)',
                fontWeight: 700,
                color: 'var(--color-text)',
              }}
            >
              Teams
            </h1>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            Create Team
          </Button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!hasKeyPair && (
            <Card
              variant="frost"
              padding="md"
              style={{
                boxShadow: 'var(--shadow-lg)',
                borderLeft: '4px solid var(--color-warning)',
              }}
            >
              <h2
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  marginBottom: 8,
                }}
              >
                Set Up Encryption Keys
              </h2>
              <p
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-secondary)',
                  marginBottom: 16,
                }}
              >
                You need an RSA key pair to share folders and access shared items. This is a
                one-time setup.
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSetupKeyPair}
                disabled={setupLoading}
                loading={setupLoading}
              >
                {setupLoading ? 'Setting up…' : 'Generate Key Pair'}
              </Button>
            </Card>
          )}

          <Card variant="surface" padding="md" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <h2
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: 600,
                color: 'var(--color-text)',
                marginBottom: 16,
              }}
            >
              Accept an Invite
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                type="text"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAcceptInvite()}
                placeholder="Paste invite token"
                className="flex-1"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleAcceptInvite}
                disabled={acceptingInvite || !inviteToken.trim()}
                loading={acceptingInvite}
              >
                {acceptingInvite ? 'Accepting…' : 'Accept'}
              </Button>
            </div>
          </Card>

          {showCreate && (
            <Card variant="surface" padding="md" style={{ boxShadow: 'var(--shadow-lg)' }}>
              <h2
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  marginBottom: 16,
                }}
              >
                Create a Team
              </h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateTeam();
                    if (e.key === 'Escape') {
                      setShowCreate(false);
                      setNewTeamName('');
                    }
                  }}
                  placeholder="Team name"
                  className="flex-1"
                  autoFocus
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCreateTeam}
                  disabled={creating || !newTeamName.trim()}
                  loading={creating}
                >
                  {creating ? 'Creating…' : 'Create'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowCreate(false);
                    setNewTeamName('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </Card>
          )}

          {teams.length === 0 ? (
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
                👥
              </div>
              <h2
                style={{
                  fontSize: 'var(--font-size-xl)',
                  fontWeight: 700,
                  color: 'var(--color-text)',
                  marginBottom: 12,
                }}
              >
                No Teams Yet
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', maxWidth: 400, margin: '0 auto' }}>
                Create a team to start sharing folders and passwords with others.
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
              {teams.map((team) => (
                <Card
                  key={team.id}
                  variant="surface"
                  padding="md"
                  onClick={() => navigate(`/teams/${team.id}`)}
                  style={{ boxShadow: 'var(--shadow-lg)' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          fontSize: 'var(--font-size-lg)',
                          fontWeight: 600,
                          color: 'var(--color-text)',
                        }}
                      >
                        {team.name}
                      </h3>
                      <p
                        style={{
                          fontSize: 'var(--font-size-sm)',
                          color: 'var(--color-text-tertiary)',
                          marginTop: 4,
                        }}
                      >
                        Created {new Date(team.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      variant={
                        team.role === 'owner' || team.role === 'admin' ? 'primary' : 'default'
                      }
                    >
                      {team.role}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
