import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AIProvider, AIProviderConfig, AIFeatureFlags } from '@lockbox/types';
import {
  loadFeatureFlags,
  saveFeatureFlags,
  DEFAULT_AI_FLAGS,
  getAllProviderConfigs,
  setProviderConfig,
  removeProviderConfig,
  testProviderConnection,
} from '@lockbox/ai';
import { Button, Input, Card } from '@lockbox/design';

const PROVIDERS: { id: AIProvider; name: string; description: string; requiresKey: boolean }[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access 100+ models through a single API',
    requiresKey: true,
  },
  { id: 'openai', name: 'OpenAI', description: 'GPT-4o, GPT-4o-mini', requiresKey: true },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 3.5 Sonnet, Claude 3 Opus',
    requiresKey: true,
  },
  { id: 'google', name: 'Google', description: 'Gemini Pro, Gemini Flash', requiresKey: true },
  {
    id: 'vercel',
    name: 'Vercel AI Gateway',
    description: 'Unified gateway to multiple providers',
    requiresKey: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Run models locally — fully offline',
    requiresKey: false,
  },
];

const FEATURE_LABELS: {
  key: keyof AIFeatureFlags;
  label: string;
  description: string;
  phase: string;
}[] = [
  {
    key: 'passwordHealth',
    label: 'Password Health',
    description: 'Analyze vault for weak, reused, and old passwords',
    phase: '1',
  },
  {
    key: 'breachMonitoring',
    label: 'Breach Monitoring',
    description: 'Check passwords against HIBP every 24 hours',
    phase: '1',
  },
  {
    key: 'smartAutofill',
    label: 'Smart Autofill',
    description: 'ML-based form field classification',
    phase: '1',
  },
  {
    key: 'semanticSearch',
    label: 'Semantic Search',
    description: 'Natural language vault search',
    phase: '2',
  },
  {
    key: 'phishingDetection',
    label: 'Phishing Detection',
    description: 'Warn before entering credentials on suspicious sites',
    phase: '2',
  },
  {
    key: 'autoCategorization',
    label: 'Auto-Categorization',
    description: 'Suggest tags and folders for vault items',
    phase: '2',
  },
  {
    key: 'chatAssistant',
    label: 'Chat Assistant',
    description: 'Natural language vault management (requires BYOK)',
    phase: '3',
  },
  {
    key: 'securityCopilot',
    label: 'Security Copilot',
    description: 'Proactive security posture monitoring',
    phase: '3',
  },
];

