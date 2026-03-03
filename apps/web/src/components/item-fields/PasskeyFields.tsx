import React from 'react';
import { Button, Input, Textarea } from '@lockbox/design';

export interface PasskeyFieldsProps {
  mode: 'view' | 'edit' | 'add';
  rpId: string;
  setRpId: (v: string) => void;
  rpName: string;
  setRpName: (v: string) => void;
  passkeyUserName: string;
  setPasskeyUserName: (v: string) => void;
  passkeyUserId: string;
  setPasskeyUserId: (v: string) => void;
  credentialId: string;
  setCredentialId: (v: string) => void;
  publicKey: string;
  setPublicKey: (v: string) => void;
  counter: number;
  setCounter: (v: number) => void;
  passkeyCreatedAt?: string;
  passkeyTransports?: string[];
  copiedField: string | null;
  copyToClipboard: (text: string, field: string, element?: HTMLElement | null) => void;
}

export default function PasskeyFields({
  mode,
  rpId,
  setRpId,
  rpName,
  setRpName,
  passkeyUserName,
  setPasskeyUserName,
  passkeyUserId,
  setPasskeyUserId,
  credentialId,
  setCredentialId,
  publicKey,
  setPublicKey,
  counter,
  setCounter,
  passkeyCreatedAt,
  passkeyTransports,
  copiedField,
  copyToClipboard,
}: PasskeyFieldsProps) {
  if (mode === 'view') {
    return (
      <div className="space-y-4">
        {rpName && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Relying Party
            </span>
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <div>
                <span className="text-sm font-medium text-[var(--color-text)]">{rpName}</span>
                <span className="text-xs text-[var(--color-text-tertiary)] ml-2">{rpId}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => copyToClipboard(rpId, 'rpId', e.currentTarget)}
                style={{ padding: '6px', minHeight: 'auto' }}
              >
                {copiedField === 'rpId' ? '✓' : '📋'}
              </Button>
            </div>
          </div>
        )}
        {passkeyUserName && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              User
            </span>
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <div>
                <span className="text-sm text-[var(--color-text)]">{passkeyUserName}</span>
                {passkeyUserId && (
                  <span className="text-xs text-[var(--color-text-tertiary)] ml-2">
                    ({passkeyUserId})
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => copyToClipboard(passkeyUserName, 'userName', e.currentTarget)}
                style={{ padding: '6px', minHeight: 'auto' }}
              >
                {copiedField === 'userName' ? '✓' : '📋'}
              </Button>
            </div>
          </div>
        )}
        {credentialId && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Credential ID
            </span>
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <span className="text-xs font-mono text-[var(--color-text)] truncate max-w-[300px]">
                {credentialId}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => copyToClipboard(credentialId, 'credId', e.currentTarget)}
                style={{ padding: '6px', minHeight: 'auto' }}
              >
                {copiedField === 'credId' ? '✓' : '📋'}
              </Button>
            </div>
          </div>
        )}
        {publicKey && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Public Key
            </span>
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <span className="text-xs font-mono text-[var(--color-text)] truncate max-w-[300px]">
                {publicKey.length > 40 ? publicKey.slice(0, 40) + '…' : publicKey}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => copyToClipboard(publicKey, 'pubKey', e.currentTarget)}
                style={{ padding: '6px', minHeight: 'auto' }}
              >
                {copiedField === 'pubKey' ? '✓' : '📋'}
              </Button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Counter
            </span>
            <div className="p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <span className="text-sm font-mono text-[var(--color-text)]">{counter}</span>
            </div>
          </div>
          {passkeyCreatedAt && (
            <div>
              <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
                Created
              </span>
              <div className="p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
                <span className="text-sm text-[var(--color-text)]">
                  {new Date(passkeyCreatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          )}
        </div>
        {passkeyTransports && passkeyTransports.length > 0 && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Transports
            </span>
            <div className="p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <span className="text-sm text-[var(--color-text)]">
                {passkeyTransports.join(', ')}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4 border-t border-[var(--color-border)]">
      <h3 className="text-sm font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
        Passkey Details
      </h3>
      <p className="text-xs text-[var(--color-text-tertiary)]">
        Passkeys are typically created by the browser extension. Use this form to import from other
        managers.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Relying Party ID *"
          type="text"
          value={rpId}
          onChange={(e) => setRpId(e.target.value)}
          placeholder="example.com"
        />
        <Input
          label="Relying Party Name *"
          type="text"
          value={rpName}
          onChange={(e) => setRpName(e.target.value)}
          placeholder="Example"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="User Name *"
          type="text"
          value={passkeyUserName}
          onChange={(e) => setPasskeyUserName(e.target.value)}
          placeholder="user@example.com"
        />
        <Input
          label="User ID"
          type="text"
          value={passkeyUserId}
          onChange={(e) => setPasskeyUserId(e.target.value)}
        />
      </div>
      <Input
        label="Credential ID"
        type="text"
        value={credentialId}
        onChange={(e) => setCredentialId(e.target.value)}
        style={{ fontFamily: 'monospace', fontSize: 'var(--font-size-xs)' }}
      />
      <Textarea
        label="Public Key"
        value={publicKey}
        onChange={(e) => setPublicKey(e.target.value)}
        rows={3}
        style={{ fontFamily: 'monospace', fontSize: 'var(--font-size-xs)' }}
        resize="none"
      />
      <Input
        label="Counter"
        type="text"
        value={counter.toString()}
        onChange={(e) => setCounter(Number(e.target.value) || 0)}
        style={{ width: '8rem' }}
      />
    </div>
  );
}
