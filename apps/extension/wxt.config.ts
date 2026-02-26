import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Lockbox Password Manager',
    description: 'Zero-knowledge self-hosted password manager',
    version: '0.0.1',
    permissions: ['storage', 'activeTab', 'alarms', 'scripting'],
    host_permissions: ['<all_urls>'],
  },
  vite: () => ({
    resolve: {
      alias: {
        // Ensure workspace packages resolve correctly
      },
    },
  }),
});
