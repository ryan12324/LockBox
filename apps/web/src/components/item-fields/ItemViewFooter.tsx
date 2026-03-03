import React from 'react';
import { Button } from '@lockbox/design';
import type { Folder } from '@lockbox/types';

export interface ItemViewFooterProps {
  folderId: string;
  favorite: boolean;
  folders: Folder[];
  showConfirmDelete: boolean;
  setShowConfirmDelete: (v: boolean) => void;
  loading: boolean;
  onDelete: () => void;
}

export default function ItemViewFooter({
  folderId,
  favorite,
  folders,
  showConfirmDelete,
  setShowConfirmDelete,
  loading,
  onDelete,
}: ItemViewFooterProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        {folderId && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase">
              Folder
            </span>
            <span className="text-sm text-[var(--color-text)]">
              {folders.find((f) => f.id === folderId)?.name || 'Unknown'}
            </span>
          </div>
        )}
        {favorite && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase">
              Favorite
            </span>
            <span className="text-sm text-[var(--color-warning)]">⭐ Yes</span>
          </div>
        )}
      </div>
      <div className="pt-6 mt-6 border-t border-[var(--color-border)]">
        {showConfirmDelete ? (
          <div className="p-4 bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-md)]">
            <p className="text-sm text-[var(--color-error)] mb-3 font-medium">
              Are you sure you want to delete this item? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="danger" size="sm" onClick={onDelete} disabled={loading}>
                {loading ? 'Deleting...' : 'Yes, Delete'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowConfirmDelete(false)}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowConfirmDelete(true)}
            className="w-full px-4 py-2 text-[var(--color-error)] bg-[var(--color-error-subtle)] rounded-[var(--radius-md)] font-medium"
          >
            Delete Item
          </Button>
        )}
      </div>
    </>
  );
}
