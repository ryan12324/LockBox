import React from 'react';
import { Button, Input } from '@lockbox/design';

export interface LoginFieldsProps {
  mode: 'view' | 'edit' | 'add';
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  uris: string[];
  setUris: (v: string[]) => void;
  totpSecret: string;
  setTotpSecret: (v: string) => void;
  totpCode: string;
  totpRemaining: number;
  copiedField: string | null;
  copyToClipboard: (text: string, field: string, element?: HTMLElement | null) => void;
  onGenerateAlias: () => void;
  onGeneratePassword: () => void;
  onRotatePassword: () => void;
}

export default function LoginFields({
  mode,
  username,
  setUsername,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  uris,
  setUris,
  totpSecret,
  setTotpSecret,
  totpCode,
  totpRemaining,
  copiedField,
  copyToClipboard,
  onGenerateAlias,
  onGeneratePassword,
  onRotatePassword,
}: LoginFieldsProps) {
  if (mode === 'view') {
    return (
      <div className="space-y-4">
        {username && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Username
            </span>
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <span className="text-sm font-mono text-[var(--color-text)] truncate">
                {username}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => copyToClipboard(username, 'user', e.currentTarget)}
                style={{ padding: '6px', minHeight: 'auto' }}
              >
                {copiedField === 'user' ? '✓' : '📋'}
              </Button>
            </div>
          </div>
        )}
        {password && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Password
            </span>
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <span className="text-sm font-mono text-[var(--color-text)] truncate">
                {showPassword ? password : '••••••••••••••••'}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ padding: '6px', minHeight: 'auto' }}
                >
                  {showPassword ? '👁️‍🗨️' : '👁️'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => copyToClipboard(password, 'pass', e.currentTarget)}
                  style={{ padding: '6px', minHeight: 'auto' }}
                >
                  {copiedField === 'pass' ? '✓' : '📋'}
                </Button>
              </div>
            </div>
          </div>
        )}
        {password && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onRotatePassword}
            style={{ width: '100%' }}
          >
            🔄 Rotate Password
          </Button>
        )}
        {totpSecret && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Authenticator Code
            </span>
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <span className="text-2xl font-mono tracking-widest text-[var(--color-primary)]">
                {totpCode || '------'}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--color-text-tertiary)]">{totpRemaining}s</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => copyToClipboard(totpCode, 'totp', e.currentTarget)}
                  style={{ padding: '6px', minHeight: 'auto' }}
                >
                  {copiedField === 'totp' ? '✓' : '📋'}
                </Button>
              </div>
            </div>
          </div>
        )}
        {uris.length > 0 && uris.some((u) => u.trim()) && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              URIs
            </span>
            <div className="space-y-2">
              {uris
                .filter((u) => u.trim())
                .map((uri, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]"
                  >
                    <a
                      href={uri.startsWith('http') ? uri : `https://${uri}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-[var(--color-primary)] hover:text-[var(--color-primary)] hover:underline truncate"
                    >
                      {uri}
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => copyToClipboard(uri, `uri-${idx}`, e.currentTarget)}
                      style={{ padding: '6px', minHeight: 'auto' }}
                    >
                      {copiedField === `uri-${idx}` ? '✓' : '📋'}
                    </Button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4 border-t border-[var(--color-border)]">
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Input
            label="Username / Email"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onGenerateAlias}
          title="Generate email alias"
        >
          🎭 Alias
        </Button>
      </div>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={onGeneratePassword}>
          Gen
        </Button>
      </div>
      <Input
        label="Authenticator Key (TOTP)"
        type="text"
        value={totpSecret}
        onChange={(e) => setTotpSecret(e.target.value)}
        placeholder="Base32 secret or otpauth:// URI"
      />
      <div>
        <span className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
          URIs
        </span>
        {uris.map((uri, idx) => (
          <div key={idx} className="flex gap-2 mb-2 items-end">
            <div className="flex-1">
              <Input
                type="text"
                value={uri}
                onChange={(e) => {
                  const newUris = [...uris];
                  newUris[idx] = e.target.value;
                  setUris(newUris);
                }}
                placeholder="https://example.com"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setUris(uris.filter((_, i) => i !== idx))}
              style={{ padding: '4px 8px', minHeight: 'auto', color: 'var(--color-error)' }}
            >
              ✕
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setUris([...uris, ''])}
          style={{ color: 'var(--color-primary)' }}
        >
          + Add URI
        </Button>
      </div>
    </div>
  );
}
