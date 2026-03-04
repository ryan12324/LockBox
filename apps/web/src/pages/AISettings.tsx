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
    <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <h1
          style={{
            fontSize: 'var(--font-size-2xl)',
            fontWeight: 700,
            color: 'var(--color-text)',
            marginBottom: 20,
          }}
        >
          AI & Intelligence
        </h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card variant="frost" padding="lg" style={{ background: 'var(--color-aura-dim)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <span style={{ fontSize: 24, flexShrink: 0, lineHeight: 1 }}>🛡️</span>
              <div>
                <h2
                  style={{
                    fontSize: 'var(--font-size-base)',
                    fontWeight: 600,
                    color: 'var(--color-primary)',
                    marginBottom: 4,
                  }}
                >
                  Privacy-First AI
                </h2>
                <p
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-tertiary)',
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  Passwords, card numbers, and TOTP secrets{' '}
                  <strong style={{ color: 'var(--color-text-secondary)' }}>never</strong> leave your
                  device. Health analysis and breach checking run entirely client-side. Chat
                  features use your own API keys (BYOK) — Lockbox servers never see your data or
                  your keys.
                </p>
              </div>
            </div>
          </Card>

          <Card variant="surface" padding="lg">
            <h2
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: 600,
                color: 'var(--color-text)',
                marginBottom: 16,
              }}
            >
              Features
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {FEATURE_LABELS.map(({ key, label, description, phase }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 'var(--font-size-sm)',
                          fontWeight: 500,
                          color: 'var(--color-text)',
                        }}
                      >
                        {label}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-full)',
                          background: 'var(--color-surface-raised)',
                          color: 'var(--color-text-tertiary)',
                          fontFamily: 'var(--font-mono, monospace)',
                        }}
                      >
                        P{phase}
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-tertiary)',
                        marginTop: 2,
                        margin: 0,
                        marginBlockStart: 2,
                      }}
                    >
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

          <Card variant="surface" padding="lg">
            <h2
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: 600,
                color: 'var(--color-text)',
                marginBottom: 8,
              }}
            >
              LLM Provider (BYOK)
            </h2>
            <p
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-tertiary)',
                marginBottom: 20,
              }}
            >
              Configure your own API key for chat and copilot features. Keys are encrypted with your
              master key.
            </p>

            {configuredProviders.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {configuredProviders.map((config) => {
                  const meta = PROVIDERS.find((p) => p.id === config.provider);
                  return (
                    <div
                      key={config.provider}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 14,
                        background: 'var(--color-bg-subtle)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <div>
                        <span
                          style={{
                            fontSize: 'var(--font-size-sm)',
                            fontWeight: 500,
                            color: 'var(--color-text)',
                          }}
                        >
                          {meta?.name ?? config.provider}
                        </span>
                        {config.model && (
                          <span
                            style={{
                              fontSize: 'var(--font-size-sm)',
                              color: 'var(--color-text-tertiary)',
                              marginLeft: 8,
                            }}
                          >
                            ({config.model})
                          </span>
                        )}
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--color-success-subtle)',
                            color: 'var(--color-success)',
                          }}
                        >
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
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 10,
                }}
              >
                {PROVIDERS.map((p) => {
                  const isConfigured = configuredProviders.some((c) => c.provider === p.id);
                  return (
                    <Card
                      key={p.id}
                      variant={isConfigured ? 'raised' : 'surface'}
                      padding="md"
                      onClick={() => handleSelectProvider(p.id)}
                      style={{
                        cursor: 'pointer',
                        ...(isConfigured
                          ? {
                              boxShadow: `inset 0 0 0 2px var(--color-primary), var(--shadow-md)`,
                            }
                          : {}),
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          fontSize: 'var(--font-size-sm)',
                          fontWeight: 600,
                          color: 'var(--color-text)',
                        }}
                      >
                        {p.name}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 'var(--font-size-sm)',
                          color: 'var(--color-text-tertiary)',
                          marginTop: 4,
                        }}
                      >
                        {p.description}
                      </span>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card variant="surface" padding="lg">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 16,
                  }}
                >
                  <h3
                    style={{
                      fontSize: 'var(--font-size-base)',
                      fontWeight: 600,
                      color: 'var(--color-text)',
                    }}
                  >
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                      style={{
                        padding: 14,
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--font-size-sm)',
                        background: testResult.success
                          ? 'var(--color-success-subtle)'
                          : 'var(--color-error-subtle)',
                        color: testResult.success ? 'var(--color-success)' : 'var(--color-error)',
                      }}
                    >
                      {testResult.success
                        ? `✓ Connection successful${testResult.latencyMs ? ` (${testResult.latencyMs}ms)` : ''}`
                        : `✕ ${testResult.error}`}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
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
              </Card>
            )}
          </Card>

          <Card variant="surface" padding="lg">
            <h2
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: 600,
                color: 'var(--color-text)',
                marginBottom: 8,
              }}
            >
              Data Management
            </h2>
            <p
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-tertiary)',
                marginBottom: 16,
              }}
            >
              Clear cached AI data including embeddings, breach check results, and provider
              configurations.
            </p>
            <Button variant="danger" size="sm" onClick={handleClearAIData}>
              Clear All AI Data
            </Button>
          </Card>

          <Card variant="surface" padding="lg">
            <h2
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: 600,
                color: 'var(--color-text)',
                marginBottom: 16,
              }}
            >
              About AI Features
            </h2>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              <p style={{ margin: 0 }}>
                <strong style={{ color: 'var(--color-text-secondary)' }}>Phase 1:</strong> Password
                health, breach monitoring, smart autofill
              </p>
              <p style={{ margin: 0 }}>
                <strong style={{ color: 'var(--color-text-secondary)' }}>Phase 2:</strong> Semantic
                search, phishing detection, auto-categorization
              </p>
              <p style={{ margin: 0 }}>
                <strong style={{ color: 'var(--color-text-secondary)' }}>Phase 3:</strong> Chat
                assistant, security copilot
              </p>
              <div
                style={{
                  paddingTop: 10,
                  borderTop: '1px solid var(--color-border)',
                  marginTop: 4,
                }}
              >
                <p style={{ margin: 0 }}>
                  All AI features are privacy-first. Sensitive data never leaves your device. Chat
                  and copilot features require your own API key (BYOK).
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
