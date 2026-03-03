import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { redeemShareLink, getShareAuthToken } from '../lib/team-crypto.js';
import type { VaultItem, LoginItem, SecureNoteItem, CardItem } from '@lockbox/types';
export default function ShareView() {
  const { shareId } = useParams<{ shareId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<VaultItem | null>(null);
  const [viewCount, setViewCount] = useState<number>(0);
  const [maxViews, setMaxViews] = useState<number>(0);

  const [showPassword, setShowPassword] = useState(false);
  const [showCardNumber, setShowCardNumber] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
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
    <button
      onClick={() => copyToClipboard(text, field)}
      className="p-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
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
    </button>
  );

  const renderLoginFields = (item: VaultItem) => {
    if (item.type !== 'login') return null;
    const loginItem = item as LoginItem;
    return (
      <>
        {loginItem.username && (
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              Username
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={loginItem.username}
                className="flex-1 px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] outline-none focus:border-[var(--color-border-strong)] transition-colors"
              />
              {renderCopyButton(loginItem.username, 'username', 'Copy username')}
            </div>
          </div>
        )}
        {loginItem.password && (
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              Password
            </label>
            <div className="flex items-center gap-2">
              <input
                type={showPassword ? 'text' : 'password'}
                readOnly
                value={loginItem.password}
                className="flex-1 px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] font-mono outline-none focus:border-[var(--color-border-strong)] transition-colors"
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="p-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {showPassword ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  )}
                </svg>
              </button>
              {renderCopyButton(loginItem.password, 'password', 'Copy password')}
            </div>
          </div>
        )}
        {loginItem.totp && (
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              TOTP Secret
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={loginItem.totp}
                className="flex-1 px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] font-mono outline-none focus:border-[var(--color-border-strong)] transition-colors"
              />
              {renderCopyButton(loginItem.totp, 'totp', 'Copy TOTP')}
            </div>
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
      <div>
        <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
          Content
        </label>
        <textarea
          readOnly
          value={noteItem.content || ''}
          rows={10}
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] outline-none focus:border-[var(--color-border-strong)] transition-colors whitespace-pre-wrap font-mono text-sm resize-none"
        />
      </div>
    );
  };

  const renderCardFields = (item: VaultItem) => {
    if (item.type !== 'card') return null;
    const cardItem = item as CardItem;
    return (
      <div className="space-y-4">
        {cardItem.cardholderName && (
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              Cardholder Name
            </label>
            <input
              type="text"
              readOnly
              value={cardItem.cardholderName}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] outline-none"
            />
          </div>
        )}
        {cardItem.number && (
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              Card Number
            </label>
            <div className="flex items-center gap-2">
              <input
                type={showCardNumber ? 'text' : 'password'}
                readOnly
                value={cardItem.number}
                className="flex-1 px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] font-mono tracking-wider outline-none"
              />
              <button
                onClick={() => setShowCardNumber(!showCardNumber)}
                className="p-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {showCardNumber ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  )}
                </svg>
              </button>
              {renderCopyButton(cardItem.number, 'card-number', 'Copy card number')}
            </div>
          </div>
        )}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              Expiration
            </label>
            <input
              type="text"
              readOnly
              value={`${cardItem.expMonth || ''} / ${cardItem.expYear || ''}`}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] font-mono outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              CVV
            </label>
            <div className="flex items-center gap-2">
              <input
                type={showCvv ? 'text' : 'password'}
                readOnly
                value={cardItem.cvv || ''}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] font-mono outline-none"
              />
              <button
                onClick={() => setShowCvv(!showCvv)}
                className="p-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {showCvv ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen p-6 text-[var(--color-text)] selection:bg-[var(--color-aura-dim)]">
      <div className="max-w-2xl mx-auto mt-12">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-6 relative overflow-hidden">
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
                  <span className="inline-flex items-center px-2.5 py-1 rounded-[var(--radius-full)] text-xs font-medium bg-[var(--color-aura-dim)] text-[var(--color-primary)] border border-[var(--color-primary)]">
                    View {viewCount} of {maxViews}
                  </span>
                )}
              </div>

              {/* ITEM CONTENT */}
              <div className="space-y-5">
                {renderLoginFields(item)}
                {renderNoteFields(item)}
                {renderCardFields(item)}
              </div>

              {/* Security Notice */}
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
        </div>
      </div>
    </div>
  );
}