export default function AISettings() {
  const navigate = useNavigate();

  const [flags, setFlags] = useState<AIFeatureFlags>(DEFAULT_AI_FLAGS);

  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
    latencyMs?: number;
  } | null>(null);
  const [configuredProviders, setConfiguredProviders] = useState<AIProviderConfig[]>([]);

  useEffect(() => {
    setFlags(loadFeatureFlags());
    setConfiguredProviders(getAllProviderConfigs());
  }, []);

  useEffect(() => {
    saveFeatureFlags(flags);
  }, [flags]);

  function toggleFlag(key: keyof AIFeatureFlags) {
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSelectProvider(id: AIProvider) {
    setSelectedProvider(id);
    setApiKey('');
    setBaseUrl('');
    setModel('');
    setTestResult(null);

    const existing = configuredProviders.find((c) => c.provider === id);
    if (existing) {
      setBaseUrl(existing.baseUrl ?? '');
      setModel(existing.model ?? '');
    }
  }

  async function handleTestConnection() {
    if (!selectedProvider) return;

    const providerMeta = PROVIDERS.find((p) => p.id === selectedProvider);
    if (
      providerMeta?.requiresKey &&
      !apiKey &&
      !configuredProviders.find((c) => c.provider === selectedProvider)
    ) {
      setTestResult({ success: false, error: 'API key is required' });
      return;
    }

    setTesting(true);
    setTestResult(null);

    const config: AIProviderConfig = {
      provider: selectedProvider,
      apiKey: apiKey || undefined,
      baseUrl: baseUrl || undefined,
      model: model || undefined,
      enabled: true,
    };

    const result = await testProviderConnection(config);
    setTestResult(result);
    setTesting(false);
  }

  function handleSaveProvider() {
    if (!selectedProvider) return;

    const config: AIProviderConfig = {
      provider: selectedProvider,
      apiKey: apiKey || undefined,
      baseUrl: baseUrl || undefined,
      model: model || undefined,
      enabled: true,
    };

    setProviderConfig(config);
    setConfiguredProviders(getAllProviderConfigs());
    setSelectedProvider(null);
    setApiKey('');
    setBaseUrl('');
    setModel('');
    setTestResult(null);
  }

  function handleRemoveProvider(id: AIProvider) {
    removeProviderConfig(id);
    setConfiguredProviders(getAllProviderConfigs());
  }

  function handleClearAIData() {
    const keysToRemove = [
      'lockbox:ai:feature-flags',
      'lockbox:ai:providers',
      'lockbox:ai:embeddings',
      'lockbox:ai:breach-cache',
    ];
    for (const key of keysToRemove) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    setFlags({ ...DEFAULT_AI_FLAGS });
    setConfiguredProviders([]);
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">AI & Intelligence</h1>

        <div className="space-y-6">
          {/* Privacy Notice */}
          <Card
            variant="surface"
            padding="md"
            style={{ background: 'var(--color-aura-dim)', borderColor: 'var(--color-primary)' }}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0">🛡️</span>
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-primary)] mb-1">
                  Privacy-First AI
                </h2>
                <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">
                  Passwords, card numbers, and TOTP secrets{' '}
                  <strong className="text-[var(--color-text-secondary)]">never</strong> leave your
                  device. Health analysis and breach checking run entirely client-side. Chat
                  features use your own API keys (BYOK) — Lockbox servers never see your data or
                  your keys.
                </p>
              </div>
            </div>
          </Card>

          {/* Feature Toggles */}
          <Card variant="surface" padding="md">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Features</h2>
            <div className="space-y-3">
              {FEATURE_LABELS.map(({ key, label, description, phase }) => (
                <div key={key} className="flex items-center gap-3 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors">
                        {label}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-[var(--radius-full)] bg-[var(--color-surface)] text-[var(--color-text-tertiary)] font-mono">
                        P{phase}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                      {description}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => toggleFlag(key)}
                    style={{
                      position: 'relative',
                      width: 40,
                      height: 20,
                      padding: 0,
                      minHeight: 'auto',
                      borderRadius: 'var(--radius-full)',
                      background: flags[key]
                        ? 'var(--color-primary)'
                        : 'var(--color-surface-raised)',
                      border: 'none',
                      boxShadow: 'none',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 2,
                        left: 2,
                        width: 16,
                        height: 16,
                        background: 'white',
                        borderRadius: 'var(--radius-full)',
                        transition: 'transform 150ms ease',
                        transform: flags[key] ? 'translateX(20px)' : 'translateX(0)',
                      }}
                    />
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          {/* Provider Configuration */}
          <Card variant="surface" padding="md">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">
              LLM Provider (BYOK)
            </h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
              Configure your own API key for chat and copilot features. Keys are encrypted with your
              master key.
            </p>

            {configuredProviders.length > 0 && (
              <div className="space-y-2 mb-4">
                {configuredProviders.map((config) => {
                  const meta = PROVIDERS.find((p) => p.id === config.provider);
                  return (
                    <div
                      key={config.provider}
                      className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]"
                    >
                      <div>
                        <span className="text-sm font-medium text-[var(--color-text)]">
                          {meta?.name ?? config.provider}
                        </span>
                        {config.model && (
                          <span className="text-xs text-[var(--color-text-tertiary)] ml-2">
                            ({config.model})
                          </span>
                        )}
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-[var(--radius-full)] bg-[var(--color-success-subtle)] text-[var(--color-success)]">
                          Active
                        </span>
                      </div>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleRemoveProvider(config.provider)}
                      >
                        Remove
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {!selectedProvider ? (
              <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map((p) => {
                  const isConfigured = configuredProviders.some((c) => c.provider === p.id);
                  return (
                    <Button
                      key={p.id}
                      variant="secondary"
                      onClick={() => handleSelectProvider(p.id)}
                      style={{
                        textAlign: 'left' as const,
                        display: 'flex',
                        flexDirection: 'column' as const,
                        alignItems: 'flex-start',
                        padding: 12,
                        ...(isConfigured
                          ? {
                              borderColor: 'var(--color-primary)',
                              background: 'var(--color-aura-dim)',
                            }
                          : {}),
                      }}
                      size="sm"
                    >
                      <span className="text-sm font-medium text-[var(--color-text)] block">
                        {p.name}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-tertiary)] block mt-0.5">
                        {p.description}
                      </span>
                    </Button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3 p-4 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--color-text)]">
                    {PROVIDERS.find((p) => p.id === selectedProvider)?.name}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedProvider(null);
                      setTestResult(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>

                {PROVIDERS.find((p) => p.id === selectedProvider)?.requiresKey && (
                  <Input
                    type="password"
                    label="API Key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                  />
                )}

                <Input
                  type="text"
                  label="Base URL (optional)"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={
                    selectedProvider === 'ollama'
                      ? 'http://localhost:11434'
                      : 'Leave empty for default'
                  }
                />

                <Input
                  type="text"
                  label="Model (optional)"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Leave empty for default"
                />

                {testResult && (
                  <div
                    className={`p-3 rounded-[var(--radius-md)] border text-xs ${
                      testResult.success
                        ? 'bg-[var(--color-success-subtle)] border-[var(--color-success)] text-[var(--color-success)]'
                        : 'bg-[var(--color-error-subtle)] border-[var(--color-error)] text-[var(--color-error)]'
                    }`}
                  >
                    {testResult.success
                      ? `✓ Connection successful${testResult.latencyMs ? ` (${testResult.latencyMs}ms)` : ''}`
                      : `✕ ${testResult.error}`}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={testing}
                  >
                    {testing ? 'Testing...' : 'Test Connection'}
                  </Button>
                  <Button variant="primary" size="sm" onClick={handleSaveProvider}>
                    Save Provider
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Data Management */}
          <Card variant="surface" padding="md">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Data Management</h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
              Clear cached AI data including embeddings, breach check results, and provider
              configurations.
            </p>
            <Button variant="danger" size="sm" onClick={handleClearAIData}>
              Clear All AI Data
            </Button>
          </Card>

          {/* About */}
          <Card variant="surface" padding="md">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">
              About AI Features
            </h2>
            <div className="space-y-2 text-xs text-[var(--color-text-tertiary)]">
              <p>
                <strong className="text-[var(--color-text-secondary)]">Phase 1:</strong> Password
                health, breach monitoring, smart autofill
              </p>
              <p>
                <strong className="text-[var(--color-text-secondary)]">Phase 2:</strong> Semantic
                search, phishing detection, auto-categorization
              </p>
              <p>
                <strong className="text-[var(--color-text-secondary)]">Phase 3:</strong> Chat
                assistant, security copilot
              </p>
              <p className="pt-2 border-t border-[var(--color-border)]">
                All AI features are privacy-first. Sensitive data never leaves your device. Chat and
                copilot features require your own API key (BYOK).
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
