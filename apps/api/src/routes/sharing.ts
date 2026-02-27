/**
 * Folder sharing routes — share folders with teams, manage folder keys.
 * 7 endpoints total.
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { sharedFolders, sharedFolderKeys, teamMembers, folders, vaultItems } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';

type Bindings = { DB: D1Database };
type Variables = { userId: string };

export const sharingRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

sharingRoutes.use('*', authMiddleware);

// ─── POST /folders/:folderId/share — Share folder with team ──────────────────

sharingRoutes.post('/folders/:folderId/share', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('folderId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { teamId, permissionLevel } = body as Record<string, unknown>;
  if (!teamId || typeof teamId !== 'string') {
    return c.json({ error: 'Missing required field: teamId' }, 400);
  }

  const db = createDb(c.env.DB);

  // Verify user owns the folder
  const folder = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .get();

  if (!folder) return c.json({ error: 'Folder not found or not owned by you' }, 404);

  // Verify user is a member of the team
  const membership = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .get();

  if (!membership) return c.json({ error: 'Not a member of this team' }, 403);

  // Check not already shared
  const existing = await db
    .select()
    .from(sharedFolders)
    .where(and(eq(sharedFolders.folderId, folderId), eq(sharedFolders.teamId, teamId)))
    .get();

  if (existing) return c.json({ error: 'Folder already shared with this team' }, 409);

  await db.insert(sharedFolders).values({
    folderId,
    teamId,
    ownerUserId: userId,
    permissionLevel: typeof permissionLevel === 'string' ? permissionLevel : 'read_write',
  });

  return c.json({ success: true, folderId, teamId }, 201);
});

// ─── DELETE /folders/:folderId/unshare — Unshare folder ──────────────────────

sharingRoutes.delete('/folders/:folderId/unshare', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('folderId');
  const body = await c.req.json().catch(() => null);

  const teamId = (body as Record<string, unknown> | null)?.teamId;
  if (!teamId || typeof teamId !== 'string') {
    return c.json({ error: 'Missing required field: teamId' }, 400);
  }

  const db = createDb(c.env.DB);

  // Only the folder owner can unshare
  const share = await db
    .select()
    .from(sharedFolders)
    .where(and(eq(sharedFolders.folderId, folderId), eq(sharedFolders.teamId, teamId)))
    .get();

  if (!share) return c.json({ error: 'Share not found' }, 404);
  if (share.ownerUserId !== userId)
    return c.json({ error: 'Only the folder owner can unshare' }, 403);

  // Remove all folder keys for this folder
  await db.delete(sharedFolderKeys).where(eq(sharedFolderKeys.folderId, folderId));
  await db
    .delete(sharedFolders)
    .where(and(eq(sharedFolders.folderId, folderId), eq(sharedFolders.teamId, teamId)));

  return c.json({ success: true });
});

// ─── GET /folders/:folderId/keys — Get folder keys ───────────────────────────

sharingRoutes.get('/folders/:folderId/keys', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('folderId');
  const db = createDb(c.env.DB);

  // Must be either the folder owner or have a key
  const key = await db
    .select()
    .from(sharedFolderKeys)
    .where(and(eq(sharedFolderKeys.folderId, folderId), eq(sharedFolderKeys.userId, userId)))
    .get();

  if (!key) return c.json({ error: 'No key found for this folder' }, 404);

  return c.json({
    folderId: key.folderId,
    encryptedFolderKey: key.encryptedFolderKey,
    grantedBy: key.grantedBy,
    grantedAt: key.grantedAt,
  });
});

// ─── POST /folders/:folderId/keys — Add member key ───────────────────────────

sharingRoutes.post('/folders/:folderId/keys', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('folderId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { targetUserId, encryptedFolderKey } = body as Record<string, unknown>;
  if (
    !targetUserId ||
    !encryptedFolderKey ||
    typeof targetUserId !== 'string' ||
    typeof encryptedFolderKey !== 'string'
  ) {
    return c.json({ error: 'Missing required fields: targetUserId, encryptedFolderKey' }, 400);
  }

  const db = createDb(c.env.DB);

  // Verify the granter has a key for this folder (can only grant if you have access)
  const granterKey = await db
    .select()
    .from(sharedFolderKeys)
    .where(and(eq(sharedFolderKeys.folderId, folderId), eq(sharedFolderKeys.userId, userId)))
    .get();

  // Also allow folder owner
  const folder = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .get();

  if (!granterKey && !folder) {
    return c.json({ error: 'No permission to grant keys for this folder' }, 403);
  }

  // Verify target user belongs to a team this folder is shared with (or owns the folder)
  const targetTeamAccess = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .innerJoin(sharedFolders, and(
      eq(sharedFolders.teamId, teamMembers.teamId),
      eq(sharedFolders.folderId, folderId)
    ))
    .where(eq(teamMembers.userId, targetUserId))
    .get();

  const isTargetFolderOwner = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, targetUserId)))
    .get();

  if (!targetTeamAccess && !isTargetFolderOwner) {
    return c.json({ error: 'Target user is not a member of any team this folder is shared with' }, 403);
  }


  // Upsert key for target user
  const existing = await db
    .select()
    .from(sharedFolderKeys)
    .where(and(eq(sharedFolderKeys.folderId, folderId), eq(sharedFolderKeys.userId, targetUserId)))
    .get();

  if (existing) {
    await db
      .update(sharedFolderKeys)
      .set({ encryptedFolderKey, grantedBy: userId })
      .where(
        and(eq(sharedFolderKeys.folderId, folderId), eq(sharedFolderKeys.userId, targetUserId))
      );
  } else {
    await db.insert(sharedFolderKeys).values({
      folderId,
      userId: targetUserId,
      encryptedFolderKey,
      grantedBy: userId,
    });
  }

  return c.json({ success: true }, existing ? 200 : 201);
});

// ─── DELETE /folders/:folderId/keys/:userId — Remove key ─────────────────────

sharingRoutes.delete('/folders/:folderId/keys/:userId', async (c) => {
  const currentUserId = c.get('userId');
  const folderId = c.req.param('folderId');
  const targetUserId = c.req.param('userId');
  const db = createDb(c.env.DB);

  // Only folder owner can remove keys
  const folder = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, currentUserId)))
    .get();

  if (!folder) return c.json({ error: 'Only the folder owner can remove keys' }, 403);

  await db
    .delete(sharedFolderKeys)
    .where(and(eq(sharedFolderKeys.folderId, folderId), eq(sharedFolderKeys.userId, targetUserId)));

  return c.json({ success: true });
});

// ─── GET /folders — List shared folders ──────────────────────────────────────

sharingRoutes.get('/folders', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  // Folders shared with teams the user is a member of
  const shared = await db
    .select({
      folderId: sharedFolders.folderId,
      teamId: sharedFolders.teamId,
      ownerUserId: sharedFolders.ownerUserId,
      permissionLevel: sharedFolders.permissionLevel,
      folderName: folders.name,
      createdAt: sharedFolders.createdAt,
    })
    .from(sharedFolders)
    .innerJoin(folders, eq(folders.id, sharedFolders.folderId))
    .innerJoin(
      teamMembers,
      and(eq(teamMembers.teamId, sharedFolders.teamId), eq(teamMembers.userId, userId))
    );

  return c.json({ sharedFolders: shared });
});

// ─── GET /folders/:folderId/items — List items in shared folder ──────────────

sharingRoutes.get('/folders/:folderId/items', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('folderId');
  const db = createDb(c.env.DB);

  // Verify user has access (has a key for this folder)
  const key = await db
    .select()
    .from(sharedFolderKeys)
    .where(and(eq(sharedFolderKeys.folderId, folderId), eq(sharedFolderKeys.userId, userId)))
    .get();

  if (!key) return c.json({ error: 'No access to this shared folder' }, 403);

  const items = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.folderId, folderId), eq(vaultItems.deletedAt, '')));

  // If no deletedAt filter works (null check), get all and filter
  const allItems = await db.select().from(vaultItems).where(eq(vaultItems.folderId, folderId));

  const activeItems = allItems.filter((i) => !i.deletedAt);

  return c.json({ items: activeItems });
});
