/**
 * Network connectivity monitor — wraps Capacitor Network plugin.
 *
 * Provides a reactive way to track network status and trigger
 * sync when connectivity is restored.
 */

/** Network status representation */
export interface NetworkStatus {
  connected: boolean;
  connectionType: 'wifi' | 'cellular' | 'none' | 'unknown';
}

/** Callback for network status changes */
export type NetworkStatusListener = (status: NetworkStatus) => void;

/**
 * NetworkMonitor — tracks connectivity and notifies listeners.
 *
 * Usage:
 *   const monitor = new NetworkMonitor();
 *   monitor.addListener((status) => {
 *     if (status.connected) performSync();
 *   });
 *   await monitor.start();
 */
export class NetworkMonitor {
  private listeners: NetworkStatusListener[] = [];
  private currentStatus: NetworkStatus = {
    connected: true,
    connectionType: 'unknown',
  };
  private removePluginListener: (() => void) | null = null;

  /** Get current network status */
  getStatus(): NetworkStatus {
    return { ...this.currentStatus };
  }

  /** Register a listener for network status changes */
  addListener(listener: NetworkStatusListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Start monitoring network status using Capacitor Network plugin */
  async start(): Promise<void> {
    try {
      // Dynamic import to avoid issues in test environments
      const { Network } = await import('@capacitor/network');

      // Get initial status
      const status = await Network.getStatus();
      this.currentStatus = {
        connected: status.connected,
        connectionType: status.connectionType as NetworkStatus['connectionType'],
      };

      // Listen for changes
      const handle = await Network.addListener('networkStatusChange', (status) => {
        this.currentStatus = {
          connected: status.connected,
          connectionType: status.connectionType as NetworkStatus['connectionType'],
        };
        this.notifyListeners();
      });

      this.removePluginListener = () => handle.remove();
    } catch {
      // Fallback: assume connected (web environment or test)
      this.currentStatus = { connected: true, connectionType: 'unknown' };
    }
  }

  /** Stop monitoring network status */
  stop(): void {
    if (this.removePluginListener) {
      this.removePluginListener();
      this.removePluginListener = null;
    }
    this.listeners = [];
  }

  /** Update status externally (useful for testing) */
  setStatus(status: NetworkStatus): void {
    this.currentStatus = { ...status };
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const status = this.getStatus();
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}
