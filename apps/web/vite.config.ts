import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {
  LOCKBOX_DISCOVERY_PATH,
  LOCKBOX_PRODUCT,
  LOCKBOX_PROTOCOL_VERSION,
  type LockboxDiscoveryDocument,
} from '@lockbox/types/discovery';

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function normalizeApiBaseUrl(value: string): string {
  if (!value.trim()) return '/';

  const url = new URL(value);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
    throw new Error('VITE_API_URL must use HTTPS (except for loopback development).');
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname && url.pathname !== '/')
  ) {
    throw new Error(
      'VITE_API_URL must be an origin without credentials, a path, query, or fragment.'
    );
  }
  return url.origin;
}

function lockboxDiscoveryPlugin(apiBaseUrl: string): Plugin {
  const document: LockboxDiscoveryDocument = {
    product: LOCKBOX_PRODUCT,
    protocolVersion: LOCKBOX_PROTOCOL_VERSION,
    apiBaseUrl,
  };
  const source = `${JSON.stringify(document, null, 2)}\n`;

  return {
    name: 'lockbox-instance-discovery',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        if (pathname !== LOCKBOX_DISCOVERY_PATH) {
          next();
          return;
        }
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(source);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: LOCKBOX_DISCOVERY_PATH.slice(1),
        source,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBaseUrl = normalizeApiBaseUrl(
    env.VITE_API_URL ?? (mode === 'production' ? 'https://api.authwell.app' : '')
  );

  return {
    plugins: [react(), tailwindcss(), lockboxDiscoveryPlugin(apiBaseUrl)],
    resolve: {
      // Bun keeps app and workspace-package dependencies isolated. Force every
      // shared component to use the web app's React instance so hooks resolve
      // against the renderer's dispatcher instead of a second bundled copy.
      dedupe: ['react', 'react-dom'],
    },
    build: { outDir: 'dist' },
  };
});
