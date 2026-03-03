import React from 'react';
import { Button, Textarea } from '@lockbox/design';

export interface DocumentFieldsProps {
  mode: 'view' | 'edit' | 'add';
  description: string;
  setDescription: (v: string) => void;
  mimeType: string;
  fileSize: number;
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  documentFile: File | null;
  documentQuota: { used: number; limit: number } | null;
  onBrowse: () => void;
  onFileDrop: (file: File) => void;
}

export default function DocumentFields({
  mode,
  description,
  setDescription,
  mimeType,
  fileSize,
  isDragging,
  setIsDragging,
  documentFile,
  documentQuota,
  onBrowse,
  onFileDrop,
}: DocumentFieldsProps) {
  if (mode === 'view') {
    return (
      <div className="space-y-4">
        {description && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Description
            </span>
            <div className="p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)] whitespace-pre-wrap">
              {description}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              File Type
            </span>
            <div className="p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <span className="text-sm text-[var(--color-text)]">{mimeType || 'Unknown'}</span>
            </div>
          </div>
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              File Size
            </span>
            <div className="p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <span className="text-sm text-[var(--color-text)]">
                {fileSize > 0 ? `${(fileSize / 1024).toFixed(1)} KB` : '—'}
              </span>
            </div>
          </div>
        </div>
        {mimeType && mimeType.startsWith('image/') && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Preview
            </span>
            <div className="p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)] flex items-center justify-center">
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Image preview available after download
              </p>
            </div>
          </div>
        )}
        {mimeType === 'application/pdf' && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Preview
            </span>
            <div className="p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)] flex items-center justify-center">
              <p className="text-xs text-[var(--color-text-tertiary)]">
                PDF preview available after download
              </p>
            </div>
          </div>
        )}
        {documentQuota && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Storage Quota
            </span>
            <div className="p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <div className="flex justify-between text-sm text-[var(--color-text)] mb-2">
                <span>{(documentQuota.used / 1024 / 1024).toFixed(1)} MB used</span>
                <span>{(documentQuota.limit / 1024 / 1024).toFixed(0)} MB limit</span>
              </div>
              <div className="w-full bg-[var(--color-surface-raised)] rounded-[var(--radius-full)] h-2">
                <div
                  className="bg-[var(--color-primary)] h-2 rounded-[var(--radius-full)] transition-all"
                  style={{
                    width: `${Math.min(100, (documentQuota.used / documentQuota.limit) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4 border-t border-[var(--color-border)]">
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder="Describe this document..."
      />
      <div>
        <span className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
          Upload Document
        </span>
        <div
          className={`relative w-full p-6 rounded-[var(--radius-lg)] border-2 border-dashed transition-all duration-200 text-center cursor-pointer overflow-hidden ${
            isDragging
              ? 'border-[var(--color-primary)] bg-[var(--color-aura-dim)]'
              : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-subtle)]'
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) onFileDrop(f);
          }}
          onClick={onBrowse}
        >
          <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
            <span className="text-2xl text-[var(--color-text-tertiary)]">📄</span>
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">
              {documentFile ? documentFile.name : 'Drag & drop a file here, or click to browse'}
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {documentFile
                ? `${(documentFile.size / 1024).toFixed(1)} KB • ${documentFile.type || 'unknown type'}`
                : 'Max 10MB. Encrypted before upload.'}
            </p>
          </div>
        </div>
      </div>
      {mimeType && mode === 'edit' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Type
            </span>
            <span className="text-sm text-[var(--color-text)]">{mimeType}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Size
            </span>
            <span className="text-sm text-[var(--color-text)]">
              {fileSize > 0 ? `${(fileSize / 1024).toFixed(1)} KB` : '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
