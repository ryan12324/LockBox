import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Icon, type IconName } from './Icon.js';

export const SITE_ICON_SUCCESS_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const SITE_ICON_FAILURE_TTL_MS = 6 * 60 * 60 * 1_000;
export const SITE_ICON_CACHE_MAX_ENTRIES = 256;

type SiteIconCacheEntry = {
  status: 'success' | 'failure';
  expiresAt: number;
};

/**
 * Resolution metadata stays memory-only so cached vault domains are never
 * written to plaintext client storage. The browser still caches image bytes.
 */
const siteIconCache = new Map<string, SiteIconCacheEntry>();

function pruneSiteIconCache(now: number): void {
  for (const [url, entry] of siteIconCache) {
    if (entry.expiresAt <= now) siteIconCache.delete(url);
  }

  while (siteIconCache.size > SITE_ICON_CACHE_MAX_ENTRIES) {
    const oldestUrl = siteIconCache.keys().next().value as string | undefined;
    if (!oldestUrl) break;
    siteIconCache.delete(oldestUrl);
  }
}

function recordSiteIconResult(
  url: string,
  status: SiteIconCacheEntry['status'],
  ttl: number,
  now: number
): void {
  siteIconCache.delete(url);
  siteIconCache.set(url, { status, expiresAt: now + ttl });
  pruneSiteIconCache(now);
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '::1' ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

function normalizeSiteSource(source: string): URL | null {
  let candidate = source.trim();
  if (!candidate) return null;

  candidate = candidate.replace(/^(https?:\/\/)\*\./i, '$1');
  if (candidate.startsWith('*.')) candidate = candidate.slice(2);
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;

  try {
    const url = new URL(candidate);
    if (!url.hostname || url.hostname.length > 253) return null;
    if (url.protocol === 'https:') return url;
    if (url.protocol === 'http:' && isLoopbackHostname(url.hostname)) return url;
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve privacy-minimised site icon URLs directly on the saved site.
 * Paths, queries, fragments, and embedded credentials are never forwarded.
 */
export function getSiteIconUrls(sources: readonly string[] | undefined): string[] {
  const origins = new Set<string>();
  for (const source of sources ?? []) {
    const site = normalizeSiteSource(source);
    if (!site) continue;
    origins.add(site.origin);
  }
  return [...origins].flatMap((origin) => [
    `${origin}/apple-touch-icon.png`,
    `${origin}/favicon.ico`,
  ]);
}

/** Prefer a known-good candidate and suppress known failures until expiry. */
export function getCachedSiteIconUrls(
  sources: readonly string[] | undefined,
  now = Date.now()
): string[] {
  pruneSiteIconCache(now);
  const successful: string[] = [];
  const unknown: string[] = [];

  for (const url of getSiteIconUrls(sources)) {
    const cached = siteIconCache.get(url);
    if (cached?.status === 'failure') continue;
    if (cached?.status === 'success') successful.push(url);
    else unknown.push(url);
  }

  return [...successful, ...unknown];
}

export function recordSiteIconSuccess(url: string, now = Date.now()): void {
  recordSiteIconResult(url, 'success', SITE_ICON_SUCCESS_TTL_MS, now);
}

export function recordSiteIconFailure(url: string, now = Date.now()): void {
  recordSiteIconResult(url, 'failure', SITE_ICON_FAILURE_TTL_MS, now);
}

export function clearSiteIconCache(): void {
  siteIconCache.clear();
}

export function getSiteFaviconUrl(sources: readonly string[] | undefined): string | null {
  return getSiteIconUrls(sources)[0] ?? null;
}

export function getEntryFaviconSources(entry: {
  type: string;
  uris?: readonly string[];
  rpId?: string;
}): string[] {
  if (entry.type === 'login') return [...(entry.uris ?? [])];
  if (entry.type === 'passkey' && entry.rpId) return [entry.rpId];
  return [];
}

export interface SiteFaviconProps {
  sources?: readonly string[];
  fallbackIcon?: IconName;
  size?: number;
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** A decorative site favicon with a local Iconify fallback while loading or unavailable. */
export function SiteFavicon({
  sources,
  fallbackIcon = 'world',
  size = 20,
  fill = false,
  className,
  style,
}: SiteFaviconProps) {
  const iconUrls = useMemo(() => getCachedSiteIconUrls(sources), [sources]);
  const iconUrlsKey = iconUrls.join('\n');
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const faviconUrl = iconUrls[candidateIndex] ?? null;

  useEffect(() => {
    setCandidateIndex(0);
    setImageState('loading');
  }, [iconUrlsKey]);

  return (
    <span
      className={['lb-site-favicon', className].filter(Boolean).join(' ')}
      style={{
        position: 'relative',
        width: fill ? '100%' : size,
        height: fill ? '100%' : size,
        display: 'inline-flex',
        flex: '0 0 auto',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: fill ? 'inherit' : undefined,
        overflow: fill ? 'hidden' : undefined,
        ...style,
      }}
      aria-hidden="true"
    >
      {imageState !== 'loaded' && <Icon name={fallbackIcon} size={size} />}
      {faviconUrl && imageState !== 'failed' && (
        <img
          src={faviconUrl}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => {
            recordSiteIconSuccess(faviconUrl);
            setImageState('loaded');
          }}
          onError={() => {
            recordSiteIconFailure(faviconUrl);
            if (candidateIndex + 1 < iconUrls.length) {
              setCandidateIndex((current) => current + 1);
              setImageState('loading');
            } else {
              setImageState('failed');
            }
          }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: fill ? 'cover' : 'contain',
            borderRadius: fill ? 'inherit' : Math.max(2, Math.round(size * 0.18)),
            background: 'var(--color-surface-raised)',
            opacity: imageState === 'loaded' ? 1 : 0,
          }}
        />
      )}
    </span>
  );
}
