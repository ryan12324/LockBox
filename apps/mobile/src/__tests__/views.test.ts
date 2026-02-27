/**
 * Tests for views module — vault list, identity detail, custom fields, and trash.
 */

import { describe, it, expect } from 'vitest';
import {
  getItemIcon,
  getItemSubtitle,
  buildIdentityName,
  toVaultListItem,
  processVaultList,
  type DecryptedItemData,
} from '../views/vault-list';
import {
  getIdentitySections,
  identityFieldKeys,
  createEmptyIdentityForm,
  extractIdentityFormData,
  maskSensitiveValue,
  hasIdentityData,
  getIdentitySummary,
} from '../views/identity-detail';
import {
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  createCustomField,
  addCustomField,
  removeCustomField,
  updateCustomField,
  updateCustomFieldName,
  updateCustomFieldValue,
  updateCustomFieldType,
  toggleBooleanField,
  validateCustomFields,
  cleanCustomFields,
  maskHiddenValue,
  isFieldMasked,
  parseBooleanValue,
} from '../views/custom-fields';
import {
  TRASH_RETENTION_DAYS,
  formatDaysRemaining,
  isUrgentDeletion,
  toTrashListItem,
  processTrashList,
  calculateDaysRemaining,
  formatDeletedDate,
  groupTrashByType,
  getTrashSummary,
  type TrashItem,
} from '../views/trash';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeDecryptedItem(overrides: Partial<DecryptedItemData> = {}): DecryptedItemData {
  return {
    id: 'item-1',
    name: 'Test Item',
    type: 'login',
    favorite: false,
    tags: [],
    ...overrides,
  };
}

function makeTrashItem(overrides: Partial<TrashItem> = {}): TrashItem {
  return {
    id: 'trash-1',
    name: 'Deleted Item',
    type: 'login',
    deletedAt: '2025-02-01T00:00:00.000Z',
    daysRemaining: 15,
    encryptedData: 'encrypted-blob',
    tags: [],
    favorite: false,
    ...overrides,
  };
}

// ─── getItemIcon ──────────────────────────────────────────────────────────────

describe('getItemIcon', () => {
  it('returns globe for login items', () => {
    expect(getItemIcon('login')).toBe('globe');
  });

  it('returns sticky-note for note items', () => {
    expect(getItemIcon('note')).toBe('sticky-note');
  });

  it('returns credit-card for card items', () => {
    expect(getItemIcon('card')).toBe('credit-card');
  });

  it('returns id-card for identity items', () => {
    expect(getItemIcon('identity')).toBe('id-card');
  });
});

// ─── getItemSubtitle ──────────────────────────────────────────────────────────

describe('getItemSubtitle', () => {
  it('returns username for login items', () => {
    const item = makeDecryptedItem({ type: 'login', username: 'user@example.com' });
    expect(getItemSubtitle(item)).toBe('user@example.com');
  });

  it('returns first URI when no username for login items', () => {
    const item = makeDecryptedItem({ type: 'login', uris: ['https://example.com'] });
    expect(getItemSubtitle(item)).toBe('https://example.com');
  });

  it('returns empty string for login items with no username or URIs', () => {
    const item = makeDecryptedItem({ type: 'login' });
    expect(getItemSubtitle(item)).toBe('');
  });

  it('returns truncated content for note items', () => {
    const longContent = 'A'.repeat(100);
    const item = makeDecryptedItem({ type: 'note', content: longContent });
    const subtitle = getItemSubtitle(item);
    expect(subtitle).toHaveLength(51); // 50 chars + ellipsis
    expect(subtitle.endsWith('…')).toBe(true);
  });

  it('returns full content for short note items', () => {
    const item = makeDecryptedItem({ type: 'note', content: 'Short note' });
    expect(getItemSubtitle(item)).toBe('Short note');
  });

  it('returns brand and masked number for card items', () => {
    const item = makeDecryptedItem({
      type: 'card',
      brand: 'Visa',
      number: '4111111111111111',
    });
    expect(getItemSubtitle(item)).toBe('Visa ••••1111');
  });

  it('returns masked number without brand for card items', () => {
    const item = makeDecryptedItem({ type: 'card', number: '5500000000000004' });
    expect(getItemSubtitle(item)).toBe('••••0004');
  });

  it('returns first+last name for identity items', () => {
    const item = makeDecryptedItem({
      type: 'identity',
      firstName: 'John',
      lastName: 'Doe',
    });
    expect(getItemSubtitle(item)).toBe('John Doe');
  });

  it('returns email when no name for identity items', () => {
    const item = makeDecryptedItem({
      type: 'identity',
      email: 'john@example.com',
    });
    expect(getItemSubtitle(item)).toBe('john@example.com');
  });

  it('returns company when no name or email for identity items', () => {
    const item = makeDecryptedItem({
      type: 'identity',
      company: 'Acme Inc',
    });
    expect(getItemSubtitle(item)).toBe('Acme Inc');
  });

  it('returns full name with middle name for identity items', () => {
    const item = makeDecryptedItem({
      type: 'identity',
      firstName: 'John',
      middleName: 'Michael',
      lastName: 'Doe',
    });
    expect(getItemSubtitle(item)).toBe('John Michael Doe');
  });
});

