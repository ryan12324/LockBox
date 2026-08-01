export const ANDROID_APP_URI_PREFIX = 'androidapp://';

const ANDROID_PACKAGE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/i;

function extractAndroidPackageCandidate(value: string): string | null {
  const input = value.trim();
  if (!input) return null;

  if (/^androidapp:\/\//i.test(input)) {
    try {
      const uri = new URL(input);
      if (
        uri.protocol !== 'androidapp:' ||
        uri.username ||
        uri.password ||
        uri.port ||
        uri.search ||
        uri.hash ||
        (uri.pathname && uri.pathname !== '/')
      ) {
        return null;
      }
      return uri.hostname;
    } catch {
      return null;
    }
  }

  if (/^https:\/\//i.test(input)) {
    try {
      const uri = new URL(input);
      if (
        uri.protocol !== 'https:' ||
        uri.username ||
        uri.password ||
        uri.port ||
        uri.search ||
        uri.hash ||
        (uri.pathname && uri.pathname !== '/')
      ) {
        return null;
      }
      return uri.hostname;
    } catch {
      return null;
    }
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(input)) return null;
  return input.replace(/^\/+|\/+$/g, '');
}

/** Convert a package name, canonical app URI, or HTTPS-shaped package link to androidapp://. */
export function normalizeAndroidAppUri(value: string): string | null {
  const packageName = extractAndroidPackageCandidate(value)?.toLowerCase();
  if (
    !packageName ||
    packageName.length > 255 ||
    !ANDROID_PACKAGE_PATTERN.test(packageName)
  ) {
    return null;
  }
  return `${ANDROID_APP_URI_PREFIX}${packageName}`;
}

/** True only for the explicit Android application URI scheme. */
export function isAndroidAppUri(value: string): boolean {
  return /^androidapp:\/\//i.test(value.trim()) && normalizeAndroidAppUri(value) !== null;
}

export function getAndroidAppPackageName(value: string): string | null {
  if (!isAndroidAppUri(value)) return null;
  return normalizeAndroidAppUri(value)?.slice(ANDROID_APP_URI_PREFIX.length) ?? null;
}

/** Canonicalize explicit application URIs while preserving normal website entries. */
export function normalizeLoginUriForStorage(value: string): string {
  const input = value.trim();
  if (!/^androidapp:/i.test(input)) return input;
  return normalizeAndroidAppUri(input) ?? input;
}

/** Validate only reserved application URI syntax; other URI handling remains backwards compatible. */
export function getLoginUriValidationError(value: string): string | null {
  const input = value.trim();
  if (!input || !/^androidapp:/i.test(input)) return null;
  if (normalizeAndroidAppUri(input)) return null;
  return 'Android app URIs must use androidapp:// followed by a package name, for example androidapp://android.octopusenergy.octopus.energy';
}

/** Return a safe navigable website target. Application URIs intentionally have no browser href. */
export function getLoginUriHref(value: string): string | null {
  const input = value.trim();
  if (!input || /^androidapp:/i.test(input)) return null;
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const uri = new URL(candidate);
    const host = uri.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (uri.protocol === 'https:' || (uri.protocol === 'http:' && loopback)) return uri.href;
  } catch {
    // Invalid and unsupported values remain copyable but are never opened.
  }
  return null;
}
