import type { VaultItem, Folder } from '@lockbox/types';
/** Suggest tags for a vault item based on name and URIs. */
export declare function suggestTags(item: VaultItem): string[];
/** Suggest the best matching existing folder for an item. */
export declare function suggestFolder(item: VaultItem, folders: Folder[]): string | null;
/** Group of duplicate/similar vault items. */
export interface DuplicateGroup {
    items: VaultItem[];
    reason: 'same-uri' | 'same-credentials' | 'similar-name';
}
/** Detect duplicate or similar vault items. */
export declare function detectDuplicates(items: VaultItem[]): DuplicateGroup[];
//# sourceMappingURL=categorizer.d.ts.map