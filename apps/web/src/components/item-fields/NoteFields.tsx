import React from 'react';
import { Textarea } from '@lockbox/design';

export interface NoteFieldsProps {
  mode: 'view' | 'edit' | 'add';
  content: string;
  setContent: (v: string) => void;
}

export default function NoteFields({ mode, content, setContent }: NoteFieldsProps) {
  if (mode === 'view') {
    return (
      <div>
        <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
          Note Content
        </span>
        <div className="p-4 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)] whitespace-pre-wrap text-sm text-[var(--color-text)]">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4 border-t border-[var(--color-border)]">
      <Textarea
        label="Secure Note"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={8}
      />
    </div>
  );
}
