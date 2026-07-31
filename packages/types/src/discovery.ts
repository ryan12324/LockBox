/** Public protocol metadata used to pair Lockbox clients with an instance. */
export const LOCKBOX_PRODUCT = 'lockbox' as const;
export const LOCKBOX_PROTOCOL_VERSION = 1 as const;
export const LOCKBOX_DISCOVERY_PATH = '/.well-known/lockbox.json' as const;

export interface LockboxDiscoveryDocument {
  product: typeof LOCKBOX_PRODUCT;
  protocolVersion: typeof LOCKBOX_PROTOCOL_VERSION;
  apiBaseUrl: string;
}

export interface LockboxHealthResponse {
  product: typeof LOCKBOX_PRODUCT;
  protocolVersion: typeof LOCKBOX_PROTOCOL_VERSION;
  status: 'ok';
  timestamp: string;
}
