import { Button, Icon, SiteFavicon, type IconName } from '@lockbox/design';

export interface ItemPanelHeaderProps {
  currentMode: 'view' | 'edit' | 'add';
  type: string;
  name: string;
  siteSources: readonly string[];
  loading: boolean;
  onShare: () => void;
  onHistory: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onClose: () => void;
}

const typeIcons: Record<string, IconName> = {
  login: 'key',
  note: 'note',
  card: 'credit-card',
  identity: 'id',
  passkey: 'fingerprint',
  document: 'file-description',
};

export default function ItemPanelHeader({
  currentMode,
  type,
  name,
  siteSources,
  loading,
  onShare,
  onHistory,
  onEdit,
  onCancel,
  onSave,
  onClose,
}: ItemPanelHeaderProps) {
  const title = currentMode === 'add'
    ? `New ${type === 'note' ? 'secure note' : type}`
    : name || 'Unnamed item';

  return (
    <header className="item-panel__header">
      <div className="item-panel__heading">
        <span className="item-panel__type-icon" aria-hidden="true">
          <SiteFavicon
            sources={siteSources}
            fallbackIcon={typeIcons[type] ?? 'file'}
            size={22}
            fill
          />
        </span>
        <div>
          <span className="item-panel__eyebrow">
            {currentMode === 'view' ? type : currentMode === 'edit' ? `Editing ${type}` : 'New vault item'}
          </span>
          <h2>{title}</h2>
        </div>
      </div>

      <div className="item-panel__actions" aria-label="Item actions">
        {currentMode === 'view' ? (
          <>
            <button type="button" className="lb-icon-button" onClick={onShare} aria-label="Share item" title="Share">
              <Icon name="share" size={19} />
            </button>
            <button type="button" className="lb-icon-button" onClick={onHistory} aria-label="View item history" title="History">
              <Icon name="history" size={19} />
            </button>
            {type !== 'passkey' && (
              <button type="button" className="lb-icon-button" onClick={onEdit} aria-label="Edit item" title="Edit">
                <Icon name="edit" size={19} />
              </button>
            )}
          </>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={onSave} loading={loading}>
              {loading ? 'Saving…' : 'Save'}
            </Button>
          </>
        )}
        <button type="button" className="lb-icon-button" onClick={onClose} aria-label="Close item panel" title="Close">
          <Icon name="x" size={20} />
        </button>
      </div>
    </header>
  );
}
