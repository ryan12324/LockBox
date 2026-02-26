export type { VaultItem, LoginItem, SecureNoteItem, CardItem, EncryptedVaultItem, Folder, VaultItemType, } from './vault';
export type { RegisterRequest, LoginRequest, LoginResponse, SyncRequest, SyncResponse, VaultItemCreateRequest, VaultItemUpdateRequest, ChangePasswordRequest, } from './api';
export type { KdfConfig, MasterKey, UserKey, EncryptedUserKey, DerivedKeyMaterial, EmergencyKit, } from './crypto';
export { isLoginItem, isSecureNoteItem, isCardItem } from './guards';
export type { AIProvider, AIProviderConfig, AIFeatureFlags, PasswordIssue, PasswordHealthReport, VaultHealthSummary, BreachCheckResult, AgentToolCall, AgentToolResult, AgentEvent, SecurityPosture, SecurityAction, PhishingResult, SecurityAlert, SearchResult, DuplicateGroup, FormMetadata, FieldMetadata, FieldClassification, FormClassification, PasswordRules, RotationSchedule, } from './ai';
//# sourceMappingURL=index.d.ts.map