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

  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);

  const [showShareFolder, setShowShareFolder] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [sharePermission, setSharePermission] = useState('read_write');
  const [sharing, setSharing] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      const memberPubKeys = await Promise.all(
        members.map(async (m) => {
          const res = await api.keypair.getPublicKey(m.userId, session.token);
          const pk = await loadPublicKey(res.publicKey);
          return { userId: m.userId, publicKey: pk };
        })
      );

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
          Loading Team
        </h2>
        <p style={{ color: 'var(--color-text-secondary)' }}>Fetching team details…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', padding: 16, background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Button variant="ghost" size="sm" onClick={() => navigate('/teams')}>
            ← Back
          </Button>
          {editingName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
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
                style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700 }}
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
              style={{
                fontSize: 'var(--font-size-xl)',
                fontWeight: 700,
                color: 'var(--color-text)',
                cursor: isAdmin ? 'pointer' : 'default',
                transition: 'color 0.15s',
              }}
              onClick={() => isAdmin && setEditingName(true)}
              title={isAdmin ? 'Click to rename' : undefined}
            >
              {teamName}
            </h1>
          )}
        </div>

        <Card
          variant="frost"
          padding="lg"
          style={{ boxShadow: 'var(--shadow-xl)', marginBottom: 16 }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: 'var(--font-size-xl)',
                  fontWeight: 700,
                  color: 'var(--color-text)',
                }}
              >
                {teamName}
              </h2>
              <p
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-tertiary)',
                  marginTop: 4,
                }}
              >
                {members.length} {members.length === 1 ? 'member' : 'members'} ·{' '}
                {sharedFolders.length} shared {sharedFolders.length === 1 ? 'folder' : 'folders'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge variant="primary" style={{ textTransform: 'capitalize' }}>
                {myRole}
              </Badge>
              {hasKeyPair && <Badge variant="success">Keys Active</Badge>}
            </div>
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card variant="surface" padding="md" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <h2
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: 600,
                color: 'var(--color-text)',
                marginBottom: 16,
              }}
            >
              Members ({members.length})
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 12,
              }}
            >
              {members.map((member) => (
                <div
                  key={member.userId}
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
                    style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}
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
                      {member.email.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 'var(--font-size-sm)',
                          color: 'var(--color-text)',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {member.email}
                      </p>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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
            <Card variant="surface" padding="md" style={{ boxShadow: 'var(--shadow-lg)' }}>
              <h2
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  marginBottom: 16,
                }}
              >
                Invite Member
              </h2>
              <div style={{ display: 'flex', gap: 8 }}>
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
            <Card variant="surface" padding="md" style={{ boxShadow: 'var(--shadow-lg)' }}>
              <h2
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  marginBottom: 16,
                }}
              >
                Pending Invites ({invites.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {invites.map((invite) => (
                  <div
                    key={invite.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 12,
                      borderRadius: 'var(--radius-organic-lg)',
                      background: 'var(--color-bg)',
                      boxShadow: 'var(--shadow-md)',
                    }}
                  >
                    <div>
                      <p
                        style={{
                          fontSize: 'var(--font-size-sm)',
                          color: 'var(--color-text)',
                          fontWeight: 500,
                        }}
                      >
                        {invite.email}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <Badge
                          variant={invite.role === 'admin' ? 'primary' : 'default'}
                          style={{ textTransform: 'capitalize' }}
                        >
                          {invite.role}
                        </Badge>
                        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
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

          <Card variant="surface" padding="md" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <h2
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                }}
              >
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
              <div
                style={{
                  marginBottom: 16,
                  padding: 16,
                  borderRadius: 'var(--radius-organic-lg)',
                  background: 'var(--color-bg)',
                  boxShadow: 'var(--shadow-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
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
                  <label
                    style={{
                      display: 'block',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 500,
                      color: 'var(--color-text-secondary)',
                      marginBottom: 4,
                    }}
                  >
                    Permission
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
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
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
                No folders shared with this team yet.
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 12,
                }}
              >
                {sharedFolders.map((sf) => (
                  <div
                    key={sf.folderId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 12,
                      borderRadius: 'var(--radius-organic-lg)',
                      background: 'var(--color-bg)',
                      boxShadow: 'var(--shadow-md)',
                      transition: 'transform 0.15s, box-shadow 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 'var(--font-size-lg)' }}>🔒</span>
                      <span
                        style={{
                          fontSize: 'var(--font-size-sm)',
                          color: 'var(--color-text)',
                          fontWeight: 500,
                        }}
                      >
                        {sf.folderName}
                      </span>
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
                boxShadow: 'var(--shadow-lg)',
                borderLeft: '4px solid var(--color-error)',
              }}
            >
              <h2
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-error)',
                  marginBottom: 16,
                }}
              >
                Danger Zone
              </h2>
              {confirmDelete ? (
                <div>
                  <p
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-secondary)',
                      marginBottom: 12,
                    }}
                  >
                    Are you sure? This will permanently delete the team and remove all shared folder
                    access for members.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
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
