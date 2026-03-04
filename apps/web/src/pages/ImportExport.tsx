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

  const [exportLoading, setExportLoading] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setFileContent(text);

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
    <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <h1
          style={{
            fontSize: 'var(--font-size-xl)',
            fontWeight: 700,
            color: 'var(--color-text)',
            marginBottom: 16,
          }}
        >
          Import / Export
        </h1>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
            gap: 16,
          }}
        >
          <Card variant="surface" padding="lg" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <h2
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: 600,
                color: 'var(--color-text)',
                marginBottom: 4,
              }}
            >
              Import
            </h2>
            <p
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: 16,
              }}
            >
              Import passwords from Bitwarden, Chrome, Firefox, 1Password, LastPass, or KeePass.
            </p>

            {importStep === 'select' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Select
                  label="Format"
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value as ImportFormat)}
                  options={FORMAT_OPTIONS}
                />

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 500,
                      color: 'var(--color-text-secondary)',
                      marginBottom: 4,
                    }}
                  >
                    CSV File
                  </label>
                  <div
                    style={{
                      border: '2px dashed var(--color-text-tertiary)',
                      borderRadius: 'var(--radius-organic-lg)',
                      padding: 24,
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s, background 0.15s',
                      background: 'var(--color-bg)',
                    }}
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
                        <p
                          style={{
                            fontSize: 'var(--font-size-sm)',
                            fontWeight: 500,
                            color: 'var(--color-text)',
                          }}
                        >
                          📄 {fileName}
                        </p>
                        {detectedFormat !== 'unknown' && (
                          <p
                            style={{
                              fontSize: 'var(--font-size-xs)',
                              color: 'var(--color-text-secondary)',
                              marginTop: 4,
                            }}
                          >
                            Detected: {FORMAT_LABELS[detectedFormat]}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <p
                          style={{
                            fontSize: 'var(--font-size-sm)',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          Drop a CSV file here or{' '}
                          <span style={{ color: 'var(--color-primary)' }}>browse</span>
                        </p>
                        <p
                          style={{
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--color-text-tertiary)',
                            marginTop: 4,
                          }}
                        >
                          Supports .csv files
                        </p>
                      </div>
                    )}
                  </div>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    borderRadius: 'var(--radius-organic-lg)',
                    padding: 12,
                    background: 'var(--color-bg)',
                    boxShadow: 'var(--shadow-md)',
                  }}
                >
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)' }}>
                    Found <strong>{previewItems.length}</strong> items to import from{' '}
                    <strong>{FORMAT_LABELS[selectedFormat]}</strong>
                  </p>
                </div>

                <div
                  style={{
                    maxHeight: 256,
                    overflowY: 'auto',
                    borderRadius: 'var(--radius-organic-lg)',
                    boxShadow: 'var(--shadow-md)',
                    background: 'var(--color-bg)',
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      fontSize: 'var(--font-size-sm)',
                      borderCollapse: 'collapse',
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: 'var(--color-surface-raised)',
                          position: 'sticky',
                          top: 0,
                        }}
                      >
                        <th
                          style={{
                            textAlign: 'left',
                            padding: '8px 12px',
                            color: 'var(--color-text-secondary)',
                            fontWeight: 500,
                          }}
                        >
                          Name
                        </th>
                        <th
                          style={{
                            textAlign: 'left',
                            padding: '8px 12px',
                            color: 'var(--color-text-secondary)',
                            fontWeight: 500,
                          }}
                        >
                          Type
                        </th>
                        <th
                          style={{
                            textAlign: 'left',
                            padding: '8px 12px',
                            color: 'var(--color-text-secondary)',
                            fontWeight: 500,
                          }}
                        >
                          Username
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewItems.slice(0, 50).map((item, i) => (
                        <tr
                          key={i}
                          style={{
                            borderTop: i > 0 ? '1px solid var(--color-surface-raised)' : undefined,
                          }}
                        >
                          <td
                            style={{
                              padding: '8px 12px',
                              color: 'var(--color-text)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 160,
                            }}
                          >
                            {item.name}
                          </td>
                          <td
                            style={{
                              padding: '8px 12px',
                              color: 'var(--color-text-secondary)',
                              textTransform: 'capitalize',
                            }}
                          >
                            {item.type}
                          </td>
                          <td
                            style={{
                              padding: '8px 12px',
                              color: 'var(--color-text-secondary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 120,
                            }}
                          >
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
                            style={{
                              padding: '8px 12px',
                              textAlign: 'center',
                              color: 'var(--color-text-tertiary)',
                              fontSize: 'var(--font-size-xs)',
                            }}
                          >
                            … and {previewItems.length - 50} more items
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ textAlign: 'center', padding: 16 }}>
                  <p
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-secondary)',
                      marginBottom: 12,
                    }}
                  >
                    Encrypting and uploading items…
                  </p>
                  <div
                    style={{
                      width: '100%',
                      background: 'var(--color-surface-raised)',
                      borderRadius: 'var(--radius-full)',
                      height: 8,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        background: 'var(--color-primary)',
                        height: 8,
                        borderRadius: 'var(--radius-full)',
                        transition: 'width 0.3s',
                        width: `${importTotal > 0 ? (importProgress / importTotal) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <p
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--color-text-secondary)',
                      marginTop: 8,
                    }}
                  >
                    {importProgress} / {importTotal}
                  </p>
                </div>
              </div>
            )}

            {importStep === 'done' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    borderRadius: 'var(--radius-organic-lg)',
                    padding: 16,
                    background: 'var(--color-success-subtle)',
                    boxShadow: 'var(--shadow-md)',
                  }}
                >
                  <p
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 500,
                      color: 'var(--color-success)',
                    }}
                  >
                    ✅ Successfully imported {importedCount} item{importedCount !== 1 ? 's' : ''}
                  </p>
                </div>

                {importErrors.length > 0 && (
                  <div
                    style={{
                      borderRadius: 'var(--radius-organic-lg)',
                      padding: 16,
                      background: 'var(--color-error-subtle)',
                      boxShadow: 'var(--shadow-md)',
                    }}
                  >
                    <p
                      style={{
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 500,
                        color: 'var(--color-error)',
                        marginBottom: 8,
                      }}
                    >
                      {importErrors.length} item{importErrors.length !== 1 ? 's' : ''} failed:
                    </p>
                    <ul
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-error)',
                        maxHeight: 128,
                        overflowY: 'auto',
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      {importErrors.map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12 }}>
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

          <Card
            variant="surface"
            padding="lg"
            style={{ boxShadow: 'var(--shadow-lg)', alignSelf: 'start' }}
          >
            <h2
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: 600,
                color: 'var(--color-text)',
                marginBottom: 4,
              }}
            >
              Export
            </h2>
            <p
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: 16,
              }}
            >
              Download your vault as a Bitwarden-compatible CSV file.
            </p>

            <div
              style={{
                borderRadius: 'var(--radius-organic-lg)',
                padding: 12,
                marginBottom: 16,
                background: 'var(--color-warning-subtle)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)' }}>
                ⚠️ <strong>Warning:</strong> The exported file will contain your passwords in
                plaintext. Store it securely and delete it after use.
              </p>
            </div>

            <Button
              variant="secondary"
              onClick={handleExport}
              disabled={exportLoading}
              loading={exportLoading}
              style={{ width: '100%', marginBottom: 24 }}
            >
              {exportLoading ? 'Preparing export…' : '⬇️ Download CSV Export'}
            </Button>

            <div style={{ borderTop: '1px solid var(--color-surface-raised)', paddingTop: 16 }}>
              <h3
                style={{
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  marginBottom: 12,
                }}
              >
                Supported Formats
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                  <div key={name} style={{ display: 'flex', gap: 12 }}>
                    <span
                      style={{
                        fontWeight: 500,
                        color: 'var(--color-text)',
                        width: 112,
                        flexShrink: 0,
                        fontSize: 'var(--font-size-sm)',
                      }}
                    >
                      {name}
                    </span>
                    <span
                      style={{
                        color: 'var(--color-text-secondary)',
                        fontSize: 'var(--font-size-sm)',
                      }}
                    >
                      {desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
