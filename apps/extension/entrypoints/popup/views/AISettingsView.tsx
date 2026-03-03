import React, { useState, useEffect } from 'react';
import { Button, Input, Select } from '@lockbox/design';
import {
  loadFeatureFlags,
  saveFeatureFlags,
  getProviderConfig,
  setProviderConfig,
  testProviderConnection,
} from '@lockbox/ai';
import type { AIFeatureFlags, AIProviderConfig, AIProvider } from '@lockbox/types';

export function AISettingsView({ onBack }: { onBack: () => void }) {
  const [flags, setFlags] = useState<AIFeatureFlags | null>(null);
  const [provider, setProvider] = useState<AIProvider>('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [savedProvider, setSavedProvider] = useState<AIProviderConfig | undefined>(undefined);

  useEffect(() => {
    setFlags(loadFeatureFlags());
    const config = getProviderConfig('openrouter');
    if (config) {
      setProvider(config.provider);
      setSavedProvider(config);
    } else {
      const otherConfigs = ['openai', 'anthropic', 'google', 'ollama', 'vercel']
        .map((p) => getProviderConfig(p as AIProvider))
        .filter(Boolean);
      if (otherConfigs.length > 0) {
        setProvider(otherConfigs[0]!.provider);
        setSavedProvider(otherConfigs[0]);
      }
    }
  }, []);

  useEffect(() => {
    if (flags) {
      saveFeatureFlags(flags);
    }
  }, [flags]);

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const p = e.target.value as AIProvider;
    setProvider(p);
    const config = getProviderConfig(p);
    setSavedProvider(config);
    setApiKey('');
    setTestResult(null);
  };

  const handleTestAndSave = async () => {
    if (provider !== 'ollama' && !apiKey && !savedProvider?.apiKey) {
      setTestResult({ success: false, error: 'API key is required' });
      return;
    }

    setTesting(true);
    setTestResult(null);
    const config: AIProviderConfig = {
      provider,
      apiKey: apiKey || savedProvider?.apiKey,
      enabled: true,
    };

    try {
      const result = await testProviderConnection(config);
      setTestResult(result);
      if (result.success) {
        setProviderConfig(config);
        setSavedProvider(config);
        setApiKey('');
      }
    } catch (err) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const toggleFlag = (key: keyof AIFeatureFlags) => {
    if (!flags) return;
    setFlags({ ...flags, [key]: !flags[key] });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-border)]">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ←
        </Button>
        <span className="text-sm font-semibold text-[var(--color-text)]">AI Settings</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        <div>
          <h3 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wider mb-2">
            Features
          </h3>
          <div className="flex flex-col gap-2">
            {flags &&
              [
                {
                  key: 'passwordHealth',
                  label: 'Password Health',
                  desc: 'Local security analysis',
                },
                {
                  key: 'breachMonitoring',
                  label: 'Breach Monitoring',
                  desc: 'Background HIBP checks',
                },
                { key: 'smartAutofill', label: 'Smart Autofill', desc: 'ML form field detection' },
              ].map((f) => (
                <label key={f.key} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={flags[f.key as keyof AIFeatureFlags] as boolean}
                    onChange={() => toggleFlag(f.key as keyof AIFeatureFlags)}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm text-[var(--color-text)] font-medium">{f.label}</div>
                    <div className="text-xs text-[var(--color-text-tertiary)]">{f.desc}</div>
                  </div>
                </label>
              ))}
          </div>
        </div>

        <div className="border-t border-[var(--color-border)] pt-4">
          <h3 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wider mb-2">
            LLM Provider
          </h3>
          <div className="flex flex-col gap-3">
            <Select
              label="Provider"
              value={provider}
              onChange={handleProviderChange}
              options={[
                { value: 'openrouter', label: 'OpenRouter' },
                { value: 'openai', label: 'OpenAI' },
                { value: 'anthropic', label: 'Anthropic' },
                { value: 'google', label: 'Google' },
                { value: 'ollama', label: 'Ollama (Local)' },
                { value: 'vercel', label: 'Workers AI / Vercel' },
              ]}
            />

            {provider !== 'ollama' && (
              <Input
                type="password"
                label={`API Key ${savedProvider?.apiKey ? '(Saved)' : ''}`}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={savedProvider?.apiKey ? '••••••••••••' : 'sk-...'}
              />
            )}

            {testResult && (
              <div
                className={`p-2 rounded-[var(--radius-sm)] text-xs border ${testResult.success ? 'bg-[var(--color-success-subtle)] border-[var(--color-success)] text-[var(--color-success)]' : 'bg-[var(--color-error-subtle)] border-[var(--color-error)] text-[var(--color-error)]'}`}
              >
                {testResult.success ? '✓ Connection successful' : `✕ ${testResult.error}`}
              </div>
            )}

            <Button
              variant="primary"
              size="sm"
              onClick={handleTestAndSave}
              disabled={testing}
              style={{ width: '100%' }}
            >
              {testing ? 'Testing...' : 'Test & Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
