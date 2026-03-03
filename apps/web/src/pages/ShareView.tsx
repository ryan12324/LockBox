import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { redeemShareLink, getShareAuthToken } from '../lib/team-crypto.js';
import { Button, Input, Card, Badge, Textarea } from '@lockbox/design';
import type { VaultItem, LoginItem, SecureNoteItem, CardItem } from '@lockbox/types';

export default function ShareView() {
  const { shareId } = useParams<{ shareId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<VaultItem | null>(null);
  const [viewCount, setViewCount] = useState<number>(0);
  const [maxViews, setMaxViews] = useState<number>(0);

  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    // Force dark mode for this standalone view
    document.documentElement.classList.add('dark');
    document.body.classList.add('bg-gray-900');

    async function fetchSharedItem() {
      if (!shareId) {
        setError('Invalid share link format.');
        setLoading(false);
        return;
      }

      const encodedSecret = window.location.hash.slice(1);
      if (!encodedSecret) {
        setError('Invalid share link: missing secret key.');
        setLoading(false);
        return;
      }

      try {
        const authToken = await getShareAuthToken(encodedSecret);
        const response = await api.shareLinks.redeem(shareId, authToken);
        const decryptedItem = await redeemShareLink(encodedSecret, response.encryptedItem, shareId);

        setItem(decryptedItem);
        setViewCount(response.viewCount);
        setMaxViews(response.maxViews);
      } catch (err: unknown) {
        console.error('Share redemption error:', err);
        const message =
          err instanceof Error ? err.message : 'Failed to decrypt or load shared item.';
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    fetchSharedItem();
  }, [shareId]);

  async function copyToClipboard(text: string, field: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  const renderCopyButton = (text: string, field: string, title: string) => (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => copyToClipboard(text, field)}
      title={title}
    >
      {copiedField === field ? (
        <span className="text-xs font-medium text-[var(--color-success)]">Copied!</span>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
    </Button>
  );

  const renderLoginFields = (item: VaultItem) => {
    if (item.type !== 'login') return null;
    const loginItem = item as LoginItem;
    return (
      <>
        {loginItem.username && (
          <div className="flex items-center gap-2">
            <Input
              type="text"
              label="Username"
              readOnly
              value={loginItem.username}
              className="flex-1"
            />
            {renderCopyButton(loginItem.username, 'username', 'Copy username')}
          </div>
        )}
        {loginItem.password && (
          <div className="flex items-center gap-2">
            <Input
              type="password"
              label="Password"
              readOnly
              value={loginItem.password}
              className="flex-1"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            {renderCopyButton(loginItem.password, 'password', 'Copy password')}
          </div>
        )}
        {loginItem.totp && (
          <div className="flex items-center gap-2">
            <Input
              type="text"
              label="TOTP Secret"
              readOnly
              value={loginItem.totp}
              className="flex-1"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            {renderCopyButton(loginItem.totp, 'totp', 'Copy TOTP')}
          </div>
        )}
        {loginItem.uris && loginItem.uris.length > 0 && loginItem.uris[0] && (
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              URLs
            </label>
            <div className="space-y-2">
              {loginItem.uris.filter(Boolean).map((uri: string, idx: number) => (
                <div key={idx} className="flex items-center gap-2">
                  <a
                    href={uri.startsWith('http') ? uri : `https://${uri}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] hover:bg-[var(--color-surface-raised)] transition-colors truncate"
                  >
                    {uri}
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  };

  const renderNoteFields = (item: VaultItem) => {
    if (item.type !== 'note') return null;
    const noteItem = item as SecureNoteItem;
    return (
      <Textarea
        label="Content"
        readOnly
        value={noteItem.content || ''}
        rows={10}
        resize="none"
        style={{
          whiteSpace: 'pre-wrap',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-sm)',
        }}
      />
    );
  };

  const renderCardFields = (item: VaultItem) => {
    if (item.type !== 'card') return null;
    const cardItem = item as CardItem;
    return (
      <div className="space-y-4">
        {cardItem.cardholderName && (
          <Input type="text" label="Cardholder Name" readOnly value={cardItem.cardholderName} />
        )}
        {cardItem.number && (
          <div className="flex items-center gap-2">
            <Input
              type="password"
              label="Card Number"
              readOnly
              value={cardItem.number}
              className="flex-1"
              style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}
            />
            {renderCopyButton(cardItem.number, 'card-number', 'Copy card number')}
          </div>
        )}
        <div className="flex gap-4">
          <Input
            type="text"
            label="Expiration"
            readOnly
            value={`${cardItem.expMonth || ''} / ${cardItem.expYear || ''}`}
            className="flex-1"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
          <Input
            type="password"
            label="CVV"
            readOnly
            value={cardItem.cvv || ''}
            className="flex-1"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen p-6 text-[var(--color-text)] selection:bg-[var(--color-aura-dim)]">
      <div className="max-w-2xl mx-auto mt-12">
        <Card variant="raised" padding="md" style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[var(--color-aura)] rounded-[var(--radius-full)] blur-[80px] pointer-events-none" />

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-6 relative z-10">
              <div className="w-16 h-16 border-4 border-[var(--color-primary)] border-t-transparent rounded-[var(--radius-full)] animate-spin" />
              <p className="text-[var(--color-text-secondary)] animate-pulse font-medium">
                Decrypting shared item...
              </p>
            </div>
          ) : error ? (
            <div className="py-12 relative z-10 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-[var(--radius-full)] bg-[var(--color-error-subtle)] text-[var(--color-error)] mb-2">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-[var(--color-text)]">Share Link Unavailable</h2>
              <p className="text-[var(--color-text-secondary)] max-w-md mx-auto">{error}</p>
            </div>
          ) : item ? (
            <div className="relative z-10 space-y-6">
              <div className="flex justify-between items-start border-b border-[var(--color-border)] pb-6">
                <div>
                  <h1 className="text-2xl font-bold text-[var(--color-text)] tracking-tight">
                    {item.name}
                  </h1>
                  <p className="text-sm text-[var(--color-text-tertiary)] mt-1 capitalize">
                    {item.type} Item
                  </p>
                </div>
                {maxViews > 0 && (
                  <Badge variant="primary" style={{ border: '1px solid var(--color-primary)' }}>
                    View {viewCount} of {maxViews}
                  </Badge>
                )}
              </div>

              <div className="space-y-5">
                {renderLoginFields(item)}
                {renderNoteFields(item)}
                {renderCardFields(item)}
              </div>

              <div className="pt-6 mt-8 border-t border-[var(--color-border)] text-center">
                <div className="inline-flex items-center justify-center space-x-2 text-xs text-[var(--color-text-tertiary)]">
                  <svg
                    className="w-4 h-4 text-[var(--color-primary)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  <span>
                    This is an end-to-end encrypted share. The server never sees the decrypted
                    content.
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
