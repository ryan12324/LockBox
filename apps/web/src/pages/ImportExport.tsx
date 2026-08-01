import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  findImportDuplicates,
  findLegacyLastPassSecureNoteRepairs,
  lastPassAdapter,
  type DuplicateStrategy,
  type ImportDuplicate,
  type ImportParseResult,
  type ImportRecord,
  type LegacyLastPassSecureNoteRepair,
} from '@lockbox/importers';
import { Button, Card, Icon, Select, SiteFavicon, getEntryFaviconSources } from '@lockbox/design';
import type { LoginItem } from '@lockbox/types';
import { useAuthStore } from '../store/auth.js';
import { decryptVaultItem, encryptVaultItem } from '../lib/crypto.js';
import { api } from '../lib/api.js';
import { exportToBitwardenCSV } from '../lib/importers/index.js';
import { runEncryptedImport, type ImportWorkflowResult } from '../lib/import-workflow.js';
import { useToast } from '../providers/ToastProvider.js';
import './ImportExport.css';

type ImportStep = 'select' | 'preview' | 'importing' | 'done';

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const MAX_RENDERED_RECORDS = 250;

function recordSubtitle(record: ImportRecord): string {
  if (record.item.type === 'login') {
    const login = record.item as LoginItem;
    return login.username || login.uris[0] || 'Login details present';
  }
  return 'Secure note';
}

function recordMatches(record: ImportRecord, query: string): boolean {
  if (!query) return true;
  const searchable = [
    record.item.name,
    recordSubtitle(record),
    record.folderPath.join(' '),
    String(record.sourceRow),
  ]
    .join(' ')
    .toLocaleLowerCase();
  return searchable.includes(query.toLocaleLowerCase());
}

