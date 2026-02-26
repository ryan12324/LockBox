import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

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
});

export const vaultItems = sqliteTable('vault_items', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  type: text('type').notNull(), // 'login' | 'note' | 'card'
  encryptedData: text('encrypted_data').notNull(), // opaque base64 blob — server never decrypts
  folderId: text('folder_id').references(() => folders.id),
  tags: text('tags'), // JSON array of strings
  favorite: integer('favorite').default(0), // 0 or 1
  revisionDate: text('revision_date').notNull(),
  createdAt: text('created_at').notNull(),
  deletedAt: text('deleted_at'), // null = active, set = soft-deleted
});
