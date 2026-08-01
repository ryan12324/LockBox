import type { Folder, VaultItem, VaultItemType } from '@lockbox/types';
import type {
  DuplicateStrategy,
  ImportDuplicate,
  ImportRecord,
  LegacyLastPassSecureNoteRepair,
} from '@lockbox/importers';

export interface ImportCreateItemBody {
  id: string;
  type: VaultItemType;
  encryptedData: string;
  folderId?: string;
  tags: string[];
  favorite: boolean;
  revisionDate: string;
}

export interface ImportWorkflowDependencies {
  encryptItem(item: VaultItem, itemId: string, revisionDate: string): Promise<string>;
  createItem(body: ImportCreateItemBody): Promise<unknown>;
  createFolder(body: { name: string; parentId: string | null }): Promise<{ folder: Folder }>;
  deleteItem?(id: string): Promise<unknown>;
}

export interface ImportFailure {
  sourceId: string;
  sourceRow: number;
  itemName: string;
  message: string;
}

export interface ImportWorkflowResult {
  importedCount: number;
  duplicateSkippedCount: number;
  ignoredCount: number;
  legacyRepairedCount: number;
  createdFolders: Folder[];
  failures: ImportFailure[];
  cleanupFailures: ImportFailure[];
}

export interface RunEncryptedImportOptions extends ImportWorkflowDependencies {
  records: readonly ImportRecord[];
  selectedSourceIds: ReadonlySet<string>;
  duplicates: readonly ImportDuplicate[];
  legacyRepairs?: readonly LegacyLastPassSecureNoteRepair[];
  duplicateStrategy: DuplicateStrategy;
  existingFolders: readonly Folder[];
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
}

function normalizedFolderName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

function folderKey(parentId: string | undefined, name: string): string {
  return `${parentId ?? '<root>'}\u001f${normalizedFolderName(name)}`;
}

function pathKey(path: readonly string[]): string {
  return path.map(normalizedFolderName).join('\u001f');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown import error';
}

async function mapWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(values[index]);
    }
  });
  await Promise.all(runners);
}

/**
 * Imports selected records while ensuring plaintext only reaches the caller-supplied
 * encryption function. The create-item dependency receives ciphertext and metadata.
 */
export async function runEncryptedImport(
  options: RunEncryptedImportOptions,
): Promise<ImportWorkflowResult> {
  const duplicateIds = new Set(options.duplicates.map((duplicate) => duplicate.sourceId));
  const legacyRepairBySourceId = new Map(
    (options.legacyRepairs ?? []).map((repair) => [repair.sourceId, repair.existingItemId]),
  );
  const selected = options.records.filter(
    (record) => record.importable && options.selectedSourceIds.has(record.sourceId),
  );
  const duplicateSkippedCount =
    options.duplicateStrategy === 'skip'
      ? selected.filter((record) => duplicateIds.has(record.sourceId)).length
      : 0;
  const candidates = selected.filter(
    (record) => options.duplicateStrategy === 'keep-both' || !duplicateIds.has(record.sourceId),
  );
  const ignoredCount = options.records.length - candidates.length - duplicateSkippedCount;
  const createdFolders: Folder[] = [];
  const foldersByParentAndName = new Map<string, Folder>();
  for (const folder of options.existingFolders) {
    foldersByParentAndName.set(folderKey(folder.parentId, folder.name), folder);
  }

  const folderIdByPath = new Map<string, string>();
  const folderErrorByPath = new Map<string, string>();
  const uniquePaths = new Map<string, string[]>();
  for (const candidate of candidates) {
    if (candidate.folderPath.length > 0) {
      uniquePaths.set(pathKey(candidate.folderPath), candidate.folderPath);
    }
  }

  for (const [key, path] of uniquePaths) {
    let parentId: string | undefined;
    try {
      for (const name of path) {
        const existing = foldersByParentAndName.get(folderKey(parentId, name));
        if (existing) {
          parentId = existing.id;
          continue;
        }
        const response = await options.createFolder({ name, parentId: parentId ?? null });
        if (!response.folder?.id) throw new Error('The server did not return the created folder.');
        foldersByParentAndName.set(folderKey(parentId, name), response.folder);
        createdFolders.push(response.folder);
        parentId = response.folder.id;
      }
      if (parentId) folderIdByPath.set(key, parentId);
    } catch (error) {
      folderErrorByPath.set(key, errorMessage(error));
    }
  }

  let importedCount = 0;
  let legacyRepairedCount = 0;
  let completed = 0;
  const failures: ImportFailure[] = [];
  const cleanupFailures: ImportFailure[] = [];
  const total = candidates.length;
  options.onProgress?.(0, total);

  await mapWithConcurrency(candidates, Math.max(1, options.concurrency ?? 4), async (record) => {
    const folderFailure = folderErrorByPath.get(pathKey(record.folderPath));
    if (folderFailure) {
      failures.push({
        sourceId: record.sourceId,
        sourceRow: record.sourceRow,
        itemName: record.item.name,
        message: `Folder could not be created: ${folderFailure}`,
      });
    } else {
      try {
        const folderId = folderIdByPath.get(pathKey(record.folderPath));
        const revisionDate = record.item.revisionDate || new Date().toISOString();
        const item = { ...record.item, folderId, revisionDate } as VaultItem;
        const encryptedData = await options.encryptItem(item, item.id, revisionDate);
        await options.createItem({
          id: item.id,
          type: item.type,
          encryptedData,
          folderId,
          tags: item.tags,
          favorite: item.favorite,
          revisionDate,
        });
        importedCount += 1;
        const legacyItemId = legacyRepairBySourceId.get(record.sourceId);
        if (legacyItemId) {
          try {
            if (!options.deleteItem) throw new Error('Legacy cleanup is unavailable.');
            await options.deleteItem(legacyItemId);
            legacyRepairedCount += 1;
          } catch (error) {
            cleanupFailures.push({
              sourceId: record.sourceId,
              sourceRow: record.sourceRow,
              itemName: record.item.name,
              message: `The recovered note was imported, but the broken copy could not be moved to Trash: ${errorMessage(error)}`,
            });
          }
        }
      } catch (error) {
        failures.push({
          sourceId: record.sourceId,
          sourceRow: record.sourceRow,
          itemName: record.item.name,
          message: errorMessage(error),
        });
      }
    }
    completed += 1;
    options.onProgress?.(completed, total);
  });

  return {
    importedCount,
    duplicateSkippedCount,
    ignoredCount,
    legacyRepairedCount,
    createdFolders,
    failures: failures.sort((left, right) => left.sourceRow - right.sourceRow),
    cleanupFailures: cleanupFailures.sort((left, right) => left.sourceRow - right.sourceRow),
  };
}
