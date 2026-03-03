import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { encryptVaultItem } from '../lib/crypto.js';
import { api } from '../lib/api.js';
import {
  parseImport,
  exportToBitwardenCSV,
  detectFormat,
  parseCSV,
  type ImportFormat,
} from '../lib/importers/index.js';
import { Button, Card, Badge, Select } from '@lockbox/design';
import { useToast } from '../providers/ToastProvider.js';
import type { VaultItem } from '@lockbox/types';

type ImportStep = 'select' | 'preview' | 'importing' | 'done';

const FORMAT_OPTIONS: Array<{ value: ImportFormat; label: string }> = [
  { value: 'unknown', label: 'Auto-detect' },
  { value: 'bitwarden', label: 'Bitwarden' },
  { value: 'chrome', label: 'Google Chrome' },
  { value: 'firefox', label: 'Mozilla Firefox' },
  { value: 'onepassword', label: '1Password' },
  { value: 'lastpass', label: 'LastPass' },
  { value: 'keepass', label: 'KeePass' },
];

const FORMAT_LABELS: Record<ImportFormat, string> = {
  bitwarden: 'Bitwarden',
  chrome: 'Google Chrome',
  firefox: 'Mozilla Firefox',
  onepassword: '1Password',
  lastpass: 'LastPass',
  keepass: 'KeePass',
  unknown: 'Auto-detect',
};

