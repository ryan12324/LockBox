import type { RelayConfig, RelayStatus, ApiEndpoint } from '@lockbox/types';

export async function checkHealth(url: string, timeoutMs = 5000): Promise<RelayStatus> {
  const start = Date.now();
  const healthUrl = url.replace(/\/+$/, '') + '/api/health';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      return {
        available: false,
        latencyMs,
        lastChecked: new Date().toISOString(),
        error: `HTTP ${response.status}`,
      };
    }

    return {
      available: true,
      latencyMs,
      lastChecked: new Date().toISOString(),
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const error = err instanceof Error ? err.message : 'Unknown error';

    return {
      available: false,
      latencyMs,
      lastChecked: new Date().toISOString(),
      error,
    };
  }
}

export async function discoverEndpoint(config: RelayConfig): Promise<ApiEndpoint> {
  if (config.preferLocal && config.localUrl) {
    const localStatus = await checkHealth(config.localUrl);

    if (localStatus.available) {
      return {
        url: config.localUrl,
        source: 'local',
        latencyMs: localStatus.latencyMs,
      };
    }
  }

  if (config.publicUrl) {
    const publicStatus = await checkHealth(config.publicUrl);

    if (publicStatus.available) {
      return {
        url: config.publicUrl,
        source: 'public',
        latencyMs: publicStatus.latencyMs,
      };
    }
  }

  // If neither is available but we have a local URL and didn't try it yet
  if (!config.preferLocal && config.localUrl) {
    const localStatus = await checkHealth(config.localUrl);

    if (localStatus.available) {
      return {
        url: config.localUrl,
        source: 'local',
        latencyMs: localStatus.latencyMs,
      };
    }
  }

  // Fallback: return public URL even if unavailable, or local as last resort
  const fallbackUrl = config.publicUrl || config.localUrl;
  return {
    url: fallbackUrl,
    source: config.publicUrl ? 'public' : 'local',
  };
}

export function buildApiUrl(endpoint: ApiEndpoint, path: string): string {
  const base = endpoint.url.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : '/' + path;
  return base + cleanPath;
}

export function isLocalNetwork(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    // localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') {
      return true;
    }

    // 10.x.x.x
    if (hostname.startsWith('10.')) {
      return true;
    }

    // 192.168.x.x
    if (hostname.startsWith('192.168.')) {
      return true;
    }

    // 172.16.x.x - 172.31.x.x
    if (hostname.startsWith('172.')) {
      const parts = hostname.split('.');
      const second = parseInt(parts[1], 10);
      if (second >= 16 && second <= 31) {
        return true;
      }
    }

    // .local domains
    if (hostname.endsWith('.local')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
