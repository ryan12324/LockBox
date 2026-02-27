/**
 * Custom Fields section utilities — CRUD operations, validation,
 * and display helpers for custom fields on any vault item type.
 *
 * Custom fields are stored inside encryptedData alongside the item's
 * primary fields. Each field has a name, value, and type:
 * - 'text': Plain text value, displayed normally
 * - 'hidden': Sensitive value, masked with toggle to reveal
 * - 'boolean': True/false value, displayed as switch/checkbox
 */

/** Custom field attached to any vault item (matches @lockbox/types CustomField) */
export interface CustomField {
  name: string;
  value: string;
  type: 'text' | 'hidden' | 'boolean';
}

/** Valid custom field types */
export type CustomFieldType = CustomField['type'];

/** All supported custom field types */
export const CUSTOM_FIELD_TYPES: readonly CustomFieldType[] = ['text', 'hidden', 'boolean'];

/** Display labels for custom field types */
export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Text',
  hidden: 'Hidden',
  boolean: 'Boolean',
};

/**
 * Create a new empty custom field with the given type.
 * Booleans default to 'false' as their initial value.
 */
export function createCustomField(type: CustomFieldType = 'text'): CustomField {
  return {
    name: '',
    value: type === 'boolean' ? 'false' : '',
    type,
  };
}

/**
 * Add a new custom field to an array.
 * Returns a new array (immutable).
 */
export function addCustomField(
  fields: readonly CustomField[],
  type: CustomFieldType = 'text'
): CustomField[] {
  return [...fields, createCustomField(type)];
}

/**
 * Remove a custom field at the given index.
 * Returns a new array (immutable).
 */
export function removeCustomField(fields: readonly CustomField[], index: number): CustomField[] {
  if (index < 0 || index >= fields.length) return [...fields];
  return fields.filter((_, i) => i !== index);
}

/**
 * Update a custom field at the given index.
 * Returns a new array (immutable).
 */
export function updateCustomField(
  fields: readonly CustomField[],
  index: number,
  updates: Partial<CustomField>
): CustomField[] {
  if (index < 0 || index >= fields.length) return [...fields];
  return fields.map((field, i) => (i === index ? { ...field, ...updates } : field));
}

/**
 * Update only the name of a custom field at the given index.
 */
export function updateCustomFieldName(
  fields: readonly CustomField[],
  index: number,
  name: string
): CustomField[] {
  return updateCustomField(fields, index, { name });
}

/**
 * Update only the value of a custom field at the given index.
 */
export function updateCustomFieldValue(
  fields: readonly CustomField[],
  index: number,
  value: string
): CustomField[] {
  return updateCustomField(fields, index, { value });
}

/**
 * Update the type of a custom field at the given index.
 * Resets value to appropriate default when switching types:
 * - Switching to boolean: value becomes 'false'
 * - Switching from boolean: value becomes ''
 */
export function updateCustomFieldType(
  fields: readonly CustomField[],
  index: number,
  type: CustomFieldType
): CustomField[] {
  if (index < 0 || index >= fields.length) return [...fields];
  const current = fields[index];
  let value = current.value;

  // Reset value when switching to/from boolean
  if (type === 'boolean' && current.type !== 'boolean') {
    value = 'false';
  } else if (type !== 'boolean' && current.type === 'boolean') {
    value = '';
  }

  return updateCustomField(fields, index, { type, value });
}

/**
 * Toggle a boolean custom field's value between 'true' and 'false'.
 */
export function toggleBooleanField(fields: readonly CustomField[], index: number): CustomField[] {
  if (index < 0 || index >= fields.length) return [...fields];
  const field = fields[index];
  if (field.type !== 'boolean') return [...fields];
  const newValue = field.value === 'true' ? 'false' : 'true';
  return updateCustomField(fields, index, { value: newValue });
}

/**
 * Validate custom fields for save.
 * Returns error messages for invalid fields, or empty array if all valid.
 * Rules: fields with non-empty names are valid; empty name with non-empty value is an error.
 */
export function validateCustomFields(fields: readonly CustomField[]): string[] {
  const errors: string[] = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!field.name.trim() && field.value.trim()) {
      errors.push(`Custom field ${i + 1}: name is required when value is set`);
    }
  }
  return errors;
}

/**
 * Clean custom fields for save — removes fields with both empty name and value.
 */
export function cleanCustomFields(fields: readonly CustomField[]): CustomField[] {
  return fields.filter((f) => f.name.trim() || f.value.trim());
}

/**
 * Mask a hidden custom field value for display.
 * Returns bullets matching the value length, or '••••••••' for empty.
 */
export function maskHiddenValue(value: string): string {
  if (!value) return '••••••••';
  return '•'.repeat(Math.max(value.length, 8));
}

/**
 * Check if a custom field's value should be displayed as masked.
 */
export function isFieldMasked(field: CustomField): boolean {
  return field.type === 'hidden';
}

/**
 * Parse a boolean field value to an actual boolean.
 */
export function parseBooleanValue(value: string): boolean {
  return value === 'true';
}
