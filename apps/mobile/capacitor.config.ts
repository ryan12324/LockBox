import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.lockbox.app',
  appName: 'Lockbox',
  webDir: '../web/dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Network: {
      // Use Capacitor Network plugin for connectivity checks
    },
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
