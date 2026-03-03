import React from 'react';
import { Button } from '@lockbox/design';

export interface ItemPanelHeaderProps {
  currentMode: 'view' | 'edit' | 'add';
  type: string;
  name: string;
  loading: boolean;
  typeIcon: string;
  onShare: () => void;
  onHistory: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onClose: () => void;
}

export default function ItemPanelHeader({
  currentMode,
  type,
  name,
  loading,
  typeIcon,
  onShare,
  onHistory,
  onEdit,
  onCancel,
  onSave,
  onClose,
}: ItemPanelHeaderProps) {
  const title =
    currentMode === 'add'
      ? `New ${type.charAt(0).toUpperCase() + type.slice(1)}`
      : name || 'Unnamed Item';

  return (
    <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{typeIcon}</span>
        <h2 className="text-lg font-semibold text-[var(--color-text)] truncate max-w-[200px]">
          {title}
        </h2>
      </div>
      <div className="flex items-center gap-2">
        {currentMode === 'view' ? (
          <>
            <Button variant="secondary" size="sm" onClick={onShare}>
              Share
            </Button>
            <Button variant="secondary" size="sm" onClick={onHistory}>
              History
            </Button>
            {type !== 'passkey' && (
              <Button variant="secondary" size="sm" onClick={onEdit}>
                Edit
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={onSave} loading={loading}>
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </>
        )}
        <Button variant="ghost" size="sm" onClick={onClose} className="p-1.5">
          ✕
        </Button>
      </div>
    </div>
  );
}
