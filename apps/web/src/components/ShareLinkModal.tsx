import React, { useState } from 'react';
import { useAuthStore } from '../store/auth.js';
import { api } from '../lib/api.js';
import { createShareLink } from '../lib/team-crypto.js';
import { Modal, Button, Input, Select } from '@lockbox/design';
import { useToast } from '../providers/ToastProvider.js';
import type { VaultItem } from '@lockbox/types';

interface ShareLinkModalProps {
  item: VaultItem;
  isOpen: boolean;
  onClose: () => void;
}

export default function ShareLinkModal({ item, isOpen, onClose }: ShareLinkModalProps) {
  const { session } = useAuthStore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);

  const [expiresIn, setExpiresIn] = useState<number>(86400); // 24 hours default
  const [maxViews, setMaxViews] = useState<number>(1); // 1 view default
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    if (!session) return;
    setLoading(true);

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
      toast(err instanceof Error ? err.message : 'Failed to create share link.', 'error');
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
    setExpiresIn(86400);
    setMaxViews(1);
    setCopied(false);
    onClose();
  }

  return (
    <Modal open={isOpen} onClose={handleClose} title="Share Link" size="md">
      <div className="space-y-6">
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

            <div className="space-y-4">
              <Select
                label="Expires in"
                value={String(expiresIn)}
                onChange={(e) => setExpiresIn(Number(e.target.value))}
                options={[
                  { value: '3600', label: '1 Hour' },
                  { value: '86400', label: '24 Hours' },
                  { value: '604800', label: '7 Days' },
                  { value: '2592000', label: '30 Days' },
                ]}
              />

              <Select
                label="Maximum views"
                value={String(maxViews)}
                onChange={(e) => setMaxViews(Number(e.target.value))}
                options={[
                  { value: '1', label: '1 View (One-time)' },
                  { value: '5', label: '5 Views' },
                  { value: '10', label: '10 Views' },
                  { value: '0', label: 'Unlimited' },
                ]}
              />
            </div>

            <div className="pt-4 border-t border-[var(--color-border)] flex justify-end gap-3">
              <Button variant="ghost" size="sm" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleCreate} loading={loading}>
                Create Share Link
              </Button>
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
              <Input
                label="Share URL"
                readOnly
                value={successUrl}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-sm)' }}
                onClick={(e) => e.currentTarget.select()}
              />
              <div className="mt-2 flex justify-end">
                <Button variant="primary" size="sm" onClick={handleCopy}>
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--color-border)] flex justify-center">
              <Button variant="ghost" size="sm" onClick={handleClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
