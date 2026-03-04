import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { redeemShareLink, getShareAuthToken } from '../lib/team-crypto.js';
import { Button, Input, Card, Badge, Textarea, Aura } from '@lockbox/design';
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
      style={{ flexShrink: 0 }}
    >
      {copiedField === field ? (
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            fontWeight: 500,
            color: 'var(--color-success)',
          }}
        >
          Copied!
        </span>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
            <label
              style={{
                display: 'block',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 500,
                color: 'var(--color-text-secondary)',
                marginBottom: 4,
              }}
            >
              URLs
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {loginItem.uris.filter(Boolean).map((uri: string, idx: number) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <a
                    href={uri.startsWith('http') ? uri : `https://${uri}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-organic-lg)',
                      background: 'var(--color-surface)',
                      boxShadow: 'var(--shadow-sm)',
                      color: 'var(--color-primary)',
                      textDecoration: 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'block',
                      transition: 'box-shadow 0.15s',
                    }}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {cardItem.cardholderName && (
          <Input type="text" label="Cardholder Name" readOnly value={cardItem.cardholderName} />
        )}
        {cardItem.number && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
        <div style={{ display: 'flex', gap: 16 }}>
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
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--color-bg)',
      }}
    >
      <Aura state="active" position="center" style={{ width: 400, height: 400, opacity: 0.85 }} />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 480,
        }}
      >
        <Card variant="frost" padding="lg" style={{ boxShadow: 'var(--shadow-xl)' }}>
          {loading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '64px 0',
                gap: 24,
              }}
            >
              <div className="w-16 h-16 border-4 border-[var(--color-primary)] border-t-transparent rounded-[var(--radius-full)] animate-spin" />
              <p style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                Decrypting shared item...
              </p>
            </div>
          ) : error ? (
            <div
              style={{
                padding: '48px 0',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-error-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-error)',
                }}
              >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h2
                style={{
                  fontSize: 'var(--font-size-xl)',
                  fontWeight: 700,
                  color: 'var(--color-text)',
                }}
              >
                Share Link Unavailable
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', maxWidth: 400, margin: '0 auto' }}>
                {error}
              </p>
            </div>
          ) : item ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  paddingBottom: 24,
                  borderBottom: '1px solid var(--color-surface-raised)',
                }}
              >
                <div>
                  <h1
                    style={{
                      fontSize: 'var(--font-size-xl)',
                      fontWeight: 700,
                      color: 'var(--color-text)',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {item.name}
                  </h1>
                  <p
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-tertiary)',
                      marginTop: 4,
                      textTransform: 'capitalize',
                    }}
                  >
                    {item.type} Item
                  </p>
                </div>
                {maxViews > 0 && (
                  <Badge variant="primary">
                    View {viewCount} of {maxViews}
                  </Badge>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {renderLoginFields(item)}
                {renderNoteFields(item)}
                {renderCardFields(item)}
              </div>

              <div
                style={{
                  paddingTop: 24,
                  marginTop: 8,
                  borderTop: '1px solid var(--color-surface-raised)',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  <svg
                    style={{ width: 16, height: 16, color: 'var(--color-primary)' }}
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
