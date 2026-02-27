/**
 * Share link types for anonymous password sharing.
 */

/** Share link entity */
export interface ShareLink {
  id: string; // Derived from HKDF(shareSecret)
  userId: string;
  encryptedItem: string;
  tokenHash: string; // SHA-256 of auth token
  itemName: string;
  maxViews: number;
  viewCount: number;
  expiresAt: string;
  createdAt: string;
}

/** Request body for creating a share link */
export interface ShareLinkCreateRequest {
  id: string;
  encryptedItem: string;
  tokenHash: string;
  expiresInSeconds: number;
  maxViews: number;
  itemName: string;
}

/** Response when redeeming a share link */
export interface ShareLinkRedeemResponse {
  encryptedItem: string;
  viewCount: number;
  maxViews: number;
}

/** Share link metadata (for listing) */
export interface ShareLinkMeta {
  id: string;
  itemName: string;
  expiresAt: string;
  maxViews: number;
  viewCount: number;
  createdAt: string;
  isExpired: boolean;
  isExhausted: boolean;
}
