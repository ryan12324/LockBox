import React, { useState, useEffect } from 'react';
import { Button, Card } from '@lockbox/design';
import { getRemainingSeconds } from '@lockbox/totp';
import type {
  VaultItem,
  LoginItem,
  SecureNoteItem,
  CardItem,
  IdentityItem,
  PasskeyItem,
  DocumentItem,
  Folder,
} from '@lockbox/types';
import { sendMessage, typeIcon, formatFileSize } from './shared.js';

export function ItemDetailView({
  item,
  folders,
  onEdit,
  onDelete,
  onBack,
  onHistory,
}: {
  item: VaultItem;
  folders: Folder[];
  onEdit: () => void;
  onDelete: () => void;
  onBack: () => void;
  onHistory: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
  const [showCardNumber, setShowCardNumber] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [totpRemaining, setTotpRemaining] = useState(0);
  const [attachments, setAttachments] = useState<
    Array<{ id: string; fileName: string; fileSize: number; mimeType: string; createdAt: string }>
  >([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<
    Array<{ id: string; revisionDate: string; createdAt: string; data: VaultItem | null }>
  >([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);

  const login = item.type === 'login' ? (item as LoginItem) : null;
  const note = item.type === 'note' ? (item as SecureNoteItem) : null;
  const card = item.type === 'card' ? (item as CardItem) : null;
  const identity = item.type === 'identity' ? (item as IdentityItem) : null;
  const passkey = item.type === 'passkey' ? (item as PasskeyItem) : null;
  const doc = item.type === 'document' ? (item as DocumentItem) : null;
  const [showSsn, setShowSsn] = useState(false);
  const [showPassport, setShowPassport] = useState(false);
  const [showLicense, setShowLicense] = useState(false);
  const [showCustomHidden, setShowCustomHidden] = useState<Record<number, boolean>>({});
  const folder = folders.find((f) => f.id === item.folderId);

  async function copyField(text: string, field: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  }

  useEffect(() => {
    if (!login?.totp) return;
    let intervalId: ReturnType<typeof setInterval>;

    async function refresh() {
      const result = await sendMessage<{ code: string | null }>({
        type: 'get-totp',
        secret: login!.totp,
      });
      if (result.code) setTotpCode(result.code);
      setTotpRemaining(getRemainingSeconds());
    }

    refresh();
    intervalId = setInterval(refresh, 1000);
    return () => clearInterval(intervalId);
  }, [login?.totp]);

  useEffect(() => {
    sendMessage<{
      success: boolean;
      attachments?: Array<{
        id: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        createdAt: string;
      }>;
    }>({
      type: 'get-attachments',
      itemId: item.id,
    })
      .then((res) => {
        if (res.success && res.attachments) setAttachments(res.attachments);
      })
      .catch(() => {});
  }, [item.id]);

  async function handleDownloadAttachment(attachmentId: string, fileName: string) {
    setDownloadingId(attachmentId);
    try {
      const res = await sendMessage<{ success: boolean; encryptedData?: string }>({
        type: 'download-attachment',
        itemId: item.id,
        attachmentId,
      });
      if (res.success && res.encryptedData) {
        const blob = new Blob([Uint8Array.from(atob(res.encryptedData), (c) => c.charCodeAt(0))]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // ignore
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const result = await sendMessage<{ success: boolean }>({ type: 'delete-item', id: item.id });
      if (result.success) onDelete();
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  }

  const fieldRow = (
    label: string,
    value: string,
    fieldId: string,
    opts?: { hidden?: boolean; toggle?: () => void; shown?: boolean }
  ) => (
    <div className="mb-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] px-3 mb-1">
        {label}
      </div>
      <Card variant="surface" padding="sm">
        <div className="flex items-center justify-between">
          <span
            className={`text-xs ${opts?.hidden && !opts?.shown ? '' : 'font-mono'} text-[var(--color-text)] truncate max-w-[220px]`}
          >
            {opts?.hidden && !opts?.shown ? '••••••••••••' : value}
          </span>
          <div className="flex gap-1 shrink-0">
            {opts?.toggle && (
              <Button variant="ghost" size="sm" onClick={opts.toggle}>
                {opts?.shown ? '🙈' : '👁️'}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => copyField(value, fieldId)}>
              {copied === fieldId ? '✓' : '📋'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-border)]">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ←
        </Button>
        <span className="text-lg">{typeIcon(item.type)}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[var(--color-text)] truncate">{item.name}</div>
          {folder && (
            <div className="text-xs text-[var(--color-text-tertiary)]">📁 {folder.name}</div>
          )}
        </div>
        <div className="flex gap-1">
          <Button variant="secondary" size="sm" onClick={onHistory} title="Version History">
            📜
          </Button>
          <Button variant="secondary" size="sm" onClick={onEdit}>
            Edit
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {item.favorite && (
          <div className="text-xs text-[var(--color-warning)] mb-2">⭐ Favorite</div>
        )}

        {login && (
          <>
            {login.username && fieldRow('Username', login.username, 'user')}
            {login.password &&
              fieldRow('Password', login.password, 'pass', {
                hidden: true,
                toggle: () => setShowPassword(!showPassword),
                shown: showPassword,
              })}
            {login.totp && totpCode && (
              <div className="mb-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] px-3 mb-1">
                  TOTP Code
                </div>
                <Card variant="surface" padding="sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[18px] tracking-widest text-[var(--color-primary)] font-bold">
                      {totpCode.slice(0, 3)} {totpCode.slice(3)}
                    </span>
                    <div className="flex items-center gap-1">
                      <span
                        className={`text-xs ${totpRemaining <= 5 ? 'text-[var(--color-error)]' : 'text-[var(--color-text-tertiary)]'}`}
                      >
                        {totpRemaining}s
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => copyField(totpCode, 'totp')}>
                        {copied === 'totp' ? '✓' : '📋'}
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            )}
            {login.uris
              ?.filter((u) => u.trim())
              .map((uri, idx) => (
                <div key={idx} className="mb-1">
                  {idx === 0 && (
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] px-3 mb-1">
                      URIs
                    </div>
                  )}
                  <Card variant="surface" padding="sm">
                    <div className="flex items-center justify-between">
                      <a
                        href={uri.startsWith('http') ? uri : `https://${uri}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[var(--color-primary)] no-underline truncate max-w-[250px]"
                      >
                        {uri}
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyField(uri, `uri-${idx}`)}
                      >
                        {copied === `uri-${idx}` ? '✓' : '📋'}
                      </Button>
                    </div>
                  </Card>
                </div>
              ))}
          </>
        )}

        {note && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] px-3 mb-1">
              Note
            </div>
            <Card variant="surface" padding="sm">
              <div className="text-xs text-[var(--color-text)] whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                {note.content}
              </div>
            </Card>
          </div>
        )}

        {card && (
          <>
            {card.cardholderName && fieldRow('Cardholder', card.cardholderName, 'holder')}
            {card.number &&
              fieldRow('Card Number', card.number, 'cardnum', {
                hidden: true,
                toggle: () => setShowCardNumber(!showCardNumber),
                shown: showCardNumber,
              })}
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] px-3 mb-1">
                  Expires
                </div>
                <Card variant="surface" padding="sm">
                  <span className="text-xs text-[var(--color-text)]">
                    {card.expMonth}/{card.expYear}
                  </span>
                </Card>
              </div>
              {card.cvv && (
                <div className="flex-1">
                  {fieldRow('CVV', card.cvv, 'cvv', {
                    hidden: true,
                    toggle: () => setShowCvv(!showCvv),
                    shown: showCvv,
                  })}
                </div>
              )}
            </div>
            {card.brand && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] px-3 mb-1">
                  Brand
                </div>
                <Card variant="surface" padding="sm">
                  <span className="text-xs text-[var(--color-text)]">{card.brand}</span>
                </Card>
              </div>
            )}
          </>
        )}

        {attachments.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] px-3 mb-1">
              Attachments ({attachments.length})
            </div>
            <div className="flex flex-col gap-1">
              {attachments.map((att) => (
                <Card key={att.id} variant="surface" padding="sm">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-[var(--color-text)] truncate">
                        {att.fileName}
                      </div>
                      <div className="text-[10px] text-[var(--color-text-tertiary)]">
                        {formatFileSize(att.fileSize)}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDownloadAttachment(att.id, att.fileName)}
                      disabled={downloadingId === att.id}
                      className="shrink-0 ml-2"
                    >
                      {downloadingId === att.id ? '...' : '⬇️'}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {identity && (
          <>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] px-3 mt-2 mb-1">
              Personal
            </div>
            {identity.firstName && fieldRow('First Name', identity.firstName, 'id-first')}
            {identity.middleName && fieldRow('Middle Name', identity.middleName, 'id-middle')}
            {identity.lastName && fieldRow('Last Name', identity.lastName, 'id-last')}
            {identity.email && fieldRow('Email', identity.email, 'id-email')}
            {identity.phone && fieldRow('Phone', identity.phone, 'id-phone')}
            {identity.company && fieldRow('Company', identity.company, 'id-company')}

            {(identity.address1 ||
              identity.city ||
              identity.state ||
              identity.postalCode ||
              identity.country) && (
              <>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] px-3 mt-3 mb-1">
                  Address
                </div>
                {identity.address1 && fieldRow('Address 1', identity.address1, 'id-addr1')}
                {identity.address2 && fieldRow('Address 2', identity.address2, 'id-addr2')}
                {identity.city && fieldRow('City', identity.city, 'id-city')}
                {identity.state && fieldRow('State', identity.state, 'id-state')}
                {identity.postalCode && fieldRow('Postal Code', identity.postalCode, 'id-zip')}
                {identity.country && fieldRow('Country', identity.country, 'id-country')}
              </>
            )}

            {(identity.ssn || identity.passportNumber || identity.licenseNumber) && (
              <>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] px-3 mt-3 mb-1">
                  Identification
                </div>
                {identity.ssn &&
                  fieldRow('SSN', identity.ssn, 'id-ssn', {
                    hidden: true,
                    toggle: () => setShowSsn(!showSsn),
                    shown: showSsn,
                  })}
                {identity.passportNumber &&
                  fieldRow('Passport', identity.passportNumber, 'id-passport', {
                    hidden: true,
                    toggle: () => setShowPassport(!showPassport),
                    shown: showPassport,
                  })}
                {identity.licenseNumber &&
                  fieldRow('License', identity.licenseNumber, 'id-license', {
                    hidden: true,
                    toggle: () => setShowLicense(!showLicense),
                    shown: showLicense,
                  })}
              </>
            )}
          </>
        )}

        {passkey && (
          <>
            {fieldRow('Relying Party', passkey.rpName, 'pk-rp')}
            {fieldRow('RP ID', passkey.rpId, 'pk-rpid')}
            {fieldRow('User', passkey.userName, 'pk-user')}
          </>
        )}

        {doc && (
          <>
            {doc.description && fieldRow('Description', doc.description, 'doc-desc')}
            {doc.mimeType && fieldRow('Type', doc.mimeType, 'doc-mime')}
            {doc.size != null && (
              <div className="mb-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] px-3 mb-1">
                  Size
                </div>
                <Card variant="surface" padding="sm">
                  <span className="text-xs text-[var(--color-text)]">
                    {formatFileSize(doc.size)}
                  </span>
                </Card>
              </div>
            )}
          </>
        )}

        {item.customFields && item.customFields.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] px-3 mb-1">
              Custom Fields ({item.customFields.length})
            </div>
            <div className="flex flex-col gap-1">
              {item.customFields.map((cf, idx) => (
                <div key={idx} className="mb-1">
                  {cf.type === 'boolean' ? (
                    <Card variant="surface" padding="sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          {cf.name}
                        </span>
                        <span className="text-xs text-[var(--color-text)]">
                          {cf.value === 'true' ? '✓ Yes' : '✗ No'}
                        </span>
                      </div>
                    </Card>
                  ) : cf.type === 'hidden' ? (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] px-3 mb-1">
                        {cf.name}
                      </div>
                      <Card variant="surface" padding="sm">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-[var(--color-text)] truncate max-w-[220px]">
                            {showCustomHidden[idx] ? cf.value : '••••••••••••'}
                          </span>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setShowCustomHidden((prev) => ({ ...prev, [idx]: !prev[idx] }))
                              }
                            >
                              {showCustomHidden[idx] ? '🙈' : '👁️'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyField(cf.value, `cf-${idx}`)}
                            >
                              {copied === `cf-${idx}` ? '✓' : '📋'}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    </div>
                  ) : (
                    fieldRow(cf.name, cf.value, `cf-${idx}`)
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setShowVersions(!showVersions);
              if (!showVersions && versions.length === 0) {
                setVersionsLoading(true);
                sendMessage<{ success: boolean; versions?: typeof versions }>({
                  type: 'get-versions',
                  itemId: item.id,
                })
                  .then((res) => {
                    if (res.success && res.versions) setVersions(res.versions);
                  })
                  .catch(() => {})
                  .finally(() => setVersionsLoading(false));
              }
            }}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}
          >
            <span>📜 Version History</span>
            <span className="text-[var(--color-text-tertiary)]">{showVersions ? '▲' : '▼'}</span>
          </Button>
          {showVersions && (
            <div className="mt-1 flex flex-col gap-1">
              {versionsLoading ? (
                <div className="text-center text-[var(--color-text-tertiary)] text-xs py-3">
                  Loading...
                </div>
              ) : versions.length === 0 ? (
                <div className="text-center text-xs text-[var(--color-text-tertiary)] py-3">
                  No previous versions
                </div>
              ) : (
                versions.map((version, idx) => (
                  <Card key={version.id} variant="surface" padding="sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-[var(--color-text-secondary)]">
                          {idx === 0 ? 'Latest' : `v${versions.length - idx}`}
                        </div>
                        <div className="text-[10px] text-[var(--color-text-tertiary)]">
                          {new Date(version.revisionDate).toLocaleString()}
                        </div>
                      </div>
                      {idx > 0 && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={async () => {
                            setRestoringVersionId(version.id);
                            await sendMessage<{ success: boolean }>({
                              type: 'restore-version',
                              itemId: item.id,
                              versionId: version.id,
                            }).catch(() => {});
                            setRestoringVersionId(null);
                          }}
                          disabled={restoringVersionId === version.id}
                        >
                          {restoringVersionId === version.id ? '...' : 'Restore'}
                        </Button>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-[var(--color-border)]">
          {confirmDelete ? (
            <div className="bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-sm)] p-2.5">
              <div className="text-xs text-[var(--color-error)] mb-2">
                Delete this item? This cannot be undone.
              </div>
              <div className="flex gap-1.5">
                <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Deleting...' : 'Delete'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              style={{ width: '100%' }}
            >
              Delete Item
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
