/**
 * Views module barrel exports — vault list, identity detail, custom fields, and trash.
 */

export {
  getItemIcon,
  getItemSubtitle,
  buildIdentityName,
  toVaultListItem,
  processVaultList,
} from './vault-list.js';
export type { VaultItemIcon, VaultListItem, DecryptedItemData } from './vault-list.js';

export {
  getIdentitySections,
  identityFieldKeys,
  createEmptyIdentityForm,
  extractIdentityFormData,
  maskSensitiveValue,
  hasIdentityData,
  getIdentitySummary,
} from './identity-detail.js';
export type { IdentityFieldDef, IdentitySection, IdentityFormData } from './identity-detail.js';

export {
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
} from './custom-fields.js';
export type { CustomFieldType, CustomField } from './custom-fields.js';

export {
  TRASH_RETENTION_DAYS,
  formatDaysRemaining,
  isUrgentDeletion,
  toTrashListItem,
  processTrashList,
  calculateDaysRemaining,
  formatDeletedDate,
  groupTrashByType,
  getTrashSummary,
} from './trash.js';
export type { TrashItem, TrashListItem, TrashAction } from './trash.js';
