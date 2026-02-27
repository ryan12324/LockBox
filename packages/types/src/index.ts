// Vault item types
export type {
  VaultItem,
  LoginItem,
  SecureNoteItem,
  CardItem,
  IdentityItem,
  CustomField,
  EncryptedVaultItem,
  Folder,
  VaultItemType,
} from './vault';

// API request/response types
export type {
  RegisterRequest,
  LoginRequest,
  LoginResponse,
  SyncRequest,
  SyncResponse,
  VaultItemCreateRequest,
  VaultItemUpdateRequest,
  ChangePasswordRequest,
} from './api';

// Cryptographic types
export type {
  KdfConfig,
  MasterKey,
  UserKey,
  EncryptedUserKey,
  DerivedKeyMaterial,
  EmergencyKit,
} from './crypto';

// Type guards
export { isLoginItem, isSecureNoteItem, isCardItem, isIdentityItem } from './guards';

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
} from './ai';

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
} from './team';

// Share link types
export type {
  ShareLink,
  ShareLinkCreateRequest,
  ShareLinkRedeemResponse,
  ShareLinkMeta,
} from './sharing';

// Two-factor authentication types
export type {
  TotpTwoFactorSetupResponse,
  TotpTwoFactorVerifyRequest,
  TotpTwoFactorVerifyResponse,
  TotpTwoFactorValidateRequest,
  BackupCode,
} from './twofa';
