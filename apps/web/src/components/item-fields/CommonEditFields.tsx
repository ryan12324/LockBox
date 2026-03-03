import React from 'react';
import { Button, Input, Select } from '@lockbox/design';
import type { Folder, VaultItemType } from '@lockbox/types';

export interface CommonEditFieldsProps {
  name: string;
  setName: (v: string) => void;
  folderId: string;
  setFolderId: (v: string) => void;
  favoriteSlot: React.ReactNode;
  tags: string[];
  setTags: (v: string[]) => void;
  suggestedTags: string[];
  localFolders: Folder[];
  creatingFolder: boolean;
  setCreatingFolder: (v: boolean) => void;
  newFolderName: string;
  setNewFolderName: (v: string) => void;
  onCreateFolder: () => void;
  type: VaultItemType;
  setType: (v: VaultItemType) => void;
  isAdd: boolean;
}

const allTypes: VaultItemType[] = ['login', 'note', 'card', 'identity', 'passkey', 'document'];

export default function CommonEditFields({
  name,
  setName,
  folderId,
  setFolderId,
  favoriteSlot,
  tags,
  setTags,
  suggestedTags,
  localFolders,
  creatingFolder,
  setCreatingFolder,
  newFolderName,
  setNewFolderName,
  onCreateFolder,
  type,
  setType,
  isAdd,
}: CommonEditFieldsProps) {
  const folderOptions = [
    { value: '', label: 'No folder' },
    ...localFolders.map((f) => ({ value: f.id, label: f.name })),
    { value: '__new__', label: '+ New folder...' },
  ];

  return (
    <>
      {isAdd && (
        <div className="flex bg-[var(--color-surface)] p-1 rounded-[var(--radius-md)]">
          {allTypes.map((t) => (
            <Button
              key={t}
              variant={type === t ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setType(t)}
              className="flex-1"
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </div>
      )}
      <div className="space-y-4">
        <Input
          label="Name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My Bank"
        />
        <div className="flex gap-4">
          <div className="flex-1">
            <Select
              label="Folder"
              value={creatingFolder ? '__new__' : folderId}
              onChange={(e) => {
                if (e.target.value === '__new__') setCreatingFolder(true);
                else {
                  setCreatingFolder(false);
                  setFolderId(e.target.value);
                }
              }}
              options={folderOptions}
            />
            {creatingFolder && (
              <div className="flex gap-1 mt-2">
                <Input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onCreateFolder();
                    if (e.key === 'Escape') {
                      setCreatingFolder(false);
                      setNewFolderName('');
                    }
                  }}
                  placeholder="Folder name"
                  className="flex-1"
                  autoFocus
                />
                <Button variant="primary" size="sm" onClick={onCreateFolder}>
                  ✓
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCreatingFolder(false);
                    setNewFolderName('');
                  }}
                >
                  ✕
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-end pb-2">{favoriteSlot}</div>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
            Tags
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map((t) => (
              <span
                key={t}
                className="px-2 py-1 text-xs bg-[var(--color-aura-dim)] text-[var(--color-primary)] border border-[var(--color-primary)] rounded-[var(--radius-full)] flex items-center gap-1"
              >
                {t}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTags(tags.filter((x) => x !== t))}
                  className="p-0 min-h-0 hover:text-[var(--color-text)]"
                >
                  ✕
                </Button>
              </span>
            ))}
          </div>
          {suggestedTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-xs text-[var(--color-text-tertiary)] self-center">
                Suggested:
              </span>
              {suggestedTags
                .filter((t) => !tags.includes(t))
                .map((t) => (
                  <Button
                    key={t}
                    variant="ghost"
                    size="sm"
                    onClick={() => setTags([...tags, t])}
                    className="px-2 py-1 text-xs bg-[var(--color-aura-dim)] border border-[var(--color-primary)] rounded-[var(--radius-full)] text-[var(--color-primary)]"
                  >
                    + {t}
                  </Button>
                ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