// ─── buildIdentityName ────────────────────────────────────────────────────────

describe('buildIdentityName', () => {
  it('builds full name from all parts', () => {
    expect(buildIdentityName('John', 'Michael', 'Doe')).toBe('John Michael Doe');
  });

  it('builds name without middle name', () => {
    expect(buildIdentityName('John', undefined, 'Doe')).toBe('John Doe');
  });

  it('returns empty string when all parts are undefined', () => {
    expect(buildIdentityName(undefined, undefined, undefined)).toBe('');
  });

  it('returns first name only', () => {
    expect(buildIdentityName('John', undefined, undefined)).toBe('John');
  });
});

// ─── toVaultListItem ──────────────────────────────────────────────────────────

describe('toVaultListItem', () => {
  it('converts login item to VaultListItem', () => {
    const item = makeDecryptedItem({ username: 'user@test.com' });
    const result = toVaultListItem(item);
    expect(result.icon).toBe('globe');
    expect(result.subtitle).toBe('user@test.com');
    expect(result.id).toBe('item-1');
  });

  it('converts identity item to VaultListItem', () => {
    const item = makeDecryptedItem({
      type: 'identity',
      firstName: 'Jane',
      lastName: 'Smith',
    });
    const result = toVaultListItem(item);
    expect(result.icon).toBe('id-card');
    expect(result.subtitle).toBe('Jane Smith');
  });
});

// ─── processVaultList ─────────────────────────────────────────────────────────

describe('processVaultList', () => {
  it('processes all items without filter', () => {
    const items = [
      makeDecryptedItem({ id: '1', type: 'login' }),
      makeDecryptedItem({ id: '2', type: 'identity', firstName: 'Bob' }),
      makeDecryptedItem({ id: '3', type: 'card', number: '1234' }),
    ];
    const result = processVaultList(items);
    expect(result).toHaveLength(3);
  });

  it('filters by type when specified', () => {
    const items = [
      makeDecryptedItem({ id: '1', type: 'login' }),
      makeDecryptedItem({ id: '2', type: 'identity' }),
      makeDecryptedItem({ id: '3', type: 'login' }),
    ];
    const result = processVaultList(items, 'identity');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('identity');
  });

  it('returns empty array for no items', () => {
    expect(processVaultList([])).toHaveLength(0);
  });
});

// ─── Identity Detail ──────────────────────────────────────────────────────────

