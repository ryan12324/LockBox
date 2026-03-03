/**
 * chrome.webAuthenticationProxy — browser-level WebAuthn interception.
 * SECURITY: Chrome 115+ only. Exclusive (one extension at a time).
 * Falls back gracefully when unavailable or already claimed.
 */

import {
  base64urlEncode,
  base64urlDecode,
  generateCredentialId,
  generatePasskeyKeyPair,
  importPrivateKey,
  hashRpId,
  createAuthenticatorData,
  signChallenge,
  p1363ToDer,
  buildAttestationObject,
  buildClientDataJSON,
} from './webauthn.js';
import type { SerializedCredential } from './webauthn.js';

// ─── Type declarations (chrome.webAuthenticationProxy is newer than most type packages) ─

interface WebAuthenticationProxy {
  attach: (callback?: () => void) => void;
  detach: (callback?: () => void) => void;
  onCreateRequest: chrome.events.Event<(details: ProxyCreateDetails) => void>;
  onGetRequest: chrome.events.Event<(details: ProxyGetDetails) => void>;
  onIsUvpaaRequest: chrome.events.Event<(details: ProxyIsUvpaaDetails) => void>;
  onRequestCanceled: chrome.events.Event<(requestId: number) => void>;
  completeCreateRequest: (response: ProxyCreateResponse) => void;
  completeGetRequest: (response: ProxyGetResponse) => void;
  completeIsUvpaaRequest: (response: ProxyIsUvpaaResponse) => void;
}

interface ProxyCreateDetails {
  requestId: number;
  requestDetailsJson: string;
}

interface ProxyGetDetails {
  requestId: number;
  requestDetailsJson: string;
}

interface ProxyIsUvpaaDetails {
  requestId: number;
}

interface ProxyCreateResponse {
  requestId: number;
  responseJson?: string;
  error?: { name: string; message?: string };
}

interface ProxyGetResponse {
  requestId: number;
  responseJson?: string;
  error?: { name: string; message?: string };
}

interface ProxyIsUvpaaResponse {
  requestId: number;
  isUvpaa: boolean;
}

// ─── Proxy handler types ────────────────────────────────────────────────────────

export interface WebAuthnProxyHandlers {
  isUnlocked: () => boolean;
  getPasskeys: () => Array<{
    id: string;
    credentialId: string;
    rpId: string;
    rpName: string;
    userId: string;
    userName: string;
    publicKey: string;
    counter: number;
    privateKey?: string;
    createdAt: string;
    updatedAt: string;
    revisionDate: string;
  }>;
  persistCounter: (credentialId: string, newCounter: number, updatedAt: string) => void;
  savePasskeyItem: (item: {
    id: string;
    type: 'passkey';
    name: string;
    rpId: string;
    rpName: string;
    userId: string;
    userName: string;
    credentialId: string;
    publicKey: string;
    privateKey: string;
    counter: number;
    transports: string[];
    tags: string[];
    favorite: boolean;
    createdAt: string;
    updatedAt: string;
    revisionDate: string;
  }) => Promise<void>;
}

let proxyActive = false;
const cancelledRequests = new Set<number>();

export function isProxyActive(): boolean {
  return proxyActive;
}

async function sendToActiveTab<T>(message: object): Promise<T | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;
    return (await chrome.tabs.sendMessage(tab.id, message)) as T;
  } catch {
    return null;
  }
}

async function getActiveTabOrigin(): Promise<string> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) return new URL(tab.url).origin;
  } catch {
    /* */
  }
  return '';
}

