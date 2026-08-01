// Vault item types
export type {
  VaultItem,
  LoginItem,
  SecureNoteItem,
  CardItem,
  IdentityItem,
  PasskeyItem,
  DocumentItem,
  CustomField,
  EncryptedVaultItem,
  Folder,
  VaultItemType,
  Attachment,
  VaultItemVersion,
} from './vault.js';

// API request/response types
export type {
  RegisterRequest,
  LoginRequest,
  LoginResponse,
  AuthenticatedLoginResponse,
  TwoFactorRequiredLoginResponse,
  SyncRequest,
  SyncResponse,
  VaultItemCreateRequest,
  VaultItemUpdateRequest,
  ChangePasswordRequest,
} from './api.js';

// Cryptographic types
export type {
  KdfConfig,
  MasterKey,
  UserKey,
  EncryptedUserKey,
  DerivedKeyMaterial,
  EmergencyKit,
} from './crypto.js';

// Type guards
export { isLoginItem, isSecureNoteItem, isCardItem, isIdentityItem, isPasskeyItem, isDocumentItem } from './guards.js';

// AI types
export type {
  AIProvider,
  AIProviderConfig,
  AIFeatureFlags,
  PasswordIssue,
  PasswordHealthReport,
  VaultHealthSummary,
  BreachCheckResult,
  AgentToolCall,
  AgentToolResult,
  AgentEvent,
  SecurityPosture,
  SecurityAction,
  PhishingResult,
  SecurityAlert,
  SearchResult,
  DuplicateGroup,
  FormMetadata,
  FieldMetadata,
  FieldClassification,
  FormClassification,
  PasswordRules,
  RotationSchedule,
} from './ai.js';

// Team and sharing types
export type {
  TeamRole,
  CustomPermissions,
  Team,
  TeamMember,
  TeamInvite,
  UserKeyPair,
  SharedFolder,
  SharedFolderKey,
  FolderPermission,
} from './team.js';

// Share link types
export type {
  ShareLink,
  ShareLinkCreateRequest,
  ShareLinkRedeemResponse,
  ShareLinkMeta,
} from './sharing.js';

// Two-factor authentication types
export type {
  TotpTwoFactorSetupResponse,
  TotpTwoFactorVerifyRequest,
  TotpTwoFactorVerifyResponse,
  TotpTwoFactorValidateRequest,
  BackupCode,
} from './twofa.js';

// Integration types
export type {
  TwoFaDirectoryEntry,
  EmailAliasProvider,
  EmailAliasConfig,
  EmailAlias,
} from './integrations.js';

// Emergency access types
export type {
  EmergencyWaitPeriod,
  EmergencyAccessStatus,
  EmergencyAccessGrant,
  EmergencyAccessRequest,
} from './emergency.js';

// Hardware key types
export type {
  HardwareKeyConfig,
  HardwareKeySetupRequest,
  HardwareKeyUnlockRequest,
  HardwareKeyChallengeResponse,
} from './hardware-key.js';

// Device sync types
export type {
  QRSyncPayload,
  DeviceSyncRequest,
  DeviceSyncResponse,
} from './device-sync.js';

// Lockbox instance discovery protocol
export {
  LOCKBOX_DISCOVERY_PATH,
  LOCKBOX_PRODUCT,
  LOCKBOX_PROTOCOL_VERSION,
} from './discovery.js';
export type { LockboxDiscoveryDocument, LockboxHealthResponse } from './discovery.js';

// Login website and native-application URI helpers
export {
  ANDROID_APP_URI_PREFIX,
  getAndroidAppPackageName,
  getLoginUriHref,
  getLoginUriValidationError,
  isAndroidAppUri,
  normalizeAndroidAppUri,
  normalizeLoginUriForStorage,
} from './login-uri.js';
