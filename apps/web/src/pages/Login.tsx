import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { deriveKey, decryptUserKey, makeAuthHash, fromBase64, toBase64 } from '@lockbox/crypto';
import { Button, Input, Card, Aura } from '@lockbox/design';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';
import { useToast } from '../providers/ToastProvider.js';
import type { KdfConfig } from '@lockbox/types';

export default function Login() {
  const navigate = useNavigate();
  const { setSession, setKeys } = useAuthStore();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // 2FA state
  const [tempToken, setTempToken] = useState('');
  const [masterKeyCache, setMasterKeyCache] = useState<Uint8Array | null>(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [isBackupCode, setIsBackupCode] = useState(false);

  // Hardware Key unlock state
  const [hwKeyLoading, setHwKeyLoading] = useState(false);
  const [qrScanning, setQrScanning] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      // Step 1: Fetch KDF params for this email (no auth required)
      // This lets us derive the master key before sending the auth hash
      const kdfRes = (await api.auth.kdfParams(email)) as {
        kdfConfig: KdfConfig;
        salt: string;
      };

      const { kdfConfig, salt: saltB64 } = kdfRes;
      const salt = fromBase64(saltB64);

      // Step 2: Derive master key from password + salt + kdfConfig
      const masterKey = await deriveKey(password, salt, kdfConfig);

      // Step 3: Derive auth hash (one extra PBKDF2 round of masterKey + password)
      const authHash = await makeAuthHash(masterKey, password);

      // Step 4: Login with derived auth hash
      const loginRes = (await api.auth.login({ email, authHash })) as {
        token?: string;
        user?: {
          id: string;
          email: string;
          kdfConfig: KdfConfig;
          salt: string;
          encryptedUserKey: string;
        };
        requires2FA?: boolean;
        tempToken?: string;
      };

      if (loginRes.requires2FA && loginRes.tempToken) {
        setTempToken(loginRes.tempToken);
        setMasterKeyCache(masterKey);
        setLoading(false);
        return;
      }

      if (!loginRes.token || !loginRes.user) {
        throw new Error('Invalid response');
      }

      // Step 5: Decrypt user key with master key
      const userKey = await decryptUserKey(loginRes.user.encryptedUserKey, masterKey);

      setSession({
        token: loginRes.token,
        userId: loginRes.user.id,
        email: loginRes.user.email,
        encryptedUserKey: loginRes.user.encryptedUserKey,
        kdfConfig: loginRes.user.kdfConfig,
        salt: loginRes.user.salt,
      });
      setKeys(masterKey, userKey);
      navigate('/vault');
    } catch (err) {
      if (err instanceof Error && err.message.includes('401')) {
        toast('Invalid email or password', 'error');
      } else if (err instanceof Error) {
        toast(err.message || 'Login failed. Please try again.', 'error');
      } else {
        toast('Login failed. Please try again.', 'error');
      }
    } finally {
      if (!tempToken) setLoading(false);
    }
  }

  async function handle2FASubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/auth/2fa/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, code: twoFaCode }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid 2FA code');

      const { token, user } = data;

      if (!masterKeyCache) throw new Error('Master key lost. Please reload and try again.');

      const userKey = await decryptUserKey(user.encryptedUserKey, masterKeyCache);

      setSession({
        token,
        userId: user.id,
        email: user.email,
        encryptedUserKey: user.encryptedUserKey,
        kdfConfig: user.kdfConfig,
        salt: user.salt,
      });
      setKeys(masterKeyCache, userKey);
      navigate('/vault');
    } catch (err) {
      if (err instanceof Error) {
        toast(err.message, 'error');
      } else {
        toast('Verification failed', 'error');
      }
      setLoading(false);
    }
  }

  async function handleHardwareKeyUnlock() {
    setHwKeyLoading(true);
    try {
      // Step 1: Get challenge from server
      const challengeRes = await api.hardwareKey.challenge('', '');
      const challengeBytes = fromBase64(challengeRes.challenge);

      // Step 2: Authenticate with hardware key
      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: challengeBytes,
          rpId: window.location.hostname,
          userVerification: 'preferred',
        },
      })) as PublicKeyCredential | null;
      if (!assertion) throw new Error('Authentication cancelled');

      const assertionResponse = assertion.response as AuthenticatorAssertionResponse;
      const signature = toBase64(new Uint8Array(assertionResponse.signature));

      // Step 3: Verify signature and get session
      const verifyRes = await api.hardwareKey.verify({
        keyId: challengeRes.keyId,
        challenge: challengeRes.challenge,
        signature,
      });

      // Step 4: Unwrap master key and set session
      const wrappedKeyBytes = fromBase64(verifyRes.wrappedMasterKey);
      const meRes = (await api.auth.me(verifyRes.token)) as {
        user: {
          id: string;
          email: string;
          kdfConfig: KdfConfig;
          salt: string;
          encryptedUserKey: string;
        };
      };

      const userKey = await decryptUserKey(meRes.user.encryptedUserKey, wrappedKeyBytes);
      setSession({
        token: verifyRes.token,
        userId: meRes.user.id,
        email: meRes.user.email,
        encryptedUserKey: meRes.user.encryptedUserKey,
        kdfConfig: meRes.user.kdfConfig,
        salt: meRes.user.salt,
      });
      setKeys(wrappedKeyBytes, userKey);
      navigate('/vault');
    } catch (err) {
      if (err instanceof Error) {
        toast(err.message, 'error');
      } else {
        toast('Hardware key authentication failed', 'error');
      }
    } finally {
      setHwKeyLoading(false);
    }
  }

  async function handleQRScan() {
    setQrScanning(true);

    // Capacitor injects window.Capacitor in the native WebView at runtime
    const cap = (window as unknown as Record<string, unknown>).Capacitor as
      | {
          isNativePlatform(): boolean;
          isPluginAvailable(name: string): boolean;
          nativePromise(
            plugin: string,
            method: string,
            opts: Record<string, unknown>
          ): Promise<Record<string, unknown>>;
        }
      | undefined;

    if (!cap?.isNativePlatform()) {
      toast(
        'QR scanning is only available in the mobile app. Open Settings \u2192 Device Sync on your existing device to generate a QR code.',
        'error'
      );
      setQrScanning(false);
      return;
    }

    if (!cap.isPluginAvailable('QRScanner')) {
      toast('QR scanner plugin is not available on this device.', 'error');
      setQrScanning(false);
      return;
    }

    try {
      // Check camera availability
      const availResult = (await cap.nativePromise('QRScanner', 'isAvailable', {})) as {
        available: boolean;
      };
      if (!availResult.available) {
        toast(
          'Camera not available. Please grant camera permission in your device settings.',
          'error'
        );
        return;
      }

      // Launch the native QR scanner (CameraX + ML Kit)
      const scanResult = (await cap.nativePromise('QRScanner', 'scanQRCode', {})) as {
        value: string;
        format: string;
      };

      // Parse QR sync payload
      let payload: {
        ephemeralPublicKey?: string;
        encryptedSessionKey?: string;
        nonce?: string;
        expiresAt?: string;
      };
      try {
        payload = JSON.parse(scanResult.value);
      } catch {
        toast('Invalid QR code. Please scan a Lockbox device sync QR code.', 'error');
        return;
      }

      // Validate QR sync payload structure
      if (
        !payload.ephemeralPublicKey ||
        !payload.encryptedSessionKey ||
        !payload.nonce ||
        !payload.expiresAt
      ) {
        toast(
          'Invalid QR code format. Please scan a Lockbox device sync QR code from Settings \u2192 Device Sync.',
          'error'
        );
        return;
      }

      // Check expiry
      if (new Date(payload.expiresAt).getTime() < Date.now()) {
        toast(
          'QR code has expired. Please generate a new one from Settings \u2192 Device Sync.',
          'error'
        );
        return;
      }

      // Decode the encrypted session data
      // The sender encrypted with ECDH self-derived key; the session data contains { sessionToken, userKey }
      const dotIdx = payload.encryptedSessionKey.indexOf('.');
      if (dotIdx === -1) {
        toast('Malformed QR payload. Please generate a new QR code.', 'error');
        return;
      }

      // Attempt ECDH decryption with the embedded key material
      // The QR payload uses ECDH P-256; derive shared secret from the ephemeral public key
      const publicKeyBytes = fromBase64(payload.ephemeralPublicKey);
      const receiverKeyPair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits']
      );
      const receiverPubBuf = await crypto.subtle.exportKey('spki', receiverKeyPair.publicKey);

      // Import sender's public key
      const senderPubKey = await crypto.subtle.importKey(
        'spki',
        publicKeyBytes as Uint8Array<ArrayBuffer>,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        []
      );

      // Derive shared secret via ECDH
      const rawBits = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: senderPubKey },
        receiverKeyPair.privateKey,
        256
      );
      const ikm = await crypto.subtle.importKey('raw', rawBits, { name: 'HKDF' }, false, [
        'deriveBits',
      ]);
      const info = new TextEncoder().encode('lockbox-device-sync');
      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new Uint8Array(32) as Uint8Array<ArrayBuffer>,
          info: info as Uint8Array<ArrayBuffer>,
        },
        ikm,
        256
      );
      const sharedSecret = new Uint8Array(derivedBits);

      // Decrypt session data: format is base64(iv).base64(ciphertext+tag)
      const iv = fromBase64(payload.encryptedSessionKey.slice(0, dotIdx));
      const ciphertext = fromBase64(payload.encryptedSessionKey.slice(dotIdx + 1));
      const decKey = await crypto.subtle.importKey(
        'raw',
        sharedSecret as Uint8Array<ArrayBuffer>,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
        decKey,
        ciphertext as Uint8Array<ArrayBuffer>
      );
      const sessionData = JSON.parse(new TextDecoder().decode(plaintext)) as {
        sessionToken: string;
        userKey: string;
      };

      // Establish session with the decrypted credentials
      const userKeyBytes = fromBase64(sessionData.userKey);
      const meRes = (await api.auth.me(sessionData.sessionToken)) as {
        user: {
          id: string;
          email: string;
          kdfConfig: KdfConfig;
          salt: string;
          encryptedUserKey: string;
        };
      };

      setSession({
        token: sessionData.sessionToken,
        userId: meRes.user.id,
        email: meRes.user.email,
        encryptedUserKey: meRes.user.encryptedUserKey,
        kdfConfig: meRes.user.kdfConfig,
        salt: meRes.user.salt,
      });
      setKeys(userKeyBytes, userKeyBytes);
      navigate('/vault');
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('permission') || err.message.includes('Permission')) {
          toast(
            'Camera permission denied. Please grant camera access in your device settings.',
            'error'
          );
        } else if (err.name === 'OperationError') {
          toast(
            'Could not decrypt QR payload. The QR code may have been generated by a different device or session.',
            'error'
          );
        } else {
          toast(err.message || 'QR scan failed. Please try again.', 'error');
        }
      } else {
        toast('QR scan failed. Please try again.', 'error');
      }
    } finally {
      setQrScanning(false);
    }
  }

  const [altMethodsOpen, setAltMethodsOpen] = useState(false);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--color-bg)',
      }}
    >
      <Aura state="idle" position="center" style={{ width: 400, height: 400, opacity: 0.85 }} />

      <div
        className="w-full flex flex-col items-center"
        style={{ position: 'relative', zIndex: 1, maxWidth: 420 }}
      >
        <div className="text-center" style={{ marginBottom: 32 }}>
          <div
            className="text-4xl font-bold text-[var(--color-text)]"
            style={{ letterSpacing: '-0.02em' }}
          >
            🔐 Lockbox
          </div>
          <p
            className="text-[var(--color-text-tertiary)]"
            style={{ marginTop: 8, fontSize: 'var(--font-size-md)' }}
          >
            Sign in to your vault
          </p>
        </div>

        {tempToken ? (
          <Card
            variant="frost"
            padding="lg"
            style={{ width: '100%', boxShadow: 'var(--shadow-xl)' }}
          >
            <form
              onSubmit={handle2FASubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
            >
              <Input
                name="twoFaCode"
                type="text"
                required
                value={twoFaCode}
                onChange={(e) => setTwoFaCode(e.target.value)}
                label={isBackupCode ? 'Backup Code' : 'Authenticator Code'}
                placeholder={isBackupCode ? '8-character code' : '6-digit code'}
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                style={{ width: '100%' }}
              >
                Verify
              </Button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsBackupCode(!isBackupCode);
                    setTwoFaCode('');
                  }}
                  style={{ width: '100%' }}
                >
                  {isBackupCode ? 'Use authenticator app' : 'Use backup code'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTempToken('');
                    setMasterKeyCache(null);
                    setTwoFaCode('');
                  }}
                  style={{ width: '100%', color: 'var(--color-text-tertiary)' }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <Card
            variant="frost"
            padding="lg"
            style={{ width: '100%', boxShadow: 'var(--shadow-xl)' }}
          >
            <form
              onSubmit={handleSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
            >
              <Input
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                label="Email"
                placeholder="you@example.com"
              />

              <Input
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                label="Master Password"
                placeholder="Master password"
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                style={{ width: '100%' }}
              >
                Sign In
              </Button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAltMethodsOpen(!altMethodsOpen)}
                  style={{ width: '100%', color: 'var(--color-text-tertiary)' }}
                >
                  {altMethodsOpen ? 'Hide other sign-in options' : 'Other sign-in options'}
                </Button>

                {altMethodsOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      loading={hwKeyLoading}
                      onClick={handleHardwareKeyUnlock}
                      style={{ width: '100%' }}
                    >
                      🔐 Unlock with Hardware Key
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      loading={qrScanning}
                      onClick={handleQRScan}
                      style={{ width: '100%' }}
                    >
                      📱 Scan QR Code
                    </Button>
                  </div>
                )}
              </div>
            </form>
          </Card>
        )}

        <p
          className="text-center text-sm text-[var(--color-text-tertiary)]"
          style={{ marginTop: 24 }}
        >
          Don&apos;t have an account?{' '}
          <Link
            to="/register"
            className="text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] hover:underline"
          >
            Create vault
          </Link>
        </p>
      </div>
    </div>
  );
}
