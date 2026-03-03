import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaultItem, Folder } from '@lockbox/types';
import { Button, Card } from '@lockbox/design';
import ItemHistoryPanel from './ItemHistoryPanel.js';
import AttachmentSection from './AttachmentSection.js';
import ShareLinkModal from './ShareLinkModal.js';
import LoginFields from './item-fields/LoginFields.js';
import CardFields from './item-fields/CardFields.js';
import IdentityFields from './item-fields/IdentityFields.js';
import NoteFields from './item-fields/NoteFields.js';
import PasskeyFields from './item-fields/PasskeyFields.js';
import DocumentFields from './item-fields/DocumentFields.js';
import CustomFieldsSection from './item-fields/CustomFieldsSection.js';
import SecurityAlertsSection from './item-fields/SecurityAlertsSection.js';
import CommonEditFields from './item-fields/CommonEditFields.js';
import ItemPanelHeader from './item-fields/ItemPanelHeader.js';
import ItemViewFooter from './item-fields/ItemViewFooter.js';
import { useItemPanelState } from './item-fields/useItemPanelState.js';

function CollapsibleSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <Card variant="surface" padding="md">
      <Button
        variant="ghost"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 0,
        }}
      >
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span>{open ? '▾' : '▸'}</span>
      </Button>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </Card>
  );
}

interface ItemPanelProps {
  mode: 'view' | 'edit' | 'add';
  item: VaultItem | null;
  folders: Folder[];
  items: VaultItem[];
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function ItemPanel({
  mode,
  item,
  folders,
  items,
  onSave,
  onDelete,
  onClose,
}: ItemPanelProps) {
  const navigate = useNavigate();
  const s = useItemPanelState({ mode, item, folders, items, onSave, onDelete });
  const loginP = { ...s.loginP, onRotatePassword: () => navigate('/health') };

  // Imperative hidden file input for document type (keeps raw elements out of JSX)
  const fileDropRef = React.useRef(s.handleFileDrop);
  fileDropRef.current = s.handleFileDrop;

  React.useEffect(() => {
    if (s.type !== 'document' || s.currentMode === 'view') return;
    const el = document.createElement('input');
    el.type = 'file';
    el.style.display = 'none';
    el.addEventListener('change', () => {
      const f = el.files?.[0];
      if (f) fileDropRef.current(f);
      el.value = '';
    });
    document.body.appendChild(el);
    (s.fileInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
    return () => {
      el.remove();
    };
  }, [s.type, s.currentMode, s.fileInputRef]);

  function renderTypeFields(m: 'view' | 'edit' | 'add') {
    switch (s.type) {
      case 'login':
        return <LoginFields mode={m} {...loginP} />;
      case 'note':
        return <NoteFields mode={m} content={s.content} setContent={s.setContent} />;
      case 'card':
        return <CardFields mode={m} {...s.cardP} />;
      case 'identity':
        return <IdentityFields mode={m} {...s.idP} />;
      case 'passkey':
        return <PasskeyFields mode={m} {...s.pkP} />;
      case 'document':
        return <DocumentFields mode={m} {...s.docP} />;
      default:
        return null;
    }
  }

  const favoriteSlot = (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => s.setFavorite(!s.favorite)}
      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
    >
      <span
        style={{
          color: s.favorite ? 'var(--color-primary)' : 'var(--color-text-secondary)',
          fontSize: '1.1em',
        }}
      >
        {s.favorite ? '★' : '☆'}
      </span>
      <span
        style={{
          fontSize: 'var(--font-size-sm)',
          fontWeight: 500,
          color: 'var(--color-text-secondary)',
        }}
      >
        Favorite
      </span>
    </Button>
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 transition-opacity" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full sm:w-[450px] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] border-l border-[var(--color-border)] z-50 flex flex-col transform transition-transform duration-300 ease-in-out translate-x-0">
        <ItemPanelHeader
          currentMode={s.currentMode}
          type={s.type}
          name={s.name}
          loading={s.loading}
          typeIcon={s.typeIcon}
          onShare={() => s.setShowShareModal(true)}
          onHistory={() => s.setShowHistory(true)}
          onEdit={() => s.setCurrentMode('edit')}
          onCancel={s.currentMode === 'add' ? onClose : () => s.setCurrentMode('view')}
          onSave={s.handleSave}
          onClose={onClose}
        />
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {s.currentMode !== 'view' && (
            <Card variant="surface" padding="md">
              <CommonEditFields
                name={s.name}
                setName={s.setName}
                folderId={s.folderId}
                setFolderId={s.setFolderId}
                favoriteSlot={favoriteSlot}
                tags={s.tags}
                setTags={s.setTags}
                suggestedTags={s.suggestedTags}
                localFolders={s.localFolders}
                creatingFolder={s.creatingFolder}
                setCreatingFolder={s.setCreatingFolder}
                newFolderName={s.newFolderName}
                setNewFolderName={s.setNewFolderName}
                onCreateFolder={s.handleCreateFolder}
                type={s.type}
                setType={s.setType}
                isAdd={s.currentMode === 'add'}
              />
            </Card>
          )}
          {s.currentMode !== 'view' && (
            <Card variant="surface" padding="md">
              {renderTypeFields(s.currentMode)}
            </Card>
          )}
          {s.currentMode === 'edit' && item?.id && (
            <CollapsibleSection title="Attachments" defaultOpen={false}>
              <AttachmentSection itemId={item.id} mode="edit" />
            </CollapsibleSection>
          )}
          {s.currentMode !== 'view' && (
            <CollapsibleSection title="Custom Fields" defaultOpen={s.customFields.length > 0}>
              <CustomFieldsSection mode={s.currentMode} {...s.cfP} />
            </CollapsibleSection>
          )}
          {s.currentMode === 'view' && (
            <div className="space-y-6">
              <ItemViewFooter
                folderId={s.folderId}
                favorite={s.favorite}
                folders={folders}
                showConfirmDelete={s.showConfirmDelete}
                setShowConfirmDelete={s.setShowConfirmDelete}
                loading={s.loading}
                onDelete={s.handleDelete}
              />
              <Card variant="surface" padding="md">
                {renderTypeFields('view')}
              </Card>
              {item?.id && (
                <CollapsibleSection title="Attachments" defaultOpen={false}>
                  <AttachmentSection itemId={item.id} mode="view" />
                </CollapsibleSection>
              )}
              <CollapsibleSection title="Custom Fields" defaultOpen={s.customFields.length > 0}>
                <CustomFieldsSection mode="view" {...s.cfP} />
              </CollapsibleSection>
              <CollapsibleSection title="Security Alerts" defaultOpen={s.alerts.length > 0}>
                <SecurityAlertsSection
                  alerts={s.alerts}
                  dismissedAlerts={s.dismissedAlerts}
                  setDismissedAlerts={s.setDismissedAlerts}
                  onAlertAction={s.handleAlertAction}
                />
              </CollapsibleSection>
            </div>
          )}
        </div>
      </div>
      {s.showHistory && item?.id && (
        <ItemHistoryPanel
          itemId={item.id}
          onClose={() => s.setShowHistory(false)}
          onRestore={() => {
            s.setShowHistory(false);
            onSave();
          }}
        />
      )}
      {s.showShareModal && item && (
        <ShareLinkModal
          item={item}
          isOpen={s.showShareModal}
          onClose={() => s.setShowShareModal(false)}
        />
      )}
    </>
  );
}
