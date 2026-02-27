/**
 * Email alias utilities — provider metadata, config validation,
 * and display formatting for SimpleLogin and AnonAddy integrations.
 *
 * Used by the mobile alias management screens to configure providers,
 * generate aliases, and display alias emails.
 */

/** SimpleLogin API base URL */
export const SIMPLELOGIN_API_BASE = 'https://app.simplelogin.io/api';

/** AnonAddy API base URL */
export const ANONADDY_API_BASE = 'https://app.anonaddy.com/api/v1';

/** Supported email alias providers */
export type EmailAliasProvider = 'simplelogin' | 'anonaddy';

/** Provider metadata entry */
interface AliasProviderMeta {
  id: EmailAliasProvider;
  name: string;
  apiBase: string;
  docsUrl: string;
}

/** Provider metadata with API base URLs and documentation links */
export const ALIAS_PROVIDERS: readonly AliasProviderMeta[] = [
  {
    id: 'simplelogin',
    name: 'SimpleLogin',
    apiBase: SIMPLELOGIN_API_BASE,
    docsUrl: 'https://simplelogin.io/docs/',
  },
  {
    id: 'anonaddy',
    name: 'AnonAddy',
    apiBase: ANONADDY_API_BASE,
    docsUrl: 'https://addy.io/docs/',
  },
] as const;

/** Configuration for an email alias provider */
export interface AliasConfig {
  provider: EmailAliasProvider;
  encryptedApiKey: string;
  baseUrl?: string;
}

/** A generated alias email address */
export interface GeneratedAlias {
  email: string;
}

/**
 * Get the display name for an alias provider.
 */
export function getProviderName(provider: EmailAliasProvider): string {
  const meta = ALIAS_PROVIDERS.find((p) => p.id === provider);
  return meta?.name ?? provider;
}

/**
 * Get the documentation URL for an alias provider.
 */
export function getProviderDocsUrl(provider: EmailAliasProvider): string {
  const meta = ALIAS_PROVIDERS.find((p) => p.id === provider);
  return meta?.docsUrl ?? '';
}

/**
 * Validate that an alias config has all required fields.
 * Requires provider to be a valid provider ID and encryptedApiKey to be non-empty.
 */
export function isValidAliasConfig(config: Partial<AliasConfig>): boolean {
  if (!config.provider) return false;
  if (!config.encryptedApiKey) return false;
  const validProviders: string[] = ALIAS_PROVIDERS.map((p) => p.id);
  if (!validProviders.includes(config.provider)) return false;
  return true;
}

/**
 * Format an alias email for display, truncating long addresses.
 * Emails longer than 30 characters are truncated with an ellipsis
 * before the @ domain portion.
 */
export function formatAliasEmail(email: string): string {
  if (email.length <= 30) return email;
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return email.slice(0, 27) + '…';
  const domain = email.slice(atIndex);
  const maxLocal = 30 - domain.length - 1; // 1 for ellipsis
  if (maxLocal < 1) return email.slice(0, 27) + '…';
  return email.slice(0, maxLocal) + '…' + domain;
}
