import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.lockbox.app',
  appName: 'Authwell',
  webDir: '../web/dist',
  // Native bridge arguments can contain decrypted vault fields during an
  // unlocked index refresh. Never echo those payloads to device logs.
  loggingBehavior: 'none',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorHttp: {
      // Native networking lets a self-hosted mobile app connect to its chosen
      // Lockbox origin without requiring every API deployment to allow the
      // WebView's synthetic local origin in CORS.
      enabled: true,
    },
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
