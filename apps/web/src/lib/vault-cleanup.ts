import type { CustomField, LoginItem, VaultItem } from '@lockbox/types';

export type CleanupField = 'name' | 'username' | 'password' | 'destination';

export interface CleanupIssue {
  field: CleanupField;
  label: string;
  message: string;
}

export interface CleanupCandidate {
  item: LoginItem;
  issues: CleanupIssue[];
}

export interface DuplicateLoginGroup {
  id: string;
  items: LoginItem[];
  reasons: string[];
}

export type MergeField = 'name' | 'username' | 'password' | 'totp' | 'folderId';
export type MergeSelections = Partial<Record<MergeField, string>>;

export interface LocalFolderSuggestion {
  folderName: string;
  reason: string;
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').normalize('NFKC').trim().toLocaleLowerCase();
}

export function normalizeLoginLocation(value: string): string | null {
  const input = value.trim();
  if (!input) return null;
  if (/^androidapp:\/\//i.test(input)) return input.toLocaleLowerCase().replace(/\/$/, '');

  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`);
    const hostname = url.hostname.toLocaleLowerCase().replace(/^www\./, '');
    return hostname || null;
  } catch {
    return normalizeText(input) || null;
  }
}

export function findCleanupCandidates(items: readonly VaultItem[]): CleanupCandidate[] {
  return items
    .filter((item): item is LoginItem => item.type === 'login')
    .map((item) => {
      const issues: CleanupIssue[] = [];
      if (!item.name.trim()) {
        issues.push({ field: 'name', label: 'Missing name', message: 'Give this login a clear name.' });
      }
      if (!item.username.trim()) {
        issues.push({
          field: 'username',
          label: 'Missing username',
          message: 'Add the email address or username used to sign in.',
        });
      }
      if (!item.password.trim()) {
        issues.push({
          field: 'password',
          label: 'Missing password',
          message: 'Add a password, or confirm that this account is passwordless.',
        });
      }
      if (!item.uris.some((uri) => normalizeLoginLocation(uri))) {
        issues.push({
          field: 'destination',
          label: 'Missing website or app',
          message: 'Add the website or Android app this login belongs to.',
        });
      }
      return { item, issues };
    })
    .filter((candidate) => candidate.issues.length > 0)
    .sort((left, right) => left.item.name.localeCompare(right.item.name));
}

function duplicateReasons(left: LoginItem, right: LoginItem): string[] {
  const leftLocations = new Set(left.uris.map(normalizeLoginLocation).filter(Boolean));
  const rightLocations = new Set(right.uris.map(normalizeLoginLocation).filter(Boolean));
  const sameDestination = [...leftLocations].some((location) => rightLocations.has(location));
  const sameUsername = Boolean(
    normalizeText(left.username) && normalizeText(left.username) === normalizeText(right.username)
  );
  const samePassword = Boolean(left.password && left.password === right.password);
  const sameName = Boolean(
    normalizeText(left.name) && normalizeText(left.name) === normalizeText(right.name)
  );

  const isCandidate =
    (sameDestination && (sameUsername || samePassword)) ||
    (sameUsername && samePassword) ||
    (sameDestination && sameName && (!left.username || !right.username));
  if (!isCandidate) return [];

  const reasons: string[] = [];
  if (sameDestination) reasons.push('same website or app');
  if (sameUsername) reasons.push('same username');
  if (samePassword) reasons.push('same password');
  if (sameName) reasons.push('same name');
  return reasons;
}

export function findDuplicateLoginGroups(items: readonly VaultItem[]): DuplicateLoginGroup[] {
  const logins = items.filter((item): item is LoginItem => item.type === 'login');
  const parent = logins.map((_, index) => index);
  const groupReasons = new Map<string, Set<string>>();

  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const join = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };

  for (let left = 0; left < logins.length; left += 1) {
    for (let right = left + 1; right < logins.length; right += 1) {
      const reasons = duplicateReasons(logins[left], logins[right]);
      if (reasons.length === 0) continue;
      join(left, right);
      groupReasons.set(
        [logins[left].id, logins[right].id].sort().join(':'),
        new Set(reasons)
      );
    }
  }

  const membersByRoot = new Map<number, LoginItem[]>();
  logins.forEach((login, index) => {
    const root = find(index);
    const members = membersByRoot.get(root) ?? [];
    members.push(login);
    membersByRoot.set(root, members);
  });

  return [...membersByRoot.values()]
    .filter((members) => members.length > 1)
    .map((members) => {
      const ids = new Set(members.map((member) => member.id));
      const reasons = new Set<string>();
      groupReasons.forEach((pairReasons, key) => {
        const [leftId, rightId] = key.split(':');
        if (ids.has(leftId) && ids.has(rightId)) pairReasons.forEach((reason) => reasons.add(reason));
      });
      return {
        id: members.map((member) => member.id).sort().join(':'),
        items: members.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
        reasons: [...reasons],
      };
    })
    .sort((left, right) => left.items[0].name.localeCompare(right.items[0].name));
}

function selectedValue(
  items: readonly LoginItem[],
  keeper: LoginItem,
  field: MergeField,
  selections: MergeSelections
): string {
  const selected = items.find((item) => item.id === selections[field]);
  const valueFor = (item: LoginItem): string => {
    if (field === 'folderId') return item.folderId ?? '';
    return item[field] ?? '';
  };
  return valueFor(selected ?? keeper) || items.map(valueFor).find(Boolean) || '';
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueUris(items: readonly LoginItem[]): string[] {
  const seen = new Set<string>();
  const uris: string[] = [];
  for (const uri of items.flatMap((item) => item.uris)) {
    const key = normalizeLoginLocation(uri) ?? normalizeText(uri);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uris.push(uri.trim());
  }
  return uris;
}

function uniqueCustomFields(items: readonly LoginItem[]): CustomField[] | undefined {
  const fields: CustomField[] = [];
  const seen = new Set<string>();
  for (const field of items.flatMap((item) => item.customFields ?? [])) {
    const key = `${normalizeText(field.name)}\u001f${field.type}\u001f${field.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fields.push(field);
  }
  return fields.length > 0 ? fields : undefined;
}

export function buildMergedLogin(
  items: readonly LoginItem[],
  keeperId: string,
  selections: MergeSelections = {},
  now = new Date().toISOString()
): LoginItem {
  if (items.length < 2) throw new Error('At least two logins are required to merge.');
  const keeper = items.find((item) => item.id === keeperId);
  if (!keeper) throw new Error('The login selected to keep is unavailable.');

  return {
    ...keeper,
    name: selectedValue(items, keeper, 'name', selections),
    username: selectedValue(items, keeper, 'username', selections),
    password: selectedValue(items, keeper, 'password', selections),
    totp: selectedValue(items, keeper, 'totp', selections) || undefined,
    folderId: selectedValue(items, keeper, 'folderId', selections) || undefined,
    uris: uniqueUris(items),
    tags: uniqueStrings(items.flatMap((item) => item.tags)),
    customFields: uniqueCustomFields(items),
    favorite: items.some((item) => item.favorite),
    createdAt: keeper.createdAt,
    updatedAt: now,
    revisionDate: now,
  };
}

const LOCAL_FOLDER_RULES: Array<{
  folderName: string;
  keywords: string[];
  reason: string;
}> = [
  { folderName: 'Finance', keywords: ['bank', 'paypal', 'wise', 'monzo', 'stripe'], reason: 'finance-related website' },
  { folderName: 'Shopping', keywords: ['amazon', 'ebay', 'etsy', 'shop', 'store'], reason: 'shopping website' },
  { folderName: 'Social', keywords: ['facebook', 'instagram', 'linkedin', 'reddit', 'discord', 'tiktok'], reason: 'social account' },
  { folderName: 'Work', keywords: ['github', 'gitlab', 'slack', 'jira', 'atlassian', 'notion', 'office'], reason: 'work-related service' },
  { folderName: 'Travel', keywords: ['airbnb', 'booking', 'hotel', 'airline', 'uber'], reason: 'travel service' },
  { folderName: 'Entertainment', keywords: ['netflix', 'spotify', 'steam', 'twitch', 'disney'], reason: 'entertainment service' },
];

export function getLocalFolderSuggestion(item: LoginItem): LocalFolderSuggestion | null {
  if (item.folderId) return null;
  const searchable = [item.name, ...item.uris.map((uri) => normalizeLoginLocation(uri) ?? uri)]
    .join(' ')
    .toLocaleLowerCase();
  const rule = LOCAL_FOLDER_RULES.find((candidate) =>
    candidate.keywords.some((keyword) => searchable.includes(keyword))
  );
  return rule ? { folderName: rule.folderName, reason: rule.reason } : null;
}
