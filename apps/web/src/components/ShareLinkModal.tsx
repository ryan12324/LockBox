import React, { useState } from 'react';
import { useAuthStore } from '../store/auth.js';
import { api } from '../lib/api.js';
import { createShareLink } from '../lib/team-crypto.js';
import type { VaultItem } from '@lockbox/types';

interface ShareLinkModalProps {
  item: VaultItem;
  isOpen: boolean;
  onClose: () => void;
}

export default function ShareLinkModal({ item, isOpen, onClose }: ShareLinkModalProps) {
  const { session } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);

  const [expiresIn, setExpiresIn] = useState<number>(86400); // 24 hours default
  const [maxViews, setMaxViews] = useState<number>(1); // 1 view default
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  async function handleCreate() {
    if (!session) return;
    setLoading(true);
    setError(null);

    try {
      const { shareId, encryptedItem, tokenHash, shareUrl } = await createShareLink(
        item,
        item.name
      );

      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      await api.shareLinks.create(
        {
          id: shareId,
          encryptedItem,
          tokenHash,
          expiresAt,
          maxViews,
          itemName: item.name,
        },
        session.token
      );

      setSuccessUrl(`${window.location.origin}${shareUrl}`);
    } catch (err: unknown) {
      console.error('Error creating share link:', err);
      setError(err instanceof Error ? err.message : 'Failed to create share link.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!successUrl) return;
    await navigator.clipboard.writeText(successUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setSuccessUrl(null);
    setError(null);
    setExpiresIn(86400);
    setMaxViews(1);
    setCopied(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] max-w-md w-full relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-[var(--color-aura-dim)] rounded-[var(--radius-full)] blur-[80px] pointer-events-none" />

        <div className="flex justify-between items-center p-6 border-b border-[var(--color-border)]">
          <h2 className="text-xl font-bold text-[var(--color-text)]">Share Link</h2>
          <button
            onClick={handleClose}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 relative z-10 space-y-6">
          {!successUrl ? (
            <>
              <div>
                <p className="text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                  Item to share
                </p>
                <div className="px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] text-[var(--color-text)]">
                  {item.name}
                </div>
              </div>

              {error && (
                <div className="px-3 py-2 bg-[var(--color-error-subtle)] text-[var(--color-error)] rounded-[var(--radius-md)] text-sm border border-[var(--color-error)]">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                    Expires in
                  </label>
                  <select
                    value={expiresIn}
                    onChange={(e) => setExpiresIn(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-aura)] transition-colors"
                  >
                    <option value={3600}>1 Hour</option>
                    <option value={86400}>24 Hours</option>
                    <option value={604800}>7 Days</option>
                    <option value={2592000}>30 Days</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                    Maximum views
                  </label>
                  <select
                    value={maxViews}
                    onChange={(e) => setMaxViews(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-aura)] transition-colors"
                  >
                    <option value={1}>1 View (One-time)</option>
                    <option value={5}>5 Views</option>
                    <option value={10}>10 Views</option>
                    <option value={0}>Unlimited</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--color-border)] flex justify-end gap-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-fg)] rounded-[var(--radius-md)] text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading && (
                    <svg
                      className="animate-spin h-4 w-4 text-[var(--color-primary-fg)]"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  )}
                  Create Share Link
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="w-12 h-12 bg-[var(--color-success-subtle)] text-[var(--color-success)] rounded-[var(--radius-full)] flex items-center justify-center mb-2">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-[var(--color-text)]">Share Link Created</h3>
                <p className="text-sm text-[var(--color-warning)] bg-[var(--color-warning-subtle)] px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-warning)]">
                  Save this link — it cannot be retrieved later. The encryption key is in the URL.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Share URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={successUrl}
                    className="flex-1 px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] font-mono text-sm outline-none"
                    onClick={(e) => e.currentTarget.select()}
                  />
                  <button
                    onClick={handleCopy}
                    className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-fg)] rounded-[var(--radius-md)] text-sm font-medium transition-colors flex-shrink-0"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--color-border)] flex justify-center">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
