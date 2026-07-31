import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'Lockbox Password Manager',
    description: 'Zero-knowledge self-hosted password manager',
    version: '1.0.0',
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      96: 'icon/96.png',
      128: 'icon/128.png',
    },
    permissions: ['storage', 'activeTab', 'alarms', 'webNavigation'],
    host_permissions: ['<all_urls>'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'lockbox-password-manager@ryan12324.github.io',
              strict_min_version: '140.0',
              data_collection_permissions: {
                required: [
                  'personallyIdentifyingInfo',
                  'financialAndPaymentInfo',
                  'authenticationInfo',
                  'personalCommunications',
                  'browsingActivity',
                ],
              },
            },
          },
        }
      : {}),
  }),
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        // Ensure workspace packages resolve correctly
      },
    },
  }),
});
