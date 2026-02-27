import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { useTeamsStore } from '../store/teams.js';
import { api } from '../lib/api.js';
import {
  createKeyPair,
  unlockPrivateKey,
  loadPublicKey,
  createFolderKeyForMembers,
} from '../lib/team-crypto.js';

interface Member {
  teamId: string;
  userId: string;
  email: string;
  role: string;
  customPermissions?: unknown;
  createdAt: string;
}

interface Invite {
  id: string;
  teamId: string;
  email: string;
  token: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  createdBy: string;
}

interface SharedFolderInfo {
  folderId: string;
  teamId: string;
  ownerUserId: string;
  permissionLevel: string;
  createdAt: string;
  folderName: string;
}

interface FolderOption {
  id: string;
  name: string;
}

export default function TeamDetail() {
  const navigate = useNavigate();
  const { teamId } = useParams<{ teamId: string }>();
  const { session, userKey } = useAuthStore();
  const { hasKeyPair, setHasKeyPair, privateKey, setPrivateKey } = useTeamsStore();

  const [teamName, setTeamName] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [sharedFolders, setSharedFolders] = useState<SharedFolderInfo[]>([]);
  const [userFolders, setUserFolders] = useState<FolderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Inline editing
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);

  // Share folder
  const [showShareFolder, setShowShareFolder] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [sharePermission, setSharePermission] = useState('read_write');
  const [sharing, setSharing] = useState(false);

  // Danger zone
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Determine current user's role
  const currentUserId = session?.userId;
  const myMembership = members.find((m) => m.userId === currentUserId);
  const myRole = myMembership?.role ?? 'member';
  const isOwner = myRole === 'owner';
  const isAdmin = myRole === 'owner' || myRole === 'admin';

  const showMessage = (msg: string, type: 'error' | 'success') => {
    if (type === 'error') {
      setError(msg);
      setSuccess(null);
    } else {
      setSuccess(msg);
      setError(null);
    }
    setTimeout(() => {
      setError(null);
      setSuccess(null);
    }, 4000);
  };

  const loadTeamDetail = useCallback(async () => {
    if (!session || !teamId) return;
    setLoading(true);
    try {
      const [teamRes, invitesRes, foldersRes, vaultRes] = await Promise.all([
        api.teams.get(teamId, session.token),
        isAdmin
          ? api.teams.listInvites(teamId, session.token).catch(() => ({ invites: [] as Invite[] }))
          : Promise.resolve({ invites: [] as Invite[] }),
        api.sharing.listSharedFolders(session.token),
        api.vault.list(session.token),
      ]);

      setTeamName(teamRes.team.name);
      setEditName(teamRes.team.name);
      setMembers(teamRes.members as Member[]);
      setInvites(invitesRes.invites as Invite[]);
      setSharedFolders(
        (foldersRes.sharedFolders as SharedFolderInfo[]).filter((f) => f.teamId === teamId)
      );

      const folders = (vaultRes as { folders: FolderOption[] }).folders ?? [];
      setUserFolders(folders);
    } catch (err) {
      console.error('Failed to load team:', err);
      showMessage('Failed to load team details.', 'error');
    } finally {
      setLoading(false);
    }
  }, [session, teamId, isAdmin]);

  useEffect(() => {
    loadTeamDetail();
  }, [loadTeamDetail]);

  // Ensure private key is loaded for sharing ops
  useEffect(() => {
    if (!session || !userKey || privateKey || !hasKeyPair) return;
    (async () => {
      try {
        const kp = await api.keypair.get(session.token);
        const pk = await unlockPrivateKey(kp.encryptedPrivateKey, userKey);
        setPrivateKey(pk);
      } catch {
        // Key pair not available
      }
    })();
  }, [session, userKey, privateKey, hasKeyPair, setPrivateKey]);

  async function handleRename() {
    if (!session || !teamId || !editName.trim()) return;
    try {
      await api.teams.update(teamId, { name: editName.trim() }, session.token);
      setTeamName(editName.trim());
      setEditingName(false);
      showMessage('Team renamed.', 'success');
    } catch {
      showMessage('Failed to rename team.', 'error');
    }
  }

  async function handleInvite() {
    if (!session || !teamId || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await api.teams.invite(
        teamId,
        { email: inviteEmail.trim(), role: inviteRole },
        session.token
      );
      showMessage(`Invite sent! Token: ${res.invite.token}`, 'success');
      setInviteEmail('');
      await loadTeamDetail();
    } catch {
      showMessage('Failed to send invite.', 'error');
    } finally {
      setInviting(false);
    }
  }

  async function handleCancelInvite(inviteId: string) {
    if (!session || !teamId) return;
    try {
      await api.teams.cancelInvite(teamId, inviteId, session.token);
      showMessage('Invite cancelled.', 'success');
      await loadTeamDetail();
    } catch {
      showMessage('Failed to cancel invite.', 'error');
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!session || !teamId) return;
    try {
      await api.teams.removeMember(teamId, memberId, session.token);
      showMessage('Member removed.', 'success');
      await loadTeamDetail();
    } catch {
      showMessage('Failed to remove member.', 'error');
    }
  }

  async function handleChangeRole(memberId: string, newRole: string) {
    if (!session || !teamId) return;
    try {
      await api.teams.updateMemberRole(teamId, memberId, { role: newRole }, session.token);
      showMessage('Role updated.', 'success');
      await loadTeamDetail();
    } catch {
      showMessage('Failed to change role.', 'error');
    }
  }

  async function handleShareFolder() {
    if (!session || !teamId || !selectedFolderId || !privateKey) return;
    setSharing(true);
    try {
      // Get all member public keys
      const memberPubKeys = await Promise.all(
        members.map(async (m) => {
          const res = await api.keypair.getPublicKey(m.userId, session.token);
          const pk = await loadPublicKey(res.publicKey);
          return { userId: m.userId, publicKey: pk };
        })
      );

      // Create folder key and wrap for each member
      const { memberKeys } = await createFolderKeyForMembers(memberPubKeys);

      await api.sharing.shareFolder(
        selectedFolderId,
        { teamId, permissionLevel: sharePermission, memberKeys },
        session.token
      );

      showMessage('Folder shared!', 'success');
      setShowShareFolder(false);
      setSelectedFolderId('');
      await loadTeamDetail();
    } catch (err) {
      console.error('Failed to share folder:', err);
      showMessage('Failed to share folder.', 'error');
    } finally {
      setSharing(false);
    }
  }

  async function handleUnshareFolder(folderId: string) {
    if (!session) return;
    try {
      await api.sharing.unshareFolder(folderId, session.token);
      showMessage('Folder unshared.', 'success');
      await loadTeamDetail();
    } catch {
      showMessage('Failed to unshare folder.', 'error');
    }
  }

  async function handleDeleteTeam() {
    if (!session || !teamId) return;
    setDeleting(true);
    try {
      await api.teams.delete(teamId, session.token);
      navigate('/teams');
    } catch {
      showMessage('Failed to delete team.', 'error');
      setDeleting(false);
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

  const permColor = (perm: string) =>
    perm === 'read_write' ? 'bg-green-500/20 text-green-300' : 'bg-white/[0.08] text-white/50';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-xl font-medium text-white mb-2">Loading Team</h2>
        <p className="text-white/60">Fetching team details…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/teams')} className="text-white/40 hover:text-white/70">
            ← Back
          </button>
          {editingName ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename();
                  if (e.key === 'Escape') {
                    setEditingName(false);
                    setEditName(teamName);
                  }
                }}
                className="px-3 py-1 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white text-2xl font-bold"
                autoFocus
              />
              <button
                onClick={handleRename}
                className="px-2 py-1 text-xs bg-indigo-600/80 text-white rounded hover:bg-indigo-500/90"
              >
                ✓
              </button>
              <button
                onClick={() => {
                  setEditingName(false);
                  setEditName(teamName);
                }}
                className="px-2 py-1 text-xs text-white/30 hover:text-white/60"
              >
                ✕
              </button>
            </div>
          ) : (
            <h1
              className={`text-2xl font-bold text-white ${isAdmin ? 'cursor-pointer hover:text-indigo-300 transition-colors' : ''}`}
              onClick={() => isAdmin && setEditingName(true)}
              title={isAdmin ? 'Click to rename' : undefined}
            >
              {teamName}
            </h1>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-lg bg-green-500/20 border border-green-500/30 text-green-300 text-sm">
            {success}
          </div>
        )}

        <div className="space-y-6">
          {/* Members */}
          <section className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Members ({members.length})</h2>
            <div className="space-y-3">
              {members.map((member) => (
                <div key={member.userId} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center text-sm text-white/60 shrink-0">
                      {member.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{member.email}</p>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium capitalize mt-0.5 ${roleColor(member.role)}`}
                      >
                        {member.role}
                      </span>
                    </div>
                  </div>
                  {isAdmin && member.userId !== currentUserId && member.role !== 'owner' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={member.role}
                        onChange={(e) => handleChangeRole(member.userId, e.target.value)}
                        className="px-2 py-1 text-xs border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        onClick={() => handleRemoveMember(member.userId)}
                        className="text-red-400 hover:text-red-300 text-xs transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Invite member */}
          {isAdmin && (
            <section className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Invite Member</h2>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  placeholder="email@example.com"
                  className="flex-1 px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white placeholder-white/30"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="px-4 py-2 bg-indigo-600/80 hover:bg-indigo-500/90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {inviting ? 'Sending…' : 'Invite'}
                </button>
              </div>
            </section>
          )}

          {/* Pending invites */}
          {isAdmin && invites.length > 0 && (
            <section className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6">
              <h2 className="text-lg font-semibold text-white mb-4">
                Pending Invites ({invites.length})
              </h2>
              <div className="space-y-3">
                {invites.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm text-white">{invite.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${roleColor(invite.role)}`}
                        >
                          {invite.role}
                        </span>
                        <span className="text-[10px] text-white/40">
                          Expires {new Date(invite.expiresAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleCancelInvite(invite.id)}
                      className="text-red-400 hover:text-red-300 text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Shared folders */}
          <section className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Shared Folders ({sharedFolders.length})
              </h2>
              {isAdmin && hasKeyPair && (
                <button
                  onClick={() => setShowShareFolder(!showShareFolder)}
                  className="text-sm text-indigo-300 hover:text-indigo-200 hover:underline transition-colors"
                >
                  {showShareFolder ? 'Cancel' : '+ Share a Folder'}
                </button>
              )}
            </div>

            {showShareFolder && (
              <div className="mb-4 p-4 rounded-xl border border-white/[0.08] bg-white/[0.03] space-y-3">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Folder</label>
                  <select
                    value={selectedFolderId}
                    onChange={(e) => setSelectedFolderId(e.target.value)}
                    className="w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white"
                  >
                    <option value="">Select a folder…</option>
                    {userFolders
                      .filter((f) => !sharedFolders.some((sf) => sf.folderId === f.id))
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Permission</label>
                  <div className="flex gap-2">
                    {(['read_write', 'read_only'] as const).map((perm) => (
                      <button
                        key={perm}
                        onClick={() => setSharePermission(perm)}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                          sharePermission === perm
                            ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-300'
                            : 'border-white/[0.12] text-white/60 hover:border-white/[0.2]'
                        }`}
                      >
                        {perm === 'read_write' ? 'Read & Write' : 'Read Only'}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleShareFolder}
                  disabled={sharing || !selectedFolderId}
                  className="w-full px-4 py-2 bg-indigo-600/80 hover:bg-indigo-500/90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {sharing ? 'Sharing…' : 'Share Folder'}
                </button>
              </div>
            )}

            {sharedFolders.length === 0 ? (
              <p className="text-sm text-white/40">No folders shared with this team yet.</p>
            ) : (
              <div className="space-y-2">
                {sharedFolders.map((sf) => (
                  <div
                    key={sf.folderId}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">📁</span>
                      <span className="text-sm text-white">{sf.folderName}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${permColor(sf.permissionLevel)}`}
                      >
                        {sf.permissionLevel === 'read_write' ? 'Read & Write' : 'Read Only'}
                      </span>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => handleUnshareFolder(sf.folderId)}
                        className="text-red-400 hover:text-red-300 text-xs transition-colors"
                      >
                        Unshare
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Danger zone */}
          {isOwner && (
            <section className="backdrop-blur-xl bg-red-500/[0.05] border border-red-500/[0.15] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6">
              <h2 className="text-lg font-semibold text-red-400 mb-4">Danger Zone</h2>
              {confirmDelete ? (
                <div>
                  <p className="text-sm text-white/70 mb-3">
                    Are you sure? This will permanently delete the team and remove all shared folder
                    access for members.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteTeam}
                      disabled={deleting}
                      className="px-4 py-2 bg-red-500/80 hover:bg-red-400/90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {deleting ? 'Deleting…' : 'Yes, Delete Team'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="px-4 py-2 text-white/40 hover:text-white/70 text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="px-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg text-sm font-medium transition-colors"
                >
                  Delete Team
                </button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
