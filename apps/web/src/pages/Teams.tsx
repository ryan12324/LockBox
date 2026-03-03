import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { useTeamsStore } from '../store/teams.js';
import { api } from '../lib/api.js';
import { createKeyPair } from '../lib/team-crypto.js';

export default function Teams() {
  const navigate = useNavigate();
  const { session, userKey } = useAuthStore();
  const { teams, setTeams, hasKeyPair, setHasKeyPair, loading, setLoading } = useTeamsStore();

  const [showCreate, setShowCreate] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [creating, setCreating] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    try {
      const kp = await createKeyPair(userKey);
      await api.keypair.create(kp, session.token);
      setHasKeyPair(true);
    } catch (err) {
      setError('Failed to set up encryption keys.');
      console.error(err);
    } finally {
      setSetupLoading(false);
    }
  }

  async function handleCreateTeam() {
    if (!session || !newTeamName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api.teams.create({ name: newTeamName.trim() }, session.token);
      setNewTeamName('');
      setShowCreate(false);
      await loadTeams();
    } catch (err) {
      setError('Failed to create team.');
      console.error(err);
    } finally {
      setCreating(false);
    }
  }

  async function handleAcceptInvite() {
    if (!session || !inviteToken.trim()) return;
    setAcceptingInvite(true);
    setError(null);
    try {
      await api.teams.acceptInvite({ token: inviteToken.trim() }, session.token);
      setInviteToken('');
      await loadTeams();
    } catch (err) {
      setError('Failed to accept invite. Check the token and try again.');
      console.error(err);
    } finally {
      setAcceptingInvite(false);
    }
  }

  const roleColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-[var(--color-aura-dim)] text-[var(--color-primary)]';
      case 'admin':
        return 'bg-[var(--color-aura-dim)] text-[var(--color-primary)]';
      default:
        return 'bg-[var(--color-surface)] text-[var(--color-text-tertiary)]';
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="w-16 h-16 border-4 border-[var(--color-primary)] border-t-transparent rounded-[var(--radius-full)] animate-spin mb-4" />
        <h2 className="text-xl font-medium text-[var(--color-text)] mb-2">Loading Teams</h2>
        <p className="text-[var(--color-text-secondary)]">Fetching your teams…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/vault')}
              className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            >
              ← Back
            </button>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">Teams</h1>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-fg)] rounded-[var(--radius-md)] text-sm font-medium transition-colors"
          >
            Create Team
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-[var(--radius-md)] bg-[var(--color-error-subtle)] border border-[var(--color-error)] text-[var(--color-error)] text-sm">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {!hasKeyPair && (
            <section className="bg-[var(--color-warning-subtle)] border border-[var(--color-warning)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text)] mb-2">
                Set Up Encryption Keys
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)] mb-4">
                You need an RSA key pair to share folders and access shared items. This is a
                one-time setup.
              </p>
              <button
                onClick={handleSetupKeyPair}
                disabled={setupLoading}
                className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-fg)] rounded-[var(--radius-md)] text-sm font-medium transition-colors disabled:opacity-50"
              >
                {setupLoading ? 'Setting up…' : 'Generate Key Pair'}
              </button>
            </section>
          )}

          <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-6">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">
              Accept an Invite
            </h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAcceptInvite()}
                placeholder="Paste invite token"
                className="flex-1 px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder-[var(--color-text-tertiary)]"
              />
              <button
                onClick={handleAcceptInvite}
                disabled={acceptingInvite || !inviteToken.trim()}
                className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-fg)] rounded-[var(--radius-md)] text-sm font-medium transition-colors disabled:opacity-50"
              >
                {acceptingInvite ? 'Accepting…' : 'Accept'}
              </button>
            </div>
          </section>

          {showCreate && (
            <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Create a Team</h2>
              <div className="flex gap-2">
                <input
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
                  className="flex-1 px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder-[var(--color-text-tertiary)]"
                  autoFocus
                />
                <button
                  onClick={handleCreateTeam}
                  disabled={creating || !newTeamName.trim()}
                  className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-fg)] rounded-[var(--radius-md)] text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
                <button
                  onClick={() => {
                    setShowCreate(false);
                    setNewTeamName('');
                  }}
                  className="px-3 py-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </section>
          )}

          {teams.length === 0 ? (
            <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-12 text-center">
              <div className="w-20 h-20 rounded-[var(--radius-full)] bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center mx-auto mb-6 text-[var(--color-text-tertiary)] text-3xl">
                👥
              </div>
              <h2 className="text-2xl font-medium text-[var(--color-text)] mb-3">No Teams Yet</h2>
              <p className="text-[var(--color-text-secondary)] max-w-md mx-auto">
                Create a team to start sharing folders and passwords with others.
              </p>
            </section>
          ) : (
            <div className="space-y-3">
              {teams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => navigate(`/teams/${team.id}`)}
                  className="w-full text-left bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-5 hover:bg-[var(--color-surface-raised)] transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors">
                        {team.name}
                      </h3>
                      <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                        Created {new Date(team.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-[var(--radius-full)] text-xs font-medium capitalize ${roleColor(team.role)}`}
                    >
                      {team.role}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
