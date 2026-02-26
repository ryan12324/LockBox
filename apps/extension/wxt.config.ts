import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Lockbox Password Manager',
    description: 'Zero-knowledge self-hosted password manager',
    version: '0.0.1',
    permissions: ['storage', 'activeTab', 'alarms', 'scripting', 'webNavigation'],
    host_permissions: ['<all_urls>'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        // Ensure workspace packages resolve correctly
      },
    },
  }),
});