describe('getIdentitySections', () => {
  it('returns 4 sections', () => {
    const sections = getIdentitySections();
    expect(sections).toHaveLength(4);
  });

  it('has correct section titles', () => {
    const sections = getIdentitySections();
    expect(sections.map((s) => s.title)).toEqual(['Personal', 'Address', 'Company', 'IDs']);
  });

  it('Personal section has 5 fields', () => {
    const sections = getIdentitySections();
    expect(sections[0].fields).toHaveLength(5);
  });

  it('Address section has 6 fields', () => {
    const sections = getIdentitySections();
    expect(sections[1].fields).toHaveLength(6);
  });

  it('Company section has 1 field', () => {
    const sections = getIdentitySections();
    expect(sections[2].fields).toHaveLength(1);
  });

  it('IDs section has 3 fields', () => {
    const sections = getIdentitySections();
    expect(sections[3].fields).toHaveLength(3);
  });

  it('SSN field is marked as masked', () => {
    const sections = getIdentitySections();
    const ssnField = sections[3].fields.find((f) => f.key === 'ssn');
    expect(ssnField).toBeDefined();
    expect(ssnField?.masked).toBe(true);
  });
});

describe('identityFieldKeys', () => {
  it('contains 15 fields', () => {
    expect(identityFieldKeys).toHaveLength(15);
  });

  it('includes all expected keys', () => {
    expect(identityFieldKeys).toContain('firstName');
    expect(identityFieldKeys).toContain('ssn');
    expect(identityFieldKeys).toContain('licenseNumber');
  });
});

describe('createEmptyIdentityForm', () => {
  it('creates form with all empty strings', () => {
    const form = createEmptyIdentityForm();
    expect(form.firstName).toBe('');
    expect(form.ssn).toBe('');
    expect(form.country).toBe('');
  });
});

describe('extractIdentityFormData', () => {
  it('extracts known fields from raw object', () => {
    const raw = { firstName: 'John', lastName: 'Doe', extra: 'ignored' };
    const form = extractIdentityFormData(raw);
    expect(form.firstName).toBe('John');
    expect(form.lastName).toBe('Doe');
  });

  it('handles missing fields', () => {
    const form = extractIdentityFormData({});
    expect(form.firstName).toBe('');
    expect(form.email).toBe('');
  });

  it('ignores non-string values', () => {
    const raw = { firstName: 123, lastName: 'Valid' };
    const form = extractIdentityFormData(raw);
    expect(form.firstName).toBe('');
    expect(form.lastName).toBe('Valid');
  });
});

describe('maskSensitiveValue', () => {
  it('masks long values showing last 4 chars', () => {
    expect(maskSensitiveValue('123-45-6789')).toBe('•••••••6789');
  });

  it('returns bullets for short values', () => {
    expect(maskSensitiveValue('123')).toBe('••••');
  });

  it('returns empty string for empty value', () => {
    expect(maskSensitiveValue('')).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(maskSensitiveValue(undefined)).toBe('');
  });
});

describe('hasIdentityData', () => {
  it('returns false for empty form', () => {
    expect(hasIdentityData(createEmptyIdentityForm())).toBe(false);
  });

  it('returns true when any field has data', () => {
    const form = createEmptyIdentityForm();
    form.email = 'test@example.com';
    expect(hasIdentityData(form)).toBe(true);
  });
});

describe('getIdentitySummary', () => {
  it('returns name when available', () => {
    const form = { ...createEmptyIdentityForm(), firstName: 'John', lastName: 'Doe' };
    expect(getIdentitySummary(form)).toBe('John Doe');
  });

  it('returns email when no name', () => {
    const form = { ...createEmptyIdentityForm(), email: 'test@test.com' };
    expect(getIdentitySummary(form)).toBe('test@test.com');
  });

  it('returns company when no name or email', () => {
    const form = { ...createEmptyIdentityForm(), company: 'Acme' };
    expect(getIdentitySummary(form)).toBe('Acme');
  });

  it('returns "Empty identity" when no data', () => {
    expect(getIdentitySummary(createEmptyIdentityForm())).toBe('Empty identity');
  });
});

// ─── Custom Fields ────────────────────────────────────────────────────────────

describe('CUSTOM_FIELD_TYPES', () => {
  it('contains 3 types', () => {
    expect(CUSTOM_FIELD_TYPES).toHaveLength(3);
    expect(CUSTOM_FIELD_TYPES).toContain('text');
    expect(CUSTOM_FIELD_TYPES).toContain('hidden');
    expect(CUSTOM_FIELD_TYPES).toContain('boolean');
  });
});