export default function ImportExport() {
  const navigate = useNavigate();
  const { session, userKey } = useAuthStore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importStep, setImportStep] = useState<ImportStep>('select');
  const [fileName, setFileName] = useState('');
  const [parseResult, setParseResult] = useState<ImportParseResult | null>(null);
  const [fileError, setFileError] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [duplicates, setDuplicates] = useState<ImportDuplicate[]>([]);
  const [legacyRepairs, setLegacyRepairs] = useState<LegacyLastPassSecureNoteRepair[]>([]);
  const [existingFolders, setExistingFolders] = useState<Awaited<ReturnType<typeof api.vault.list>>['folders']>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip');
  const [reviewQuery, setReviewQuery] = useState('');
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importResult, setImportResult] = useState<ImportWorkflowResult | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  const records = parseResult?.records ?? [];
  const duplicateIds = useMemo(
    () => new Set(duplicates.map((duplicate) => duplicate.sourceId)),
    [duplicates],
  );
  const fileIssues = parseResult?.issues ?? [];
  const invalidCount = records.filter((record) => !record.importable).length;
  const warningCount = records.reduce(
    (count, record) => count + record.issues.filter((issue) => issue.severity === 'warning').length,
    fileIssues.filter((issue) => issue.severity === 'warning').length,
  );
  const folderCount = new Set(
    records.filter((record) => record.folderPath.length > 0).map((record) => record.folderPath.join('\u001f')),
  ).size;
  const selectedImportCount = records.filter(
    (record) =>
      record.importable &&
      selectedSourceIds.has(record.sourceId) &&
      (duplicateStrategy === 'keep-both' || !duplicateIds.has(record.sourceId)),
  ).length;
  const filteredRecords = records
    .filter((record) => recordMatches(record, reviewQuery.trim()))
    .slice(0, MAX_RENDERED_RECORDS);

  async function processFile(file: File) {
    setFileError('');
    setParseResult(null);
    setFileName(file.name);
    if (file.size > MAX_IMPORT_BYTES) {
      setFileError('That file is larger than 20 MB. Split the export into smaller CSV files.');
      return;
    }
    if (!file.name.toLocaleLowerCase().endsWith('.csv')) {
      setFileError('Choose the CSV file exported by LastPass.');
      return;
    }

    try {
      const text = await file.text();
      const result = lastPassAdapter.parse(text);
      setParseResult(result);
      if (result.issues.some((issue) => issue.severity === 'error')) {
        setFileError(result.issues.find((issue) => issue.severity === 'error')?.message ?? 'This CSV could not be read.');
      }
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Lockbox could not read that file.');
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
  }

  function handleFileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void processFile(file);
  }

  async function handlePreview() {
    if (!parseResult || !session || !userKey) {
      toast('Unlock your vault before reviewing an import', 'error');
      return;
    }
    setReviewLoading(true);
    try {
      const vault = await api.vault.list(session.token);
      const existingItems = await Promise.all(
        vault.items
          .filter((item) => !item.deletedAt)
          .map((item) =>
            decryptVaultItem(item.encryptedData, userKey, item.id, item.revisionDate),
          ),
      );
      setExistingFolders(vault.folders);
      setDuplicates(findImportDuplicates(parseResult.records, existingItems));
      setLegacyRepairs(findLegacyLastPassSecureNoteRepairs(parseResult.records, existingItems));
      setSelectedSourceIds(
        new Set(
          parseResult.records
            .filter((record) => record.importable)
            .map((record) => record.sourceId),
        ),
      );
      setImportStep('preview');
    } catch (error) {
      toast(
        error instanceof Error
          ? `Could not compare this import with your vault: ${error.message}`
          : 'Could not compare this import with your vault.',
        'error',
      );
    } finally {
      setReviewLoading(false);
    }
  }

  function toggleRecord(record: ImportRecord) {
    if (!record.importable) return;
    setSelectedSourceIds((current) => {
      const next = new Set(current);
      if (next.has(record.sourceId)) next.delete(record.sourceId);
      else next.add(record.sourceId);
      return next;
    });
  }

  async function handleImport() {
    if (!session || !userKey || !parseResult || selectedImportCount === 0) return;
    setImportStep('importing');
    setImportProgress(0);
    setImportTotal(selectedImportCount);

    const result = await runEncryptedImport({
      records: parseResult.records,
      selectedSourceIds,
      duplicates,
      legacyRepairs,
      duplicateStrategy,
      existingFolders,
      encryptItem: (item, itemId, revisionDate) =>
        encryptVaultItem(item, userKey, itemId, revisionDate),
      createItem: (body) => api.vault.createItem(body, session.token),
      createFolder: (body) => api.vault.createFolder(body, session.token),
      deleteItem: (id) => api.vault.deleteItem(id, session.token),
      onProgress: (completed, total) => {
        setImportProgress(completed);
        setImportTotal(total);
      },
    });

    setImportResult(result);
    setParseResult(null);
    setSelectedSourceIds(new Set());
    setDuplicates([]);
    setLegacyRepairs([]);
    setImportStep('done');
  }

  function handleReset() {
    setImportStep('select');
    setFileName('');
    setParseResult(null);
    setFileError('');
    setDuplicates([]);
    setLegacyRepairs([]);
    setExistingFolders([]);
    setSelectedSourceIds(new Set());
    setDuplicateStrategy('skip');
    setReviewQuery('');
    setImportProgress(0);
    setImportTotal(0);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleExport() {
    if (!session || !userKey) {
      toast('Unlock your vault before exporting', 'error');
      return;
    }
    setExportLoading(true);
    try {
      const data = await api.vault.list(session.token);
      const decryptedItems = await Promise.all(
        data.items
          .filter((item) => !item.deletedAt)
          .map((item) =>
            decryptVaultItem(item.encryptedData, userKey, item.id, item.revisionDate),
          ),
      );
      const csvContent = exportToBitwardenCSV(decryptedItems);
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `lockbox-export-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Export failed', 'error');
    } finally {
      setExportLoading(false);
    }
  }

  return (
    <main className="import-page">
      <div className="import-page__inner">
        <header className="import-page__header">
          <div>
            <p className="import-page__eyebrow">Vault tools</p>
            <h1>Move your passwords safely</h1>
            <p>Review every item locally before Lockbox encrypts and saves it.</p>
          </div>
          <div className="import-page__privacy">
            <Icon name="shield-lock" size={19} />
            <span><strong>Client-side only</strong>Your CSV is never uploaded.</span>
          </div>
        </header>

        <div className="import-page__layout">
          <Card variant="surface" padding="lg" className="import-card">
            <div className="import-card__heading">
              <span className="import-card__icon"><Icon name="upload" size={21} /></span>
              <div><h2>Import from LastPass</h2><p>Production-ready CSV import with folders, notes, favourites, and TOTP.</p></div>
            </div>

            {importStep === 'select' && (
              <section className="import-select" aria-labelledby="lastpass-file-label">
                <div className="import-provider">
                  <div><span>Source</span><strong>LastPass CSV</strong></div>
                  <span className="import-status import-status--ready"><Icon name="circle-check" size={14} /> Ready</span>
                </div>

                <div
                  className={`import-dropzone${fileError ? ' import-dropzone--error' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click();
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleFileDrop}
                  role="button"
                  tabIndex={0}
                  aria-labelledby="lastpass-file-label"
                >
                  <span className="import-dropzone__icon"><Icon name={fileName ? 'file-description' : 'upload'} size={24} /></span>
                  <div>
                    <strong id="lastpass-file-label">{fileName || 'Choose your LastPass export'}</strong>
                    <span>{fileName ? `${records.length} item${records.length === 1 ? '' : 's'} found` : 'Drop a .csv file here or browse · up to 20 MB'}</span>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} />
                </div>

                {fileError && <div className="import-message import-message--error" role="alert"><Icon name="alert-circle" size={17} /><span>{fileError}</span></div>}
                {!fileError && parseResult && (
                  <div className="import-message import-message--success" role="status"><Icon name="circle-check" size={17} /><span>LastPass format verified. Password values stay hidden during review.</span></div>
                )}

                {fileIssues.length > 1 && (
                  <details className="import-issues"><summary>Show {fileIssues.length} file messages</summary><ul>{fileIssues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul></details>
                )}

                <div className="import-actions">
                  <Button variant="primary" onClick={handlePreview} disabled={!parseResult || Boolean(fileError)} loading={reviewLoading}>
                    {!reviewLoading && <Icon name="clipboard" size={17} />} Review import
                  </Button>
                </div>
              </section>
            )}

            {importStep === 'preview' && (
              <section className="import-review" aria-label="Review LastPass import">
                <div className="import-summary" aria-label="Import summary">
                  <div><strong>{records.length}</strong><span>Found</span></div>
                  <div><strong>{duplicates.length}</strong><span>Duplicates</span></div>
                  <div><strong>{folderCount}</strong><span>Folders</span></div>
                  <div><strong>{invalidCount}</strong><span>Needs attention</span></div>
                </div>

                {legacyRepairs.length > 0 && (
                  <div className="import-message import-message--warning" role="status">
                    <Icon name="history" size={17} />
                    <span>
                      <strong>{legacyRepairs.length} legacy secure-note {legacyRepairs.length === 1 ? 'match' : 'matches'} found.</strong>{' '}
                      For each selected match, Lockbox will import the recovered note first, then move its broken <code>http://sn</code> login copy to Trash.
                    </span>
                  </div>
                )}

                <div className="import-review__controls">
                  <label className="import-search"><Icon name="search" size={17} /><input value={reviewQuery} onChange={(event) => setReviewQuery(event.target.value)} placeholder="Find an item or folder" aria-label="Find an item or folder" /></label>
                  <Select
                    label="Duplicates"
                    value={duplicateStrategy}
                    onChange={(event) => setDuplicateStrategy(event.target.value as DuplicateStrategy)}
                    options={[
                      { value: 'skip', label: 'Skip existing (recommended)' },
                      { value: 'keep-both', label: 'Keep both copies' },
                    ]}
                  />
                </div>

                <div className="import-review__meta">
                  <span>{selectedImportCount} selected for encrypted import</span>
                  <span>{warningCount > 0 ? `${warningCount} warning${warningCount === 1 ? '' : 's'}` : 'No data warnings'}</span>
                  <button type="button" onClick={() => setSelectedSourceIds(new Set(records.filter((record) => record.importable).map((record) => record.sourceId)))}>Select all valid</button>
                  <button type="button" onClick={() => setSelectedSourceIds(new Set())}>Clear</button>
                </div>

                <div className="import-table-wrap">
                  <table className="import-table">
                    <thead><tr><th className="import-table__check"><span className="sr-only">Select</span></th><th>Item</th><th>Folder</th><th>Status</th></tr></thead>
                    <tbody>
                      {filteredRecords.map((record) => {
                        const duplicate = duplicateIds.has(record.sourceId);
                        const firstIssue = record.issues[0];
                        return (
                          <tr key={record.sourceId} className={!record.importable ? 'import-table__row--invalid' : ''}>
                            <td className="import-table__check"><input type="checkbox" checked={selectedSourceIds.has(record.sourceId)} disabled={!record.importable || (duplicate && duplicateStrategy === 'skip')} onChange={() => toggleRecord(record)} aria-label={`Import ${record.item.name}`} /></td>
                            <td><div className="import-item"><SiteFavicon sources={getEntryFaviconSources(record.item)} fallbackIcon={record.item.type === 'note' ? 'note' : 'key'} size={20} /><span><strong>{record.item.name}</strong><small>{recordSubtitle(record)} · row {record.sourceRow}</small></span></div></td>
                            <td><span className="import-folder">{record.folderPath.length > 0 ? record.folderPath.join(' / ') : 'No folder'}</span></td>
                            <td>
                              {!record.importable ? <span className="import-status import-status--error">Needs attention</span> : duplicate ? <span className="import-status import-status--warning">Duplicate</span> : firstIssue ? <span className="import-status import-status--warning">Warning</span> : <span className="import-status import-status--ready">Ready</span>}
                              {firstIssue && <small className="import-table__issue">{firstIssue.message}</small>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {records.filter((record) => recordMatches(record, reviewQuery.trim())).length > MAX_RENDERED_RECORDS && <p className="import-review__limit">Showing the first {MAX_RENDERED_RECORDS} matches. All selected items will still import.</p>}

                <div className="import-actions import-actions--split">
                  <Button variant="secondary" onClick={handleReset}>Cancel</Button>
                  <Button variant="primary" onClick={handleImport} disabled={selectedImportCount === 0}><Icon name="lock" size={17} /> Encrypt &amp; import {selectedImportCount}</Button>
                </div>
              </section>
            )}

            {importStep === 'importing' && (
              <section className="import-progress" aria-live="polite">
                <span className="import-progress__icon"><Icon name="shield-lock" size={28} /></span>
                <h3>Encrypting your import</h3>
                <p>Folders are prepared first, then each item is encrypted before it leaves this device.</p>
                <div className="import-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={importTotal} aria-valuenow={importProgress}><span style={{ width: `${importTotal > 0 ? (importProgress / importTotal) * 100 : 0}%` }} /></div>
                <strong>{importProgress} of {importTotal}</strong>
              </section>
            )}

            {importStep === 'done' && importResult && (
              <section className="import-done">
                <span className="import-done__icon"><Icon name={importResult.failures.length > 0 || importResult.cleanupFailures.length > 0 ? 'alert-triangle' : 'circle-check'} size={30} /></span>
                <h3>{importResult.failures.length > 0 || importResult.cleanupFailures.length > 0 ? 'Import finished with some issues' : 'Your passwords are in Lockbox'}</h3>
                <p>{importResult.importedCount} item{importResult.importedCount === 1 ? '' : 's'} imported · {importResult.createdFolders.length} folder{importResult.createdFolders.length === 1 ? '' : 's'} created{importResult.duplicateSkippedCount > 0 ? ` · ${importResult.duplicateSkippedCount} duplicate${importResult.duplicateSkippedCount === 1 ? '' : 's'} skipped` : ''}{importResult.legacyRepairedCount > 0 ? ` · ${importResult.legacyRepairedCount} broken secure-note ${importResult.legacyRepairedCount === 1 ? 'copy' : 'copies'} moved to Trash` : ''}.</p>
                {importResult.failures.length > 0 && <div className="import-failures" role="alert"><strong>{importResult.failures.length} item{importResult.failures.length === 1 ? '' : 's'} could not be imported</strong><ul>{importResult.failures.map((failure) => <li key={failure.sourceId}><span>{failure.itemName} · row {failure.sourceRow}</span><small>{failure.message}</small></li>)}</ul></div>}
                {importResult.cleanupFailures.length > 0 && <div className="import-failures" role="alert"><strong>{importResult.cleanupFailures.length} broken {importResult.cleanupFailures.length === 1 ? 'copy remains' : 'copies remain'}</strong><ul>{importResult.cleanupFailures.map((failure) => <li key={failure.sourceId}><span>{failure.itemName} · row {failure.sourceRow}</span><small>{failure.message}</small></li>)}</ul></div>}
                <div className="import-actions import-actions--split"><Button variant="secondary" onClick={handleReset}>Import another file</Button><Button variant="primary" onClick={() => navigate('/vault')}>Open vault</Button></div>
              </section>
            )}
          </Card>

          <aside className="import-sidebar">
            <Card variant="surface" padding="lg">
              <div className="import-card__heading"><span className="import-card__icon"><Icon name="download" size={21} /></span><div><h2>Export from Lockbox</h2><p>Download a Bitwarden-compatible CSV.</p></div></div>
              <div className="import-message import-message--warning"><Icon name="alert-triangle" size={17} /><span>The export contains plaintext passwords. Delete it as soon as you finish moving your data.</span></div>
              <Button variant="secondary" onClick={handleExport} loading={exportLoading} disabled={exportLoading} className="import-export-button">{!exportLoading && <Icon name="download" size={17} />}{exportLoading ? 'Preparing export…' : 'Download CSV export'}</Button>
            </Card>

            <Card variant="surface" padding="lg" className="import-guide">
              <h3>Export from LastPass</h3>
              <ol><li><span>1</span><p>Open LastPass and choose <strong>Advanced Options</strong>.</p></li><li><span>2</span><p>Select <strong>Export</strong>, then download the LastPass CSV.</p></li><li><span>3</span><p>Return here, review the items, then delete the CSV.</p></li></ol>
              <p className="import-guide__future"><Icon name="settings" size={16} /> The provider adapter is ready for more password managers in v2.</p>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}
