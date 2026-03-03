import React from 'react';
import { Button, Input, Select } from '@lockbox/design';
import type { CustomField } from '@lockbox/types';

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'boolean', label: 'Boolean' },
];

const BOOLEAN_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

export interface CustomFieldsSectionProps {
  mode: 'view' | 'edit' | 'add';
  customFields: CustomField[];
  setCustomFields: (v: CustomField[]) => void;
  showCustomFields: Record<number, boolean>;
  setShowCustomFields: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  copiedField: string | null;
  copyToClipboard: (text: string, field: string, element?: HTMLElement | null) => void;
}

export default function CustomFieldsSection({
  mode,
  customFields,
  setCustomFields,
  showCustomFields,
  setShowCustomFields,
  copiedField,
  copyToClipboard,
}: CustomFieldsSectionProps) {
  if (mode === 'view') {
    if (customFields.length === 0) return null;
    return (
      <div className="space-y-4 pt-4 border-t border-[var(--color-border)]">
        <h3 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
          Custom Fields
        </h3>
        <div className="grid grid-cols-1 gap-4">
          {customFields.map((field, idx) => (
            <div key={idx}>
              <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
                {field.name}
              </span>
              <div className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
                {field.type === 'boolean' ? (
                  <span className="text-sm text-[var(--color-text)]">
                    {field.value === 'true' ? 'Yes' : 'No'}
                  </span>
                ) : field.type === 'hidden' ? (
                  <span className="text-sm font-mono text-[var(--color-text)]">
                    {showCustomFields[idx] ? field.value : '••••••••'}
                  </span>
                ) : (
                  <span className="text-sm text-[var(--color-text)] whitespace-pre-wrap">
                    {field.value}
                  </span>
                )}
                <div className="flex gap-2">
                  {field.type === 'hidden' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setShowCustomFields((prev) => ({ ...prev, [idx]: !prev[idx] }))
                      }
                      style={{ padding: '6px', minHeight: 'auto' }}
                    >
                      {showCustomFields[idx] ? '👁️‍🗨️' : '👁️'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => copyToClipboard(field.value, `cf-${idx}`, e.currentTarget)}
                    style={{ padding: '6px', minHeight: 'auto' }}
                  >
                    {copiedField === `cf-${idx}` ? '✓' : '📋'}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const updateField = (idx: number, updates: Partial<CustomField>) => {
    const newFields = [...customFields];
    newFields[idx] = { ...newFields[idx], ...updates };
    if (
      updates.type === 'boolean' &&
      newFields[idx].value !== 'true' &&
      newFields[idx].value !== 'false'
    ) {
      newFields[idx].value = 'false';
    }
    setCustomFields(newFields);
  };

  return (
    <div className="space-y-4 pt-4 border-t border-[var(--color-border)]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
          Custom Fields
        </h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setCustomFields([...customFields, { name: '', value: '', type: 'text' }])}
          style={{ padding: '4px 8px', fontSize: 'var(--font-size-xs)' }}
        >
          + Add
        </Button>
      </div>

      {customFields.map((field, idx) => (
        <div
          key={idx}
          className="flex flex-col gap-2 p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]"
        >
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input
                type="text"
                value={field.name}
                onChange={(e) => updateField(idx, { name: e.target.value })}
                placeholder="Field Name"
              />
            </div>
            <div className="w-28">
              <Select
                value={field.type}
                onChange={(e) =>
                  updateField(idx, { type: e.target.value as 'text' | 'hidden' | 'boolean' })
                }
                options={FIELD_TYPE_OPTIONS}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCustomFields(customFields.filter((_, i) => i !== idx))}
              style={{ padding: '4px 8px', minHeight: 'auto', color: 'var(--color-error)' }}
            >
              ✕
            </Button>
          </div>

          {field.type === 'boolean' ? (
            <Select
              value={field.value === 'true' ? 'true' : 'false'}
              onChange={(e) => updateField(idx, { value: e.target.value })}
              options={BOOLEAN_OPTIONS}
            />
          ) : field.type === 'hidden' ? (
            <Input
              type="password"
              value={field.value}
              onChange={(e) => updateField(idx, { value: e.target.value })}
              placeholder="Hidden Value"
            />
          ) : (
            <Input
              type="text"
              value={field.value}
              onChange={(e) => updateField(idx, { value: e.target.value })}
              placeholder="Value"
            />
          )}
        </div>
      ))}
    </div>
  );
}
