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
        return 'bg-indigo-500/20 text-indigo-300';
      case 'admin':
        return 'bg-purple-500/20 text-purple-300';
      default:
        return 'bg-white/[0.08] text-white/50';
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-xl font-medium text-white mb-2">Loading Teams</h2>
        <p className="text-white/60">Fetching your teams…</p>
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
              className="text-white/40 hover:text-white/70"
            >
              ← Back
            </button>
            <h1 className="text-2xl font-bold text-white">Teams</h1>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-indigo-600/80 hover:bg-indigo-500/90 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Create Team
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Key pair setup banner */}
          {!hasKeyPair && (
            <section className="backdrop-blur-xl bg-amber-500/[0.08] border border-amber-500/[0.2] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6">
              <h2 className="text-lg font-semibold text-white mb-2">Set Up Encryption Keys</h2>
              <p className="text-sm text-white/60 mb-4">
                You need an RSA key pair to share folders and access shared items. This is a
                one-time setup.
              </p>
              <button
                onClick={handleSetupKeyPair}
                disabled={setupLoading}
                className="px-4 py-2 bg-indigo-600/80 hover:bg-indigo-500/90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {setupLoading ? 'Setting up…' : 'Generate Key Pair'}
              </button>
            </section>
          )}

          {/* Accept invite */}
          <section className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Accept an Invite</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAcceptInvite()}
                placeholder="Paste invite token"
                className="flex-1 px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white placeholder-white/30"
              />
              <button
                onClick={handleAcceptInvite}
                disabled={acceptingInvite || !inviteToken.trim()}
                className="px-4 py-2 bg-indigo-600/80 hover:bg-indigo-500/90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {acceptingInvite ? 'Accepting…' : 'Accept'}
              </button>
            </div>
          </section>

          {/* Create team inline form */}
          {showCreate && (
            <section className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Create a Team</h2>
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
                  className="flex-1 px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white placeholder-white/30"
                  autoFocus
                />
                <button
                  onClick={handleCreateTeam}
                  disabled={creating || !newTeamName.trim()}
                  className="px-4 py-2 bg-indigo-600/80 hover:bg-indigo-500/90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
                <button
                  onClick={() => {
                    setShowCreate(false);
                    setNewTeamName('');
                  }}
                  className="px-3 py-2 text-white/40 hover:text-white/70 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </section>
          )}

          {/* Teams list */}
          {teams.length === 0 ? (
            <section className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-12 text-center">
              <div className="w-20 h-20 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center mx-auto mb-6 text-white/40 text-3xl">
                👥
              </div>
              <h2 className="text-2xl font-medium text-white mb-3">No Teams Yet</h2>
              <p className="text-white/60 max-w-md mx-auto">
                Create a team to start sharing folders and passwords with others.
              </p>
            </section>
          ) : (
            <div className="space-y-3">
              {teams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => navigate(`/teams/${team.id}`)}
                  className="w-full text-left backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-5 hover:bg-white/[0.09] transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition-colors">
                        {team.name}
                      </h3>
                      <p className="text-xs text-white/40 mt-1">
                        Created {new Date(team.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${roleColor(team.role)}`}
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