export default function ImportExport() {
  const navigate = useNavigate();
  const { session, userKey } = useAuthStore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import state
  const [importStep, setImportStep] = useState<ImportStep>('select');
  const [selectedFormat, setSelectedFormat] = useState<ImportFormat>('unknown');
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [detectedFormat, setDetectedFormat] = useState<ImportFormat>('unknown');
  const [previewItems, setPreviewItems] = useState<VaultItem[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importedCount, setImportedCount] = useState(0);

  // Export state
  const [exportLoading, setExportLoading] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setFileContent(text);

      // Auto-detect format
      const rows = parseCSV(text);
      if (rows.length > 0) {
        const detected = detectFormat(rows[0]);
        setDetectedFormat(detected);
        if (selectedFormat === 'unknown') {
          setSelectedFormat(detected !== 'unknown' ? detected : 'bitwarden');
        }
      }
    };
    reader.readAsText(file);
  }

  function handlePreview() {
    if (!fileContent) return;
    const items = parseImport(
      fileContent,
      selectedFormat === 'unknown' ? undefined : selectedFormat
    );
    setPreviewItems(items);
    setImportStep('preview');
  }

  async function handleImport() {
    if (!session || !userKey || previewItems.length === 0) return;

    setImportStep('importing');
    setImportTotal(previewItems.length);
    setImportProgress(0);
    setImportErrors([]);

    let successCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < previewItems.length; i++) {
      const item = previewItems[i];
      try {
        const itemId = item.id || crypto.randomUUID();
        const revisionDate = item.revisionDate || new Date().toISOString();
        const encryptedData = await encryptVaultItem(
          { ...item, id: itemId, revisionDate },
          userKey,
          itemId,
          revisionDate
        );
        await api.vault.createItem(
          {
            id: itemId,
            type: item.type,
            encryptedData,
            folderId: item.folderId,
            tags: item.tags,
            favorite: item.favorite,
            revisionDate,
          },
          session.token
        );
        successCount++;
      } catch (err) {
        errors.push(
          `Failed to import "${item.name}": ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
      setImportProgress(i + 1);
    }

    setImportedCount(successCount);
    setImportErrors(errors);
    setImportStep('done');
  }

  function handleReset() {
    setImportStep('select');
    setFileContent('');
    setFileName('');
    setSelectedFormat('unknown');
    setDetectedFormat('unknown');
    setPreviewItems([]);
    setImportProgress(0);
    setImportTotal(0);
    setImportErrors([]);
    setImportedCount(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleExport() {
    setExportLoading(true);
    try {
      const data = (await api.vault.list(session!.token)) as {
        items: Array<{
          id: string;
          type: string;
          encryptedData: string;
          folderId?: string;
          tags?: string;
          favorite?: number;
          revisionDate: string;
        }>;
      };
      const csvContent = exportToBitwardenCSV(
        data.items.map((item) => ({
          id: item.id,
          type: item.type as 'login' | 'note' | 'card',
          name: `Item ${item.id.slice(0, 8)}`,
          tags: [],
          favorite: Boolean(item.favorite),
          createdAt: item.revisionDate,
          updatedAt: item.revisionDate,
          revisionDate: item.revisionDate,
          username: '',
          password: '',
          uris: [],
        }))
      );

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lockbox-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed', 'error');
    } finally {
      setExportLoading(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">Import / Export</h1>

        <div className="space-y-6">
          <Card variant="surface" padding="md">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-1">Import</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Import passwords from Bitwarden, Chrome, Firefox, 1Password, LastPass, or KeePass.
            </p>

            {importStep === 'select' && (
              <div className="space-y-4">
                <Select
                  label="Format"
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value as ImportFormat)}
                  options={FORMAT_OPTIONS}
                />

                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                    CSV File
                  </label>
                  <div
                    className="border-2 border-dashed border-[var(--color-border)] rounded-[var(--radius-md)] p-6 text-center cursor-pointer hover:border-[var(--color-primary)] transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file && fileInputRef.current) {
                        const dt = new DataTransfer();
                        dt.items.add(file);
                        fileInputRef.current.files = dt.files;
                        fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
                      }
                    }}
                  >
                    {fileName ? (
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text)]">
                          📄 {fileName}
                        </p>
                        {detectedFormat !== 'unknown' && (
                          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                            Detected: {FORMAT_LABELS[detectedFormat]}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm text-[var(--color-text-secondary)]">
                          Drop a CSV file here or{' '}
                          <span className="text-[var(--color-primary)]">browse</span>
                        </p>
                        <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                          Supports .csv files
                        </p>
                      </div>
                    )}
                  </div>
                  {/* Hidden file picker — no design system equivalent for type="file" */}
                  {React.createElement('input', {
                    ref: fileInputRef,
                    type: 'file',
                    accept: '.csv,text/csv',
                    className: 'hidden',
                    onChange: handleFileChange,
                  })}
                </div>

                <Button
                  variant="primary"
                  onClick={handlePreview}
                  disabled={!fileContent}
                  style={{ width: '100%' }}
                >
                  Preview Import
                </Button>
              </div>
            )}

            {importStep === 'preview' && (
              <div className="space-y-4">
                <div className="bg-[var(--color-aura-dim)] border border-[var(--color-primary)] rounded-[var(--radius-md)] p-3">
                  <p className="text-sm text-[var(--color-primary)]">
                    Found <strong>{previewItems.length}</strong> items to import from{' '}
                    <strong>{FORMAT_LABELS[selectedFormat]}</strong>
                  </p>
                </div>

                <div className="max-h-64 overflow-y-auto border border-[var(--color-border)] rounded-[var(--radius-md)]">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--color-surface-raised)] sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-[var(--color-text-secondary)] font-medium">
                          Name
                        </th>
                        <th className="text-left px-3 py-2 text-[var(--color-text-secondary)] font-medium">
                          Type
                        </th>
                        <th className="text-left px-3 py-2 text-[var(--color-text-secondary)] font-medium">
                          Username
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {previewItems.slice(0, 50).map((item, i) => (
                        <tr key={i} className="hover:bg-[var(--color-surface)]">
                          <td className="px-3 py-2 text-[var(--color-text)] truncate max-w-[160px]">
                            {item.name}
                          </td>
                          <td className="px-3 py-2 text-[var(--color-text-secondary)] capitalize">
                            {item.type}
                          </td>
                          <td className="px-3 py-2 text-[var(--color-text-secondary)] truncate max-w-[120px]">
                            {item.type === 'login'
                              ? (item as unknown as { username: string }).username
                              : '—'}
                          </td>
                        </tr>
                      ))}
                      {previewItems.length > 50 && (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-3 py-2 text-center text-[var(--color-text-tertiary)] text-xs"
                          >
                            … and {previewItems.length - 50} more items
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-3">
                  <Button variant="secondary" onClick={handleReset} style={{ flex: 1 }}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={handleImport} style={{ flex: 1 }}>
                    Import {previewItems.length} Items
                  </Button>
                </div>
              </div>
            )}

            {importStep === 'importing' && (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <p className="text-sm text-[var(--color-text-secondary)] mb-3">
                    Encrypting and uploading items…
                  </p>
                  <div className="w-full bg-[var(--color-surface-raised)] rounded-[var(--radius-full)] h-2">
                    <div
                      className="bg-[var(--color-primary)] h-2 rounded-[var(--radius-full)] transition-all duration-300"
                      style={{
                        width: `${importTotal > 0 ? (importProgress / importTotal) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-2">
                    {importProgress} / {importTotal}
                  </p>
                </div>
              </div>
            )}

            {importStep === 'done' && (
              <div className="space-y-4">
                <div className="bg-[var(--color-success-subtle)] border border-[var(--color-success)] rounded-[var(--radius-md)] p-4">
                  <p className="text-sm font-medium text-[var(--color-success)]">
                    ✅ Successfully imported {importedCount} item{importedCount !== 1 ? 's' : ''}
                  </p>
                </div>

                {importErrors.length > 0 && (
                  <div className="bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-md)] p-4">
                    <p className="text-sm font-medium text-[var(--color-error)] mb-2">
                      {importErrors.length} item{importErrors.length !== 1 ? 's' : ''} failed:
                    </p>
                    <ul className="text-xs text-[var(--color-error)] space-y-1 max-h-32 overflow-y-auto">
                      {importErrors.map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="secondary" onClick={handleReset} style={{ flex: 1 }}>
                    Import More
                  </Button>
                  <Button variant="primary" onClick={() => navigate('/vault')} style={{ flex: 1 }}>
                    Go to Vault
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Card variant="surface" padding="md">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-1">Export</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Download your vault as a Bitwarden-compatible CSV file.
            </p>

            <div className="bg-[var(--color-warning-subtle)] border border-[var(--color-warning)] rounded-[var(--radius-md)] p-3 mb-4">
              <p className="text-xs text-[var(--color-warning)]">
                ⚠️ <strong>Warning:</strong> The exported file will contain your passwords in
                plaintext. Store it securely and delete it after use.
              </p>
            </div>

            <Button
              variant="secondary"
              onClick={handleExport}
              disabled={exportLoading}
              loading={exportLoading}
              style={{ width: '100%' }}
            >
              {exportLoading ? 'Preparing export…' : '⬇️ Download CSV Export'}
            </Button>
          </Card>

          <Card variant="surface" padding="md">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-3">
              Supported Formats
            </h2>
            <div className="space-y-2 text-sm">
              {[
                { name: 'Bitwarden', desc: 'Export from Bitwarden → Tools → Export Vault → CSV' },
                { name: 'Google Chrome', desc: 'Settings → Passwords → ⋮ → Export passwords' },
                { name: 'Mozilla Firefox', desc: 'about:logins → ⋮ → Export Logins' },
                { name: '1Password', desc: 'File → Export → All Items → CSV' },
                {
                  name: 'LastPass',
                  desc: 'Account Options → Advanced → Export → LastPass CSV File',
                },
                { name: 'KeePass', desc: 'File → Export → KeePass CSV' },
              ].map(({ name, desc }) => (
                <div key={name} className="flex gap-3">
                  <span className="font-medium text-[var(--color-text)] w-28 shrink-0">{name}</span>
                  <span className="text-[var(--color-text-secondary)]">{desc}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