describe('CUSTOM_FIELD_TYPE_LABELS', () => {
  it('has labels for all types', () => {
    expect(CUSTOM_FIELD_TYPE_LABELS.text).toBe('Text');
    expect(CUSTOM_FIELD_TYPE_LABELS.hidden).toBe('Hidden');
    expect(CUSTOM_FIELD_TYPE_LABELS.boolean).toBe('Boolean');
  });
});

describe('createCustomField', () => {
  it('creates text field by default', () => {
    const field = createCustomField();
    expect(field.type).toBe('text');
    expect(field.name).toBe('');
    expect(field.value).toBe('');
  });

  it('creates hidden field', () => {
    const field = createCustomField('hidden');
    expect(field.type).toBe('hidden');
    expect(field.value).toBe('');
  });

  it('creates boolean field with false default', () => {
    const field = createCustomField('boolean');
    expect(field.type).toBe('boolean');
    expect(field.value).toBe('false');
  });
});

describe('addCustomField', () => {
  it('adds a field to empty array', () => {
    const result = addCustomField([]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('text');
  });

  it('adds a field with specified type', () => {
    const result = addCustomField([], 'boolean');
    expect(result[0].type).toBe('boolean');
  });

  it('preserves existing fields', () => {
    const existing = [createCustomField()];
    const result = addCustomField(existing);
    expect(result).toHaveLength(2);
  });
});

describe('removeCustomField', () => {
  it('removes field at index', () => {
    const fields = [
      { name: 'a', value: '1', type: 'text' as const },
      { name: 'b', value: '2', type: 'text' as const },
    ];
    const result = removeCustomField(fields, 0);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('b');
  });

  it('returns copy for out-of-bounds index', () => {
    const fields = [{ name: 'a', value: '1', type: 'text' as const }];
    const result = removeCustomField(fields, 5);
    expect(result).toHaveLength(1);
  });

  it('handles negative index', () => {
    const fields = [{ name: 'a', value: '1', type: 'text' as const }];
    const result = removeCustomField(fields, -1);
    expect(result).toHaveLength(1);
  });
});

describe('updateCustomField', () => {
  it('updates field at index', () => {
    const fields = [{ name: 'a', value: '1', type: 'text' as const }];
    const result = updateCustomField(fields, 0, { name: 'b' });
    expect(result[0].name).toBe('b');
    expect(result[0].value).toBe('1');
  });

  it('returns copy for out-of-bounds index', () => {
    const fields = [{ name: 'a', value: '1', type: 'text' as const }];
    const result = updateCustomField(fields, 5, { name: 'b' });
    expect(result[0].name).toBe('a');
  });
});

describe('updateCustomFieldName', () => {
  it('updates only the name', () => {
    const fields = [{ name: 'a', value: '1', type: 'text' as const }];
    const result = updateCustomFieldName(fields, 0, 'newname');
    expect(result[0].name).toBe('newname');
    expect(result[0].value).toBe('1');
  });
});

describe('updateCustomFieldValue', () => {
  it('updates only the value', () => {
    const fields = [{ name: 'a', value: '1', type: 'text' as const }];
    const result = updateCustomFieldValue(fields, 0, 'newval');
    expect(result[0].value).toBe('newval');
    expect(result[0].name).toBe('a');
  });
});

describe('updateCustomFieldType', () => {
  it('resets value to false when switching to boolean', () => {
    const fields = [{ name: 'a', value: 'hello', type: 'text' as const }];
    const result = updateCustomFieldType(fields, 0, 'boolean');
    expect(result[0].type).toBe('boolean');
    expect(result[0].value).toBe('false');
  });

  it('resets value to empty when switching from boolean', () => {
    const fields = [{ name: 'a', value: 'true', type: 'boolean' as const }];
    const result = updateCustomFieldType(fields, 0, 'text');
    expect(result[0].type).toBe('text');
    expect(result[0].value).toBe('');
  });

  it('preserves value when switching between text and hidden', () => {
    const fields = [{ name: 'a', value: 'secret', type: 'text' as const }];
    const result = updateCustomFieldType(fields, 0, 'hidden');
    expect(result[0].value).toBe('secret');
  });
});

describe('toggleBooleanField', () => {
  it('toggles from false to true', () => {
    const fields = [{ name: 'a', value: 'false', type: 'boolean' as const }];
    const result = toggleBooleanField(fields, 0);
    expect(result[0].value).toBe('true');
  });

  it('toggles from true to false', () => {
    const fields = [{ name: 'a', value: 'true', type: 'boolean' as const }];
    const result = toggleBooleanField(fields, 0);
    expect(result[0].value).toBe('false');
  });

  it('does nothing for non-boolean fields', () => {
    const fields = [{ name: 'a', value: 'hello', type: 'text' as const }];
    const result = toggleBooleanField(fields, 0);
    expect(result[0].value).toBe('hello');
  });
});

describe('validateCustomFields', () => {
  it('returns no errors for valid fields', () => {
    const fields = [{ name: 'key', value: 'val', type: 'text' as const }];
    expect(validateCustomFields(fields)).toHaveLength(0);
  });

  it('returns error for field with value but no name', () => {
    const fields = [{ name: '', value: 'val', type: 'text' as const }];
    const errors = validateCustomFields(fields);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('name is required');
  });

  it('allows empty name and empty value', () => {
    const fields = [{ name: '', value: '', type: 'text' as const }];
    expect(validateCustomFields(fields)).toHaveLength(0);
  });
});

describe('cleanCustomFields', () => {
  it('removes fields with both empty name and value', () => {
    const fields = [
      { name: 'keep', value: '', type: 'text' as const },
      { name: '', value: '', type: 'text' as const },
      { name: '', value: 'keep', type: 'text' as const },
    ];
    const result = cleanCustomFields(fields);
    expect(result).toHaveLength(2);
  });
});

describe('maskHiddenValue', () => {
  it('returns bullets for non-empty value', () => {
    expect(maskHiddenValue('secret')).toBe('••••••••');
  });

  it('returns bullets for empty value', () => {
    expect(maskHiddenValue('')).toBe('••••••••');
  });

  it('uses at least 8 bullets', () => {
    expect(maskHiddenValue('ab').length).toBe(8);
  });

  it('matches length for long values', () => {
    const value = 'a'.repeat(20);
    expect(maskHiddenValue(value).length).toBe(20);
  });
});

describe('isFieldMasked', () => {
  it('returns true for hidden fields', () => {
    expect(isFieldMasked({ name: 'a', value: 'b', type: 'hidden' })).toBe(true);
  });

  it('returns false for text fields', () => {
    expect(isFieldMasked({ name: 'a', value: 'b', type: 'text' })).toBe(false);
  });

  it('returns false for boolean fields', () => {
    expect(isFieldMasked({ name: 'a', value: 'true', type: 'boolean' })).toBe(false);
  });
});

describe('parseBooleanValue', () => {
  it('returns true for "true"', () => {
    expect(parseBooleanValue('true')).toBe(true);
  });

  it('returns false for "false"', () => {
    expect(parseBooleanValue('false')).toBe(false);
  });

  it('returns false for other strings', () => {
    expect(parseBooleanValue('yes')).toBe(false);
  });
});

// ─── Trash View ───────────────────────────────────────────────────────────────

describe('TRASH_RETENTION_DAYS', () => {
  it('is 30 days', () => {
    expect(TRASH_RETENTION_DAYS).toBe(30);
  });
});

describe('formatDaysRemaining', () => {
  it('returns "Deleting today" for 0 days', () => {
    expect(formatDaysRemaining(0)).toBe('Deleting today');
  });

  it('returns "1 day remaining" for 1 day', () => {
    expect(formatDaysRemaining(1)).toBe('1 day remaining');
  });

  it('returns "N days remaining" for N > 1', () => {
    expect(formatDaysRemaining(15)).toBe('15 days remaining');
  });

  it('returns "Deleting today" for negative days', () => {
    expect(formatDaysRemaining(-1)).toBe('Deleting today');
  });
});

describe('isUrgentDeletion', () => {
  it('returns true for 0 days', () => {
    expect(isUrgentDeletion(0)).toBe(true);
  });

  it('returns true for 3 days', () => {
    expect(isUrgentDeletion(3)).toBe(true);
  });

  it('returns false for 4 days', () => {
    expect(isUrgentDeletion(4)).toBe(false);
  });
});

describe('toTrashListItem', () => {
  it('converts TrashItem to TrashListItem', () => {
    const item = makeTrashItem({ daysRemaining: 5 });
    const result = toTrashListItem(item);
    expect(result.countdownLabel).toBe('5 days remaining');
    expect(result.isUrgent).toBe(false);
  });

  it('marks urgent items', () => {
    const item = makeTrashItem({ daysRemaining: 2 });
    const result = toTrashListItem(item);
    expect(result.isUrgent).toBe(true);
  });
});

describe('processTrashList', () => {
  it('sorts by daysRemaining ascending', () => {
    const items = [
      makeTrashItem({ id: 'a', daysRemaining: 20 }),
      makeTrashItem({ id: 'b', daysRemaining: 5 }),
      makeTrashItem({ id: 'c', daysRemaining: 1 }),
    ];
    const result = processTrashList(items);
    expect(result[0].id).toBe('c');
    expect(result[1].id).toBe('b');
    expect(result[2].id).toBe('a');
  });

  it('returns empty array for empty input', () => {
    expect(processTrashList([])).toHaveLength(0);
  });
});

describe('calculateDaysRemaining', () => {
  it('calculates correct days remaining', () => {
    const deletedAt = '2025-02-01T00:00:00.000Z';
    const now = new Date('2025-02-10T00:00:00.000Z');
    const result = calculateDaysRemaining(deletedAt, now);
    expect(result).toBe(21); // 30 - 9 days elapsed
  });

  it('returns 0 for expired items', () => {
    const deletedAt = '2024-01-01T00:00:00.000Z';
    const now = new Date('2025-01-01T00:00:00.000Z');
    const result = calculateDaysRemaining(deletedAt, now);
    expect(result).toBe(0);
  });

  it('returns 30 when just deleted', () => {
    const now = new Date('2025-02-10T00:00:00.000Z');
    const deletedAt = now.toISOString();
    const result = calculateDaysRemaining(deletedAt, now);
    expect(result).toBe(30);
  });
});

describe('formatDeletedDate', () => {
  it('returns formatted date string', () => {
    const result = formatDeletedDate('2025-02-01T00:00:00.000Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('groupTrashByType', () => {
  it('groups items by type', () => {
    const items = [
      toTrashListItem(makeTrashItem({ id: '1', type: 'login' })),
      toTrashListItem(makeTrashItem({ id: '2', type: 'login' })),
      toTrashListItem(makeTrashItem({ id: '3', type: 'identity' })),
    ];
    const groups = groupTrashByType(items);
    expect(groups.get('login')).toHaveLength(2);
    expect(groups.get('identity')).toHaveLength(1);
  });

  it('returns empty map for empty input', () => {
    const groups = groupTrashByType([]);
    expect(groups.size).toBe(0);
  });
});

describe('getTrashSummary', () => {
  it('returns correct counts', () => {
    const items = [
      toTrashListItem(makeTrashItem({ id: '1', type: 'login', daysRemaining: 1 })),
      toTrashListItem(makeTrashItem({ id: '2', type: 'login', daysRemaining: 20 })),
      toTrashListItem(makeTrashItem({ id: '3', type: 'identity', daysRemaining: 2 })),
    ];
    const summary = getTrashSummary(items);
    expect(summary.total).toBe(3);
    expect(summary.urgent).toBe(2);
    expect(summary.byType['login']).toBe(2);
    expect(summary.byType['identity']).toBe(1);
  });

  it('returns zeros for empty input', () => {
    const summary = getTrashSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.urgent).toBe(0);
  });
});
