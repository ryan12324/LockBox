import { and, eq } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { attachments, vaultItemVersions } from '../db/schema.js';

type StorageBindings = {
  DB: D1Database;
  ATTACHMENTS: R2Bucket;
};

/** Remove every auxiliary object owned by one vault item. Idempotent by design. */
export async function purgeVaultItemStorage(
  env: StorageBindings,
  userId: string,
  itemId: string
): Promise<void> {
  const db = createDb(env.DB);
  const itemAttachments = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(and(eq(attachments.itemId, itemId), eq(attachments.userId, userId)));

  const objectKeys = [
    `docs/${userId}/${itemId}`,
    ...itemAttachments.map((attachment) => `${userId}/${itemId}/${attachment.id}`),
  ];
  await env.ATTACHMENTS.delete(objectKeys);

  await db
    .delete(attachments)
    .where(and(eq(attachments.itemId, itemId), eq(attachments.userId, userId)));
  await db
    .delete(vaultItemVersions)
    .where(and(eq(vaultItemVersions.itemId, itemId), eq(vaultItemVersions.userId, userId)));
}
