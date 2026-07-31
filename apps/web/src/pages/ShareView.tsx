import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { redeemShareLink, getShareAuthToken } from '../lib/team-crypto.js';
import { Button, Input, Card, Badge, Textarea, Icon, type IconName } from '@lockbox/design';
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

  function safeExternalUrl(value: string): string | null {
    try {
      const candidate = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      return candidate.protocol === 'https:' || candidate.protocol === 'http:'
        ? candidate.href
        : null;
    } catch {
      return null;
    }
  }

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
        <>
          <Icon name="check" size={17} />
          <span>Copied</span>
        </>
      ) : (
        <Icon name="copy" size={17} />
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
              {loginItem.uris.filter(Boolean).map((uri: string) => {
                const href = safeExternalUrl(uri);
                const style: React.CSSProperties = {
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-bg-subtle)',
                  border: '1px solid var(--color-border)',
                  color: href ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  textDecoration: 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'block',
                };
                return (
                  <div key={uri} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" style={style}>
                        {uri}
                      </a>
                    ) : (
                      <span style={style}>{uri}</span>
                    )}
                  </div>
                );
              })}
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

  const typeIcons: Record<string, IconName> = {
    login: 'key',
    note: 'note',
    card: 'credit-card',
    identity: 'id',
    passkey: 'fingerprint',
    document: 'file-description',
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{
        position: 'relative',
        background: 'var(--color-bg)',
        paddingTop: 32,
        paddingBottom: 32,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span
            style={{
              display: 'inline-flex',
              width: 38,
              height: 38,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-primary)',
              color: 'var(--color-primary-contrast)',
            }}
          >
            <Icon name="shield-lock" size={21} />
          </span>
          <div>
            <strong style={{ display: 'block', color: 'var(--color-text)' }}>Lockbox</strong>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)' }}>
              Encrypted share
            </span>
          </div>
        </div>

        <Card variant="surface" padding="lg">
          {loading ? (
            <div
              role="status"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '64px 0',
                gap: 16,
              }}
            >
              <Icon name="loader-2" size={30} className="vault-state__spinner" />
              <p style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                Decrypting shared item…
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
                borderRadius: 'var(--radius-md)',
                  background: 'var(--color-error-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-error)',
                }}
              >
                <Icon name="alert-triangle" size={30} />
              </div>
              <h2
                style={{
                  fontSize: 'var(--font-size-xl)',
                  fontWeight: 700,
                  color: 'var(--color-text)',
                }}
              >
                Share link unavailable
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
                  borderBottom: '1px solid var(--color-border)',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      width: 40,
                      height: 40,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-bg-subtle)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-primary)',
                      flex: '0 0 auto',
                    }}
                  >
                    <Icon name={typeIcons[item.type] ?? 'file'} size={20} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                  <h1
                    style={{
                      fontSize: 'var(--font-size-xl)',
                      fontWeight: 700,
                      color: 'var(--color-text)',
                      letterSpacing: '-0.02em',
                      overflowWrap: 'anywhere',
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
                    {item.type} item
                  </p>
                  </div>
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
                  borderTop: '1px solid var(--color-border)',
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  <Icon name="lock" size={16} style={{ color: 'var(--color-primary)', flex: '0 0 auto' }} />
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
