import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.lockbox.app',
  appName: 'Lockbox',
  webDir: '../web/dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorHttp: {
      // Native networking lets a self-hosted Android app connect to its chosen
      // Lockbox origin without requiring every API deployment to allow the
      // WebView's synthetic https://localhost origin in CORS.
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
