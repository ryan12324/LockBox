/**
 * Hardware security key types for YubiKey PIV and FIDO2 unlock.
 * Used for master-key wrapping via hardware-bound keys.
 */

export interface HardwareKeyConfig {
  keyId: string;
  type: 'yubikey-piv' | 'fido2';
  publicKey: string;
  wrappedMasterKey: string;
  createdAt: string;
}

export interface HardwareKeySetupRequest {
  keyType: HardwareKeyConfig['type'];
  publicKey: string;
  wrappedMasterKey: string;
  attestation?: string;
}

export interface HardwareKeyUnlockRequest {
  keyId: string;
  signature: string;
  challenge: string;
}

export interface HardwareKeyChallengeResponse {
  challenge: string;
  keyId: string;
  expiresAt: string;
}
