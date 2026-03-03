import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { deriveKey, decryptUserKey, makeAuthHash, fromBase64, toBase64 } from '@lockbox/crypto';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';
import type { KdfConfig } from '@lockbox/types';

export default function Login() {
  const navigate = useNavigate();
  const { setSession, setKeys } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    setError('');
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
        setError('Invalid email or password');
      } else if (err instanceof Error) {
        setError(err.message || 'Login failed. Please try again.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      if (!tempToken) setLoading(false);
    }
  }

  async function handle2FASubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
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
        setError(err.message);
      } else {
        setError('Verification failed');
      }
      setLoading(false);
    }
  }

  async function handleHardwareKeyUnlock() {
    setError('');
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
        setError(err.message);
      } else {
        setError('Hardware key authentication failed');
      }
    } finally {
      setHwKeyLoading(false);
    }
  }

  async function handleQRScan() {
    setError('');
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
      setError(
        'QR scanning is only available in the mobile app. Open Settings \u2192 Device Sync on your existing device to generate a QR code.'
      );
      setQrScanning(false);
      return;
    }

    if (!cap.isPluginAvailable('QRScanner')) {
      setError('QR scanner plugin is not available on this device.');
      setQrScanning(false);
      return;
    }

    try {
      // Check camera availability
      const availResult = (await cap.nativePromise('QRScanner', 'isAvailable', {})) as {
        available: boolean;
      };
      if (!availResult.available) {
        setError('Camera not available. Please grant camera permission in your device settings.');
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
        setError('Invalid QR code. Please scan a Lockbox device sync QR code.');
        return;
      }

      // Validate QR sync payload structure
      if (
        !payload.ephemeralPublicKey ||
        !payload.encryptedSessionKey ||
        !payload.nonce ||
        !payload.expiresAt
      ) {
        setError(
          'Invalid QR code format. Please scan a Lockbox device sync QR code from Settings \u2192 Device Sync.'
        );
        return;
      }

      // Check expiry
      if (new Date(payload.expiresAt).getTime() < Date.now()) {
        setError(
          'QR code has expired. Please generate a new one from Settings \u2192 Device Sync.'
        );
        return;
      }

      // Decode the encrypted session data
      // The sender encrypted with ECDH self-derived key; the session data contains { sessionToken, userKey }
      const dotIdx = payload.encryptedSessionKey.indexOf('.');
      if (dotIdx === -1) {
        setError('Malformed QR payload. Please generate a new QR code.');
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
          setError('Camera permission denied. Please grant camera access in your device settings.');
        } else if (err.name === 'OperationError') {
          setError(
            'Could not decrypt QR payload. The QR code may have been generated by a different device or session.'
          );
        } else {
          setError(err.message || 'QR scan failed. Please try again.');
        }
      } else {
        setError('QR scan failed. Please try again.');
      }
    } finally {
      setQrScanning(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[var(--color-text)]">🔐 Lockbox</h1>
          <p className="mt-2 text-[var(--color-text-tertiary)]">Sign in to your vault</p>
        </div>

        {tempToken ? (
          <form
            onSubmit={handle2FASubmit}
            className="bg-[var(--color-surface-raised)] border border-[var(--color-border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] p-8 space-y-5"
          >
            {error && (
              <div className="bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-md)] p-3 text-[var(--color-error)] text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                {isBackupCode ? 'Backup Code' : 'Authenticator Code'}
              </label>
              <input
                name="twoFaCode"
                type="text"
                required
                value={twoFaCode}
                onChange={(e) => setTwoFaCode(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-aura)] focus:border-[var(--color-border-strong)]"
                placeholder={isBackupCode ? '8-character code' : '6-digit code'}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-40 text-[var(--color-primary-fg)] font-medium rounded-[var(--radius-md)] transition-colors"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsBackupCode(!isBackupCode);
                setTwoFaCode('');
                setError('');
              }}
              className="w-full py-2 text-sm text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] hover:underline text-center"
            >
              {isBackupCode ? 'Use authenticator app' : 'Use backup code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTempToken('');
                setMasterKeyCache(null);
                setTwoFaCode('');
                setError('');
              }}
              className="w-full py-2 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:underline text-center"
            >
              Cancel
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-[var(--color-surface-raised)] border border-[var(--color-border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] p-8 space-y-5"
          >
            {error && (
              <div className="bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-md)] p-3 text-[var(--color-error)] text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Email
              </label>
              <input
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-aura)] focus:border-[var(--color-border-strong)]"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Master Password
              </label>
              <input
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-aura)] focus:border-[var(--color-border-strong)]"
                placeholder="Master password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-40 text-[var(--color-primary-fg)] font-medium rounded-[var(--radius-md)] transition-colors"
            >
              {loading ? 'Unlocking vault...' : 'Sign In'}
            </button>

            <p className="text-center text-sm text-[var(--color-text-tertiary)]">
              Don't have an account?{' '}
              <Link
                to="/register"
                className="text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] hover:underline"
              >
                Create vault
              </Link>
            </p>

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={handleHardwareKeyUnlock}
                disabled={hwKeyLoading}
                className="w-full py-2.5 px-4 bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)] font-medium rounded-[var(--radius-md)] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <span>🔐</span>
                {hwKeyLoading ? 'Authenticating...' : 'Unlock with Hardware Key'}
              </button>
              <button
                type="button"
                onClick={handleQRScan}
                disabled={qrScanning}
                className="w-full py-2.5 px-4 bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)] font-medium rounded-[var(--radius-md)] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <span>📱</span>
                {qrScanning ? 'Scanning...' : 'Scan QR Code'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
