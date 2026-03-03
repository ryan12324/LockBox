/**
 * WebAuthn interceptor — MAIN world content script.
 *
 * Runs in the page's JS context (world: "MAIN") to override
 * navigator.credentials.create() / .get() before any page scripts.
 * Browser-injected at document_start — no CSP issues, no race conditions.
 *
 * Communication: postMessage → content script (isolated world) → background.
 * SECURITY: Private keys NEVER enter this context.
 */

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',

  main() {
    'use strict';

    if (!navigator.credentials) return;

    const origCreate = navigator.credentials.create.bind(navigator.credentials);
    const origGet = navigator.credentials.get.bind(navigator.credentials);

    // ─── Helpers ─────────────────────────────────────────────────────────

    function toBytes(source: BufferSource): Uint8Array {
      if (source instanceof ArrayBuffer) return new Uint8Array(source);
      return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    }

    function bufToB64url(buf: BufferSource): string {
      const bytes = toBytes(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function b64urlToBuf(str: string): ArrayBuffer {
      let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4 !== 0) b64 += '=';
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer as ArrayBuffer;
    }

    function makeRequestId(): string {
      return 'lockbox-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    }

    // ─── Serialization ──────────────────────────────────────────────────

    interface SerializedCreateOpts {
      rp: { id?: string; name: string };
      user: { id: string; name: string; displayName: string };
      challenge: string;
      pubKeyCredParams: Array<{ type: string; alg: number }>;
      timeout?: number;
      excludeCredentials?: Array<{ id: string; type: string; transports?: string[] }>;
      authenticatorSelection?: Record<string, unknown>;
      attestation?: string;
    }

    interface SerializedGetOpts {
      challenge: string;
      rpId?: string;
      timeout?: number;
      allowCredentials?: Array<{ id: string; type: string; transports?: string[] }>;
      userVerification?: string;
    }

    function serializeCreateOptions(opts: CredentialCreationOptions): SerializedCreateOpts | null {
      const pk = opts.publicKey;
      if (!pk) return null;
      return {
        rp: { id: pk.rp.id, name: pk.rp.name },
        user: {
          id: bufToB64url(pk.user.id),
          name: pk.user.name,
          displayName: pk.user.displayName,
        },
        challenge: bufToB64url(pk.challenge),
        pubKeyCredParams: pk.pubKeyCredParams.map((p) => ({
          type: p.type,
          alg: p.alg,
        })),
        timeout: pk.timeout,
        excludeCredentials: (pk.excludeCredentials ?? []).map((c) => ({
          id: bufToB64url(c.id),
          type: c.type,
          transports: c.transports as string[] | undefined,
        })),
        authenticatorSelection: pk.authenticatorSelection as Record<string, unknown> | undefined,
        attestation: pk.attestation,
      };
    }

    function serializeGetOptions(opts: CredentialRequestOptions): SerializedGetOpts | null {
      const pk = opts.publicKey;
      if (!pk) return null;
      return {
        challenge: bufToB64url(pk.challenge),
        rpId: pk.rpId,
        timeout: pk.timeout,
        allowCredentials: (pk.allowCredentials ?? []).map((c) => ({
          id: bufToB64url(c.id),
          type: c.type,
          transports: c.transports as string[] | undefined,
        })),
        userVerification: pk.userVerification,
      };
    }

    // ─── Deserialization ────────────────────────────────────────────────

    interface CredentialData {
      id: string;
      rawId: string;
      type: string;
      authenticatorAttachment?: string;
      response: {
        clientDataJSON?: string;
        attestationObject?: string;
        authenticatorData?: string;
        signature?: string;
        userHandle?: string;
        publicKey?: string;
        publicKeyAlgorithm?: number;
        transports?: string[];
      };
    }

    function deserializeCredential(data: CredentialData): PublicKeyCredential {
      const isCreate = !!data.response.attestationObject;
      const response: Record<string, unknown> = {};

      if (data.response.clientDataJSON) {
        response.clientDataJSON = b64urlToBuf(data.response.clientDataJSON);
      }

      if (data.response.attestationObject) {
        response.attestationObject = b64urlToBuf(data.response.attestationObject);
        const authDataBuf = data.response.authenticatorData
          ? b64urlToBuf(data.response.authenticatorData)
          : new ArrayBuffer(0);
        const pubKeyBuf = data.response.publicKey ? b64urlToBuf(data.response.publicKey) : null;
        const pubKeyAlg = data.response.publicKeyAlgorithm ?? -7;
        const transports = data.response.transports ?? ['internal'];
        response.getAuthenticatorData = () => authDataBuf;
        response.getPublicKey = () => pubKeyBuf;
        response.getPublicKeyAlgorithm = () => pubKeyAlg;
        response.getTransports = () => transports;
      }

      if (data.response.authenticatorData && !data.response.attestationObject) {
        response.authenticatorData = b64urlToBuf(data.response.authenticatorData);
      }
      if (data.response.signature) {
        response.signature = b64urlToBuf(data.response.signature);
      }
      if (data.response.userHandle) {
        response.userHandle = b64urlToBuf(data.response.userHandle);
      }

      const cred: Record<string, unknown> = {
        id: data.id,
        rawId: b64urlToBuf(data.rawId),
        type: data.type || 'public-key',
        authenticatorAttachment: data.authenticatorAttachment || 'platform',
        response,
        getClientExtensionResults: () => (isCreate ? { credProps: { rk: true } } : {}),
        toJSON: () => {
          const json: Record<string, unknown> = {
            id: data.id,
            rawId: data.rawId,
            type: data.type || 'public-key',
            authenticatorAttachment: data.authenticatorAttachment || 'platform',
            clientExtensionResults: isCreate ? { credProps: { rk: true } } : {},
          };
          const resp: Record<string, unknown> = {};
          if (data.response.clientDataJSON) resp.clientDataJSON = data.response.clientDataJSON;
          if (data.response.attestationObject)
            resp.attestationObject = data.response.attestationObject;
          if (data.response.authenticatorData)
            resp.authenticatorData = data.response.authenticatorData;
          if (data.response.signature) resp.signature = data.response.signature;
          if (data.response.userHandle) resp.userHandle = data.response.userHandle;
          if (isCreate) {
            if (data.response.transports) resp.transports = data.response.transports;
            if (data.response.publicKey) resp.publicKey = data.response.publicKey;
            if (data.response.publicKeyAlgorithm !== undefined)
              resp.publicKeyAlgorithm = data.response.publicKeyAlgorithm;
          }
          json.response = resp;
          return json;
        },
      };

      // CRITICAL: prototype chain required for instanceof checks on RP sites
      if (typeof PublicKeyCredential !== 'undefined') {
        Object.setPrototypeOf(cred, PublicKeyCredential.prototype);
        if (isCreate && typeof AuthenticatorAttestationResponse !== 'undefined') {
          Object.setPrototypeOf(response, AuthenticatorAttestationResponse.prototype);
        } else if (!isCreate && typeof AuthenticatorAssertionResponse !== 'undefined') {
          Object.setPrototypeOf(response, AuthenticatorAssertionResponse.prototype);
        }
      }

      return cred as unknown as PublicKeyCredential;
    }

    // ─── Messaging ──────────────────────────────────────────────────────

    interface InterceptorResponse {
      type: string;
      requestId: string;
      credential?: CredentialData;
      error?: string;
      fallback?: boolean;
    }

    function waitForResponse(requestId: string, timeoutMs: number): Promise<InterceptorResponse> {
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          window.removeEventListener('message', handler);
          resolve({ type: 'lockbox-webauthn-response', requestId, fallback: true });
        }, timeoutMs || 30000);

        function handler(event: MessageEvent): void {
          if (event.source !== window) return;
          if (!event.data || event.data.type !== 'lockbox-webauthn-response') return;
          if (event.data.requestId !== requestId) return;
          clearTimeout(timer);
          window.removeEventListener('message', handler);
          resolve(event.data as InterceptorResponse);
        }
        window.addEventListener('message', handler);
      });
    }

    // ─── Overrides ──────────────────────────────────────────────────────

    navigator.credentials.create = function (
      options?: CredentialCreationOptions
    ): Promise<Credential | null> {
      if (!options?.publicKey) return origCreate(options);

      const serialized = serializeCreateOptions(options);
      if (!serialized) return origCreate(options);

      const requestId = makeRequestId();
      window.postMessage(
        {
          type: 'lockbox-webauthn-create',
          requestId,
          origin: window.location.origin,
          options: serialized,
        },
        '*'
      );

      const timeout = options.publicKey?.timeout ?? 60000;
      return waitForResponse(requestId, timeout).then((resp) => {
        if (resp.fallback || resp.error) return origCreate(options);
        if (resp.credential) return deserializeCredential(resp.credential);
        return origCreate(options);
      });
    };

    navigator.credentials.get = function (
      options?: CredentialRequestOptions
    ): Promise<Credential | null> {
      if (!options?.publicKey) return origGet(options);

      const serialized = serializeGetOptions(options);
      if (!serialized) return origGet(options);

      const requestId = makeRequestId();
      window.postMessage(
        {
          type: 'lockbox-webauthn-get',
          requestId,
          origin: window.location.origin,
          options: serialized,
        },
        '*'
      );

      const timeout = options.publicKey?.timeout ?? 60000;
      return waitForResponse(requestId, timeout).then((resp) => {
        if (resp.fallback || resp.error) return origGet(options);
        if (resp.credential) return deserializeCredential(resp.credential);
        return origGet(options);
      });
    };
  },
});
