/**
 * Integration types for external services and APIs.
 */

/** Entry from 2fa.directory API v3. */
export interface TwoFaDirectoryEntry {
  domain: string;
  methods: string[];
  documentation_url?: string;
  additional_domains?: string[];
  notes?: string;
}

/** Supported email alias providers. */
export type EmailAliasProvider = 'simplelogin' | 'anonaddy';

/** User's email alias provider configuration. */
export interface EmailAliasConfig {
  provider: EmailAliasProvider;
  apiKey: string;
  baseUrl?: string;
}

/** A generated email alias. */
export interface EmailAlias {
  id: string;
  email: string;
  forwardTo: string;
  enabled: boolean;
  createdAt: string;
}
