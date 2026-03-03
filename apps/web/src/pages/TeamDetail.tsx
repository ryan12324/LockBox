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
import { useToast } from '../providers/ToastProvider.js';
import { Button, Input, Card, Badge, Select } from '@lockbox/design';

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
  const { toast } = useToast();

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
    toast(msg, type);
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="w-16 h-16 border-4 border-[var(--color-primary)] border-t-transparent rounded-[var(--radius-full)] animate-spin mb-4" />
        <h2 className="text-xl font-medium text-[var(--color-text)] mb-2">Loading Team</h2>
        <p className="text-[var(--color-text-secondary)]">Fetching team details…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/teams')}>
            ← Back
          </Button>
          {editingName ? (
            <div className="flex items-center gap-2 flex-1">
              <Input
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
                className="flex-1"
                style={{ fontSize: '1.5rem', fontWeight: 'bold' }}
                autoFocus
              />
              <Button variant="primary" size="sm" onClick={handleRename}>
                ✓
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingName(false);
                  setEditName(teamName);
                }}
              >
                ✕
              </Button>
            </div>
          ) : (
            <h1
              className={`text-2xl font-bold text-[var(--color-text)] ${isAdmin ? 'cursor-pointer hover:text-[var(--color-primary)] transition-colors' : ''}`}
              onClick={() => isAdmin && setEditingName(true)}
              title={isAdmin ? 'Click to rename' : undefined}
            >
              {teamName}
            </h1>
          )}
        </div>

        <div className="space-y-6">
          <Card variant="surface" padding="md">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">
              Members ({members.length})
            </h2>
            <div className="space-y-3">
              {members.map((member) => (
                <div key={member.userId} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-[var(--radius-full)] bg-[var(--color-surface)] flex items-center justify-center text-sm text-[var(--color-text-secondary)] shrink-0">
                      {member.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--color-text)] truncate">{member.email}</p>
                      <Badge
                        variant={
                          member.role === 'owner' || member.role === 'admin' ? 'primary' : 'default'
                        }
                        style={{ marginTop: 2, textTransform: 'capitalize' }}
                      >
                        {member.role}
                      </Badge>
                    </div>
                  </div>
                  {isAdmin && member.userId !== currentUserId && member.role !== 'owner' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Select
                        value={member.role}
                        onChange={(e) => handleChangeRole(member.userId, e.target.value)}
                        options={[
                          { value: 'member', label: 'Member' },
                          { value: 'admin', label: 'Admin' },
                        ]}
                        style={{
                          padding: '4px 28px 4px 8px',
                          fontSize: 'var(--font-size-xs)',
                          minWidth: 100,
                        }}
                      />
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleRemoveMember(member.userId)}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {isAdmin && (
            <Card variant="surface" padding="md">
              <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Invite Member</h2>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  placeholder="email@example.com"
                  className="flex-1"
                />
                <Select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  options={[
                    { value: 'member', label: 'Member' },
                    { value: 'admin', label: 'Admin' },
                  ]}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  loading={inviting}
                >
                  {inviting ? 'Sending…' : 'Invite'}
                </Button>
              </div>
            </Card>
          )}

          {isAdmin && invites.length > 0 && (
            <Card variant="surface" padding="md">
              <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">
                Pending Invites ({invites.length})
              </h2>
              <div className="space-y-3">
                {invites.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm text-[var(--color-text)]">{invite.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant={invite.role === 'admin' ? 'primary' : 'default'}
                          style={{ textTransform: 'capitalize' }}
                        >
                          {invite.role}
                        </Badge>
                        <span className="text-[10px] text-[var(--color-text-tertiary)]">
                          Expires {new Date(invite.expiresAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleCancelInvite(invite.id)}
                    >
                      Cancel
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card variant="surface" padding="md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">
                Shared Folders ({sharedFolders.length})
              </h2>
              {isAdmin && hasKeyPair && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowShareFolder(!showShareFolder)}
                >
                  {showShareFolder ? 'Cancel' : '+ Share a Folder'}
                </Button>
              )}
            </div>

            {showShareFolder && (
              <div className="mb-4 p-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] space-y-3">
                <Select
                  label="Folder"
                  value={selectedFolderId}
                  onChange={(e) => setSelectedFolderId(e.target.value)}
                  options={[
                    { value: '', label: 'Select a folder…' },
                    ...userFolders
                      .filter((f) => !sharedFolders.some((sf) => sf.folderId === f.id))
                      .map((f) => ({ value: f.id, label: f.name })),
                  ]}
                />
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                    Permission
                  </label>
                  <div className="flex gap-2">
                    {(['read_write', 'read_only'] as const).map((perm) => (
                      <Button
                        key={perm}
                        variant={sharePermission === perm ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => setSharePermission(perm)}
                        style={{ flex: 1 }}
                      >
                        {perm === 'read_write' ? 'Read & Write' : 'Read Only'}
                      </Button>
                    ))}
                  </div>
                </div>
                <Button
                  variant="primary"
                  onClick={handleShareFolder}
                  disabled={sharing || !selectedFolderId}
                  loading={sharing}
                  style={{ width: '100%' }}
                >
                  {sharing ? 'Sharing…' : 'Share Folder'}
                </Button>
              </div>
            )}

            {sharedFolders.length === 0 ? (
              <p className="text-sm text-[var(--color-text-tertiary)]">
                No folders shared with this team yet.
              </p>
            ) : (
              <div className="space-y-2">
                {sharedFolders.map((sf) => (
                  <div
                    key={sf.folderId}
                    className="flex items-center justify-between py-2.5 px-3 rounded-[var(--radius-md)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">📁</span>
                      <span className="text-sm text-[var(--color-text)]">{sf.folderName}</span>
                      <Badge variant={sf.permissionLevel === 'read_write' ? 'success' : 'default'}>
                        {sf.permissionLevel === 'read_write' ? 'Read & Write' : 'Read Only'}
                      </Badge>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleUnshareFolder(sf.folderId)}
                      >
                        Unshare
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {isOwner && (
            <Card
              variant="surface"
              padding="md"
              style={{
                background: 'var(--color-error-subtle)',
                border: '1px solid var(--color-error)',
              }}
            >
              <h2 className="text-lg font-semibold text-[var(--color-error)] mb-4">Danger Zone</h2>
              {confirmDelete ? (
                <div>
                  <p className="text-sm text-[var(--color-text-secondary)] mb-3">
                    Are you sure? This will permanently delete the team and remove all shared folder
                    access for members.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleDeleteTeam}
                      disabled={deleting}
                      loading={deleting}
                    >
                      {deleting ? 'Deleting…' : 'Yes, Delete Team'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                  Delete Team
                </Button>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
