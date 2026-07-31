/**
 * Folder sharing routes — share folders with teams, manage folder keys.
 * 7 endpoints total.
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { sharedFolders, sharedFolderKeys, teamMembers, folders, vaultItems } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { serializeVaultItem } from '../services/vault-serialization.js';

type Bindings = { DB: D1Database };
type Variables = { userId: string };

export const sharingRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const FOLDER_PERMISSIONS = new Set(['read_only', 'read_write']);

function isValidWrappedFolderKey(value: string): boolean {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) return false;
  try {
    return atob(value).length === 256;
  } catch {
    return false;
  }
}

async function hasLiveFolderAccess(
  db: ReturnType<typeof createDb>,
  folderId: string,
  userId: string
): Promise<boolean> {
  const ownedFolder = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .get();
  if (ownedFolder) return true;

  const membership = await db
    .select({ teamId: teamMembers.teamId })
    .from(sharedFolders)
    .innerJoin(
      teamMembers,
      and(eq(teamMembers.teamId, sharedFolders.teamId), eq(teamMembers.userId, userId))
    )
    .where(eq(sharedFolders.folderId, folderId))
    .get();
  return Boolean(membership);
}

sharingRoutes.use('*', authMiddleware);

// ─── POST /folders/:folderId/share — Share folder with team ──────────────────

sharingRoutes.post('/folders/:folderId/share', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('folderId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { teamId, permissionLevel, memberKeys } = body as Record<string, unknown>;
  if (!teamId || typeof teamId !== 'string') {
    return c.json({ error: 'Missing required field: teamId' }, 400);
  }
  const requestedPermission = permissionLevel ?? 'read_write';
  if (typeof requestedPermission !== 'string' || !FOLDER_PERMISSIONS.has(requestedPermission)) {
    return c.json({ error: 'permissionLevel must be read_only or read_write' }, 400);
  }
  if (!Array.isArray(memberKeys) || memberKeys.length === 0 || memberKeys.length > 500) {
    return c.json({ error: 'memberKeys must contain between 1 and 500 entries' }, 400);
  }
  const normalizedKeys: Array<{ userId: string; encryptedFolderKey: string }> = [];
  const seenUserIds = new Set<string>();
  for (const entry of memberKeys) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof (entry as Record<string, unknown>).userId !== 'string' ||
      typeof (entry as Record<string, unknown>).encryptedFolderKey !== 'string'
    ) {
      return c.json({ error: 'Each member key must include userId and encryptedFolderKey' }, 400);
    }
    const key = entry as { userId: string; encryptedFolderKey: string };
    if (!key.userId || !isValidWrappedFolderKey(key.encryptedFolderKey)) {
      return c.json({ error: 'Invalid member key' }, 400);
    }
    if (seenUserIds.has(key.userId)) return c.json({ error: 'Duplicate member key' }, 400);
    seenUserIds.add(key.userId);
    normalizedKeys.push(key);
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

  const teamMemberships = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId));
  const teamUserIds = new Set(teamMemberships.map((member) => member.userId));
  if (
    normalizedKeys.some((key) => !teamUserIds.has(key.userId)) ||
    !normalizedKeys.some((key) => key.userId === userId)
  ) {
    return c.json({ error: 'Member keys must cover valid team members and include the owner' }, 400);
  }

  // Check not already shared
  const existing = await db
    .select()
    .from(sharedFolders)
    .where(and(eq(sharedFolders.folderId, folderId), eq(sharedFolders.teamId, teamId)))
    .get();

  if (existing) return c.json({ error: 'Folder already shared with this team' }, 409);

  const previousKeys: Array<{
    userId: string;
    encryptedFolderKey: string;
    grantedBy: string;
  } | null> = [];
  for (const memberKey of normalizedKeys) {
    const previous = await db
      .select({
        userId: sharedFolderKeys.userId,
        encryptedFolderKey: sharedFolderKeys.encryptedFolderKey,
        grantedBy: sharedFolderKeys.grantedBy,
      })
      .from(sharedFolderKeys)
      .where(
        and(
          eq(sharedFolderKeys.folderId, folderId),
          eq(sharedFolderKeys.userId, memberKey.userId)
        )
      )
      .get();
    previousKeys.push(previous ?? null);
  }

  await db.insert(sharedFolders).values({
    folderId,
    teamId,
    ownerUserId: userId,
    permissionLevel: requestedPermission,
  });

  try {
    for (const [index, memberKey] of normalizedKeys.entries()) {
      const existingKey = previousKeys[index];
      if (existingKey) {
        await db
          .update(sharedFolderKeys)
          .set({ encryptedFolderKey: memberKey.encryptedFolderKey, grantedBy: userId })
          .where(
            and(
              eq(sharedFolderKeys.folderId, folderId),
              eq(sharedFolderKeys.userId, memberKey.userId)
            )
          );
      } else {
        await db.insert(sharedFolderKeys).values({
          folderId,
          userId: memberKey.userId,
          encryptedFolderKey: memberKey.encryptedFolderKey,
          grantedBy: userId,
        });
      }
    }
  } catch (error) {
    for (const [index, memberKey] of normalizedKeys.entries()) {
      const previous = previousKeys[index];
      if (previous) {
        await db
          .update(sharedFolderKeys)
          .set({
            encryptedFolderKey: previous.encryptedFolderKey,
            grantedBy: previous.grantedBy,
          })
          .where(
            and(
              eq(sharedFolderKeys.folderId, folderId),
              eq(sharedFolderKeys.userId, memberKey.userId)
            )
          );
      } else {
        await db
          .delete(sharedFolderKeys)
          .where(
            and(
              eq(sharedFolderKeys.folderId, folderId),
              eq(sharedFolderKeys.userId, memberKey.userId)
            )
          );
      }
    }
    await db
      .delete(sharedFolders)
      .where(and(eq(sharedFolders.folderId, folderId), eq(sharedFolders.teamId, teamId)));
    throw error;
  }

  return c.json({ success: true, folderId, teamId }, 201);
});

// ─── DELETE /folders/:folderId/unshare — Unshare folder ──────────────────────

sharingRoutes.delete('/folders/:folderId/unshare', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('folderId');
  const teamId = c.req.query('teamId');
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

  await db
    .delete(sharedFolders)
    .where(and(eq(sharedFolders.folderId, folderId), eq(sharedFolders.teamId, teamId)));

  // Revoke keys only for users who no longer belong to any team with access.
  const keys = await db.select().from(sharedFolderKeys).where(eq(sharedFolderKeys.folderId, folderId));
  for (const key of keys) {
    const remainingAccess = await db
      .select({ teamId: sharedFolders.teamId })
      .from(sharedFolders)
      .innerJoin(
        teamMembers,
        and(
          eq(teamMembers.teamId, sharedFolders.teamId),
          eq(teamMembers.userId, key.userId)
        )
      )
      .where(eq(sharedFolders.folderId, folderId))
      .get();
    if (!remainingAccess && key.userId !== share.ownerUserId) {
      await db
        .delete(sharedFolderKeys)
        .where(
          and(eq(sharedFolderKeys.folderId, folderId), eq(sharedFolderKeys.userId, key.userId))
        );
    }
  }

  return c.json({ success: true });
});

// ─── GET /folders/:folderId/keys — Get folder keys ───────────────────────────

sharingRoutes.get('/folders/:folderId/keys', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('folderId');
  const db = createDb(c.env.DB);

  if (!(await hasLiveFolderAccess(db, folderId, userId))) {
    return c.json({ error: 'No access to this shared folder' }, 403);
  }

  const key = await db
    .select()
    .from(sharedFolderKeys)
    .where(and(eq(sharedFolderKeys.folderId, folderId), eq(sharedFolderKeys.userId, userId)))
    .get();

  if (!key) return c.json({ error: 'No key found for this folder' }, 404);

  return c.json({ key });
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
  if (!isValidWrappedFolderKey(encryptedFolderKey)) {
    return c.json({ error: 'Invalid encryptedFolderKey' }, 400);
  }

  const db = createDb(c.env.DB);

  if (!(await hasLiveFolderAccess(db, folderId, userId))) {
    return c.json({ error: 'No permission to grant keys for this folder' }, 403);
  }

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

  if (!(await hasLiveFolderAccess(db, folderId, userId))) {
    return c.json({ error: 'No access to this shared folder' }, 403);
  }

  const key = await db
    .select()
    .from(sharedFolderKeys)
    .where(and(eq(sharedFolderKeys.folderId, folderId), eq(sharedFolderKeys.userId, userId)))
    .get();

  if (!key) return c.json({ error: 'No access to this shared folder' }, 403);

  const allItems = await db.select().from(vaultItems).where(eq(vaultItems.folderId, folderId));

  const activeItems = allItems.filter((i) => !i.deletedAt);

  return c.json({ items: activeItems.map(serializeVaultItem) });
});
