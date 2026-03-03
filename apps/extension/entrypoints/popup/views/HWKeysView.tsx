import React, { useState, useEffect } from 'react';
import { Button, Card } from '@lockbox/design';
import { sendMessage } from './shared.js';

export function HardwareKeyView({ onBack }: { onBack: () => void }) {
  const [keys, setKeys] = useState<Array<{ id: string; keyType: string; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    sendMessage<{
      success: boolean;
      keys?: Array<{ id: string; keyType: string; createdAt: string }>;
    }>({ type: 'list-hardware-keys' })
      .then((res) => {
        if (res.success && res.keys) setKeys(res.keys);
      })
      .catch(() => setError('Failed to load hardware keys'))
      .finally(() => setLoading(false));
  }, []);

  async function handleRegister() {
    setRegistering(true);
    setError('');
    setSuccess('');
    try {
      const result = await sendMessage<{ success: boolean; keyId?: string; error?: string }>({
        type: 'register-hardware-key',
      });
      if (result.success && result.keyId) {
        setKeys((prev) => [
          ...prev,
          { id: result.keyId!, keyType: 'fido2', createdAt: new Date().toISOString() },
        ]);
        setSuccess('Hardware key registered successfully');
      } else {
        setError(result.error ?? 'Registration failed');
      }
    } catch {
      setError('Registration failed');
    } finally {
      setRegistering(false);
    }
  }

  async function handleRemove(keyId: string) {
    setRemovingId(keyId);
    setError('');
    try {
      const result = await sendMessage<{ success: boolean; error?: string }>({
        type: 'remove-hardware-key',
        keyId,
      });
      if (result.success) {
        setKeys((prev) => prev.filter((k) => k.id !== keyId));
        setSuccess('Key removed');
      } else {
        setError(result.error ?? 'Failed to remove key');
      }
    } catch {
      setError('Failed to remove key');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-border)]">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ←
        </Button>
        <span className="text-sm font-semibold text-[var(--color-text)]">🔑 Hardware Keys</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {error && (
          <div className="px-3 py-2 bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-sm)] text-[var(--color-error)] text-xs">
            {error}
          </div>
        )}
        {success && (
          <div className="px-3 py-2 bg-[var(--color-success-subtle)] border border-[var(--color-success)] rounded-[var(--radius-sm)] text-[var(--color-success)] text-xs">
            {success}
          </div>
        )}

        <p className="text-xs text-[var(--color-text-tertiary)]">
          Register a hardware security key (YubiKey, etc.) for passwordless unlock.
        </p>

        <Button
          variant="primary"
          size="sm"
          onClick={handleRegister}
          disabled={registering}
          style={{ width: '100%' }}
        >
          {registering ? 'Touch your key...' : '+ Register New Key'}
        </Button>

        {loading ? (
          <div className="text-center text-[var(--color-text-tertiary)] text-xs mt-4">
            Loading keys...
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center text-[var(--color-text-tertiary)] text-xs mt-4">
            No hardware keys registered
          </div>
        ) : (
          <div className="flex flex-col gap-2 mt-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
              Registered Keys
            </div>
            {keys.map((key) => (
              <Card key={key.id} variant="surface" padding="sm">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-[var(--color-text)] font-medium truncate">
                      {key.keyType === 'yubikey-piv' ? 'YubiKey PIV' : 'FIDO2 Key'}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-tertiary)]">
                      Added {new Date(key.createdAt).toLocaleDateString()}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-tertiary)] font-mono truncate">
                      {key.id.slice(0, 16)}...
                    </div>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleRemove(key.id)}
                    disabled={removingId === key.id}
                    className="shrink-0 ml-2"
                  >
                    {removingId === key.id ? '...' : 'Remove'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
