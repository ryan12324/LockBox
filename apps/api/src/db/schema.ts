import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  authHash: text('auth_hash').notNull(), // server-side Argon2id of client auth hash
  encryptedUserKey: text('encrypted_user_key').notNull(), // opaque base64 blob
  kdfConfig: text('kdf_config').notNull(), // JSON: {type, iterations, memory, parallelism}
  salt: text('salt').notNull(), // base64
  recoveryKeyHash: text('recovery_key_hash'), // bcrypt hash of recovery key
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  travelMode: integer('travel_mode').notNull().default(0), // 0 = off, 1 = on
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  token: text('token').notNull().unique(), // random 256-bit token
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const folders = sqliteTable('folders', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  parentId: text('parent_id'), // self-referential FK
  createdAt: text('created_at').notNull(),
  travelSafe: integer('travel_safe').notNull().default(1), // 1 = safe for travel, 0 = hide in travel mode
});

export const vaultItems = sqliteTable('vault_items', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  type: text('type').notNull(), // 'login' | 'note' | 'card' | 'identity'
  encryptedData: text('encrypted_data').notNull(), // opaque base64 blob — server never decrypts
  folderId: text('folder_id').references(() => folders.id),
  tags: text('tags'), // JSON array of strings
  favorite: integer('favorite').default(0), // 0 or 1
  revisionDate: text('revision_date').notNull(),
  createdAt: text('created_at').notNull(),
  deletedAt: text('deleted_at'), // null = active, set = soft-deleted
});

// ─── Account 2FA ────────────────────────────────────────────────────────────

// TOTP settings for account-level 2FA
export const userTotpSettings = sqliteTable('user_totp_settings', {
  userId: text('user_id').primaryKey().references(() => users.id),
  encryptedTotpSecret: text('encrypted_totp_secret').notNull(), // encrypted with auth hash derivative
  enabled: integer('enabled').notNull().default(0), // 0 = setup pending, 1 = active
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// Backup codes for 2FA recovery
export const backupCodes = sqliteTable('backup_codes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  codeHash: text('code_hash').notNull(), // bcrypt hash of backup code
  used: integer('used').notNull().default(0), // 0 = unused, 1 = used
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── Teams & Sharing ───────────────────────────────────────────────────────

// User key pairs for E2EE sharing
export const userKeyPairs = sqliteTable('user_key_pairs', {
  userId: text('user_id').primaryKey().references(() => users.id),
  publicKey: text('public_key').notNull(),
  encryptedPrivateKey: text('encrypted_private_key').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// Teams
export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// Team members
export const teamMembers = sqliteTable('team_members', {
  teamId: text('team_id').notNull().references(() => teams.id),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role').notNull().default('member'), // owner | admin | member | custom
  customPermissions: text('custom_permissions'), // JSON
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  pk: primaryKey({ columns: [table.teamId, table.userId] }),
}));

// Team invites
export const teamInvites = sqliteTable('team_invites', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id),
  email: text('email').notNull(),
  token: text('token').notNull().unique(),
  role: text('role').notNull().default('member'),
  createdBy: text('created_by').notNull().references(() => users.id),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// Shared folders (links a folder to a team)
export const sharedFolders = sqliteTable('shared_folders', {
  folderId: text('folder_id').notNull().references(() => folders.id),
  teamId: text('team_id').notNull().references(() => teams.id),
  ownerUserId: text('owner_user_id').notNull().references(() => users.id),
  permissionLevel: text('permission_level').notNull().default('read_write'), // read_only | read_write
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  pk: primaryKey({ columns: [table.folderId, table.teamId] }),
}));

// Shared folder keys (per-member wrapped folder key)
export const sharedFolderKeys = sqliteTable('shared_folder_keys', {
  folderId: text('folder_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id),
  encryptedFolderKey: text('encrypted_folder_key').notNull(),
  grantedBy: text('granted_by').notNull().references(() => users.id),
  grantedAt: text('granted_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  pk: primaryKey({ columns: [table.folderId, table.userId] }),
}));

// Share links (anonymous password sharing)
export const shareLinks = sqliteTable('share_links', {
  id: text('id').primaryKey(), // Client-generated from HKDF
  userId: text('user_id').notNull().references(() => users.id),
  encryptedItem: text('encrypted_item').notNull(),
  tokenHash: text('token_hash').notNull(), // SHA-256 of auth token
  itemName: text('item_name').notNull(),
  maxViews: integer('max_views').notNull().default(1),
  viewCount: integer('view_count').notNull().default(0),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── File Attachments ─────────────────────────────────────────────────────

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull(),
  userId: text('user_id').notNull(),
  encryptedName: text('encrypted_name').notNull(),
  encryptedMimeType: text('encrypted_mime_type').notNull(),
  size: integer('size').notNull(),
  createdAt: text('created_at').notNull(),
});

// ─── Version History ──────────────────────────────────────────────────────────

export const vaultItemVersions = sqliteTable('vault_item_versions', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull(),
  userId: text('user_id').notNull(),
  encryptedData: text('encrypted_data').notNull(),
  revisionDate: text('revision_date').notNull(),
  createdAt: text('created_at').notNull(),
});

// ─── Email Alias Settings ────────────────────────────────────────────────────

export const aliasSettings = sqliteTable('alias_settings', {
  userId: text('user_id').primaryKey().references(() => users.id),
  provider: text('provider').notNull(), // 'simplelogin' | 'anonaddy'
  encryptedApiKey: text('encrypted_api_key').notNull(), // encrypted client-side
  baseUrl: text('base_url'), // optional custom instance URL
});

// ─── Emergency Access ─────────────────────────────────────────────────────────

export const emergencyAccessGrants = sqliteTable('emergency_access_grants', {
  id: text('id').primaryKey(),
  grantorUserId: text('grantor_user_id').notNull().references(() => users.id),
  granteeEmail: text('grantee_email').notNull(),
  granteeUserId: text('grantee_user_id'),
  waitPeriodDays: integer('wait_period_days').notNull().default(7),
  status: text('status').notNull().default('pending'), // pending|confirmed|waiting|approved|rejected|expired
  encryptedUserKey: text('encrypted_user_key').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const emergencyAccessRequests = sqliteTable('emergency_access_requests', {
  id: text('id').primaryKey(),
  grantId: text('grant_id').notNull().references(() => emergencyAccessGrants.id),
  requestedAt: text('requested_at').notNull().default(sql`(datetime('now'))`),
  approvedAt: text('approved_at'),
  rejectedAt: text('rejected_at'),
  expiresAt: text('expires_at').notNull(),
});