export function initWebAuthnProxy(handlers: WebAuthnProxyHandlers): boolean {
  const proxy = (chrome as unknown as { webAuthenticationProxy?: WebAuthenticationProxy })
    .webAuthenticationProxy;

  if (!proxy) return false;

  try {
    proxy.attach();
    proxyActive = true;
  } catch {
    return false;
  }

  proxy.onIsUvpaaRequest.addListener((details: ProxyIsUvpaaDetails) => {
    proxy.completeIsUvpaaRequest({
      requestId: details.requestId,
      isUvpaa: true,
    });
  });

  proxy.onCreateRequest.addListener(async (details: ProxyCreateDetails) => {
    if (cancelledRequests.delete(details.requestId)) return;

    if (!handlers.isUnlocked()) {
      const result = await sendToActiveTab<{ unlocked: boolean }>({
        type: 'webauthn-unlock-prompt',
      });
      if (!result?.unlocked || !handlers.isUnlocked()) {
        proxy.completeCreateRequest({
          requestId: details.requestId,
          error: { name: 'NotAllowedError', message: 'Vault is locked' },
        });
        return;
      }
    }

    try {
      const options = JSON.parse(details.requestDetailsJson);
      const origin = options.origin ?? (await getActiveTabOrigin());
      const rpId = options.rp?.id ?? (origin ? new URL(origin).hostname : '');

      const consent = await sendToActiveTab<{ confirmed: boolean }>({
        type: 'webauthn-create-consent',
        params: {
          rpName: options.rp?.name ?? rpId,
          rpId,
          userName: options.user?.name ?? '',
          userDisplayName: options.user?.displayName ?? options.user?.name ?? '',
        },
      });

      if (!consent?.confirmed) {
        proxy.completeCreateRequest({
          requestId: details.requestId,
          error: { name: 'NotAllowedError', message: 'User denied' },
        });
        return;
      }

      if (cancelledRequests.delete(details.requestId)) return;

      const { publicKeySPKI, privateKeyPKCS8, publicKeyCOSE } = await generatePasskeyKeyPair();

      const credId = generateCredentialId();
      const credIdB64 = base64urlEncode(credId);
      const rpIdHash = await hashRpId(rpId);
      const counter = 1;
      const authData = createAuthenticatorData(rpIdHash, counter, credId, publicKeyCOSE);
      const attestationObject = buildAttestationObject(authData);

      const challenge =
        typeof options.challenge === 'string'
          ? options.challenge
          : base64urlEncode(new Uint8Array(options.challenge));
      const clientDataJSON = buildClientDataJSON('webauthn.create', challenge, origin);

      const now = new Date().toISOString();
      const itemId = crypto.randomUUID();
      await handlers.savePasskeyItem({
        id: itemId,
        type: 'passkey',
        name: `${options.rp?.name ?? rpId} (${options.user?.name ?? 'unknown'})`,
        rpId,
        rpName: options.rp?.name ?? rpId,
        userId: options.user?.id ?? '',
        userName: options.user?.name ?? '',
        credentialId: credIdB64,
        publicKey: base64urlEncode(publicKeySPKI),
        privateKey: base64urlEncode(privateKeyPKCS8),
        counter,
        transports: ['internal'],
        tags: ['passkey'],
        favorite: false,
        createdAt: now,
        updatedAt: now,
        revisionDate: now,
      });

      const credential: SerializedCredential = {
        id: credIdB64,
        rawId: credIdB64,
        type: 'public-key',
        authenticatorAttachment: 'platform',
        response: {
          clientDataJSON: base64urlEncode(clientDataJSON),
          attestationObject: base64urlEncode(attestationObject),
          authenticatorData: base64urlEncode(authData),
          publicKey: base64urlEncode(publicKeySPKI),
          publicKeyAlgorithm: -7,
          transports: ['internal'],
        },
      };

      proxy.completeCreateRequest({
        requestId: details.requestId,
        responseJson: JSON.stringify({
          ...credential,
          clientExtensionResults: { credProps: { rk: true } },
        }),
      });
    } catch {
      proxy.completeCreateRequest({
        requestId: details.requestId,
        error: { name: 'NotAllowedError' },
      });
    }
  });

  proxy.onGetRequest.addListener(async (details: ProxyGetDetails) => {
    if (cancelledRequests.delete(details.requestId)) return;

    if (!handlers.isUnlocked()) {
      const result = await sendToActiveTab<{ unlocked: boolean }>({
        type: 'webauthn-unlock-prompt',
      });
      if (!result?.unlocked || !handlers.isUnlocked()) {
        proxy.completeGetRequest({
          requestId: details.requestId,
          error: { name: 'NotAllowedError', message: 'Vault is locked' },
        });
        return;
      }
    }

    try {
      const options = JSON.parse(details.requestDetailsJson);
      const origin = options.origin ?? (await getActiveTabOrigin());
      const rpId = options.rpId ?? (origin ? new URL(origin).hostname : '');
      const challenge =
        typeof options.challenge === 'string'
          ? options.challenge
          : base64urlEncode(new Uint8Array(options.challenge));

      const allPasskeys = handlers.getPasskeys();
      const rpMatches = allPasskeys.filter((pk) => pk.rpId === rpId);

      let matches = rpMatches;
      if (options.allowCredentials?.length) {
        const allowedIds = new Set(options.allowCredentials.map((c: { id: string }) => c.id));
        matches = rpMatches.filter((pk) => allowedIds.has(pk.credentialId));
      }

      if (matches.length === 0) {
        proxy.completeGetRequest({
          requestId: details.requestId,
          error: { name: 'NotAllowedError', message: 'No matching passkeys' },
        });
        return;
      }

      let match: (typeof matches)[0];

      if (matches.length > 1) {
        const pickerResult = await sendToActiveTab<{ selected: { credentialId: string } | null }>({
          type: 'webauthn-pick-passkey',
          passkeys: matches.map((m) => ({
            credentialId: m.credentialId,
            userName: m.userName,
            userDisplayName: m.userName,
            rpName: m.rpName,
          })),
        });

        if (!pickerResult?.selected) {
          proxy.completeGetRequest({
            requestId: details.requestId,
            error: { name: 'NotAllowedError', message: 'User cancelled' },
          });
          return;
        }

        const picked = matches.find((m) => m.credentialId === pickerResult.selected!.credentialId);
        if (!picked) {
          proxy.completeGetRequest({
            requestId: details.requestId,
            error: { name: 'NotAllowedError' },
          });
          return;
        }
        match = picked;
      } else {
        match = matches[0];

        const consent = await sendToActiveTab<{ confirmed: boolean }>({
          type: 'webauthn-get-consent',
          params: {
            rpName: match.rpName,
            rpId,
            userName: match.userName,
            userDisplayName: match.userName,
            credentialId: match.credentialId,
          },
        });

        if (!consent?.confirmed) {
          proxy.completeGetRequest({
            requestId: details.requestId,
            error: { name: 'NotAllowedError', message: 'User denied' },
          });
          return;
        }
      }

      if (cancelledRequests.delete(details.requestId)) return;

      if (!match.privateKey) {
        proxy.completeGetRequest({
          requestId: details.requestId,
          error: { name: 'NotAllowedError' },
        });
        return;
      }

      const privKeyBytes = base64urlDecode(match.privateKey);
      const privKey = await importPrivateKey(privKeyBytes);
      const newCounter = match.counter + 1;

      const rpIdHash = await hashRpId(rpId);
      const authData = createAuthenticatorData(rpIdHash, newCounter);
      const clientDataJSON = buildClientDataJSON('webauthn.get', challenge, origin);
      const clientDataHash = new Uint8Array(
        await crypto.subtle.digest('SHA-256', clientDataJSON.buffer as ArrayBuffer)
      );
      const signatureRaw = await signChallenge(privKey, authData, clientDataHash);
      const signature = p1363ToDer(signatureRaw);

      const now = new Date().toISOString();
      handlers.persistCounter(match.credentialId, newCounter, now);

      const credential: SerializedCredential = {
        id: match.credentialId,
        rawId: match.credentialId,
        type: 'public-key',
        authenticatorAttachment: 'platform',
        response: {
          clientDataJSON: base64urlEncode(clientDataJSON),
          authenticatorData: base64urlEncode(authData),
          signature: base64urlEncode(signature),
          userHandle: match.userId,
        },
      };

      proxy.completeGetRequest({
        requestId: details.requestId,
        responseJson: JSON.stringify({
          ...credential,
          clientExtensionResults: {},
        }),
      });
    } catch {
      proxy.completeGetRequest({
        requestId: details.requestId,
        error: { name: 'NotAllowedError' },
      });
    }
  });

  proxy.onRequestCanceled.addListener((requestId: number) => {
    cancelledRequests.add(requestId);
    setTimeout(() => cancelledRequests.delete(requestId), 5000);
  });

  return true;
}

export function detachWebAuthnProxy(): void {
  if (!proxyActive) return;
  const proxy = (chrome as unknown as { webAuthenticationProxy?: WebAuthenticationProxy })
    .webAuthenticationProxy;
  if (proxy) {
    try {
      proxy.detach();
    } catch {
      /* */
    }
  }
  proxyActive = false;
}
