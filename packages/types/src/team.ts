/**
 * Team and sharing types for E2EE folder sharing.
 */

/** Team roles with hierarchical permissions */
export type TeamRole = 'owner' | 'admin' | 'member' | 'custom';

/** Granular permissions for custom role */
export interface CustomPermissions {
  canInvite: boolean;
  canRemove: boolean;
  canCreateFolders: boolean;
  canEditItems: boolean;
  canDeleteItems: boolean;
  canShare: boolean;
}

/** Team entity */
export interface Team {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

/** Team membership record */
export interface TeamMember {
  teamId: string;
  userId: string;
  email: string;
  role: TeamRole;
  customPermissions?: CustomPermissions;
  createdAt: string;
}

/** Pending team invite */
export interface TeamInvite {
  id: string;
  teamId: string;
  email: string;
  token: string;
  role: TeamRole;
  createdBy: string;
  expiresAt: string;
  createdAt: string;
}

/** RSA key pair for a user (public key plaintext, private key encrypted) */
export interface UserKeyPair {
  userId: string;
  publicKey: string; // JWK JSON string
  encryptedPrivateKey: string; // AES-256-GCM encrypted with userKey
  createdAt: string;
}

/** Shared folder — links a personal folder to a team */
export interface SharedFolder {
  folderId: string;
  teamId: string;
  ownerUserId: string;
  permissionLevel: FolderPermission;
  createdAt: string;
}

/** Per-member wrapped folder key */
export interface SharedFolderKey {
  folderId: string;
  userId: string;
  encryptedFolderKey: string; // RSA-OAEP wrapped folder key
  grantedBy: string;
  grantedAt: string;
}

/** Folder permission levels */
export type FolderPermission = 'read_only' | 'read_write';
