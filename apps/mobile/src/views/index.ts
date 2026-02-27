/**
 * Views module barrel exports — vault list, identity detail, custom fields, trash,
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

 export {
  MAX_VERSIONS,
  formatRelativeTime,
  toVersionListItem,
  processVersionList,
  getVersionSummary,
} from './version-history.js';
export type { ItemVersion, VersionListItem } from './version-history.js';

export {
  CACHE_EXPIRY_MS,
  parseTwoFaDirectory,
  checkSiteAgainstEntries,
  fetchTwoFaDirectory,
  extractDomainFromUri,
  checkLoginItemsFor2fa,
} from './twofa-detection.js';
export type { TwoFaEntry, TwoFaCheckResult } from './twofa-detection.js';

export {
  SIMPLELOGIN_API_BASE,
  ANONADDY_API_BASE,
  ALIAS_PROVIDERS,
  getProviderName,
  getProviderDocsUrl,
  isValidAliasConfig,
  formatAliasEmail,
} from './email-aliases.js';
export type { EmailAliasProvider, AliasConfig, GeneratedAlias } from './email-aliases.js';

export {
  parseOtpAuthUri,
} from './qr-totp.js';
export type { OtpAuthParams } from './qr-totp.js';

export {
  MAX_FILE_SIZE,
  MAX_TOTAL_QUOTA,
  formatFileSize,
  getAttachmentIcon,
  isImageAttachment,
  toAttachmentListItem,
  processAttachmentList,
  getAttachmentSummary,
  validateFileSize,
  validateQuota,
} from './attachments.js';
export type { AttachmentListItem, ValidationResult } from './attachments.js';
