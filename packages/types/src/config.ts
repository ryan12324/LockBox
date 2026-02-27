export interface RelayConfig {
  localUrl: string;
  publicUrl: string;
  tunnelId?: string;
  tunnelName?: string;
  preferLocal?: boolean;
  healthCheckIntervalMs?: number;
}

export interface RelayStatus {
  available: boolean;
  latencyMs?: number;
  lastChecked: string;
  error?: string;
}

export interface ApiEndpoint {
  url: string;
  source: 'local' | 'public' | 'custom';
  latencyMs?: number;
}
