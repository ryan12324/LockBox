import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/auth.js';
import { encryptFile, decryptFile } from '../lib/file-crypto.js';
import { encryptString, decryptString } from '@lockbox/crypto';
import { Button, Icon } from '@lockbox/design';
import { useToast } from '../providers/ToastProvider.js';

interface Attachment {
  id: string;
  itemId: string;
  encryptedName: string;
  encryptedMimeType: string;
  size: number;
  createdAt: string;
}

interface DecryptedAttachment extends Attachment {
  name: string;
  mimeType: string;
  previewUrl?: string;
}

interface Props {
  itemId: string;
  mode: 'view' | 'edit' | 'add';
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_USER_QUOTA = 100 * 1024 * 1024; // 100MB

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function AttachmentSection({ itemId, mode }: Props) {
  const { session, userKey } = useAuthStore();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<DecryptedAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [isDragging, setIsDragging] = useState(false);
  const [quotaUsed, setQuotaUsed] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const API_BASE = import.meta.env.VITE_API_URL ?? '';

  const fetchAttachments = async () => {
    if (mode === 'add' || !session?.token || !userKey) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/vault/items/${itemId}/attachments`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) throw new Error('Failed to load attachments');

      const data = (await res.json()) as {
        attachments: Attachment[];
        quota?: { used: number; limit: number };
      };

      const decrypted = await Promise.all(
        data.attachments.map(async (a: Attachment) => {
          let name = 'Unknown File';
          let mimeType = 'application/octet-stream';
          try {
            // Note: Using itemId as AAD based on encryption setup
            name = await decryptString(
              a.encryptedName,
              userKey.slice(0, 32),
              new TextEncoder().encode(`${itemId}:${a.id}`)
            );
            mimeType = await decryptString(
              a.encryptedMimeType,
              userKey.slice(0, 32),
              new TextEncoder().encode(`${itemId}:${a.id}`)
            );
          } catch (e) {
            console.error('Failed to decrypt attachment metadata', e);
          }

          return { ...a, name, mimeType };
        })
      );

      setAttachments(decrypted);
      setQuotaUsed(data.quota?.used ?? decrypted.reduce((sum, attachment) => sum + attachment.size, 0));
    } catch (err: unknown) {
      toast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttachments();
  }, [itemId, session?.token, userKey, mode]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !session?.token || !userKey) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_FILE_SIZE) {
        toast(`File ${file.name} exceeds 10MB limit`, 'error');
        continue;
      }

      try {
        const uploadId = crypto.randomUUID();
        setUploadProgress((prev) => ({ ...prev, [uploadId]: 10 }));

        // Read file as ArrayBuffer
        const buffer = await file.arrayBuffer();

        // The client owns the attachment ID so file bytes and metadata can be
        // bound to the final server identity before anything is uploaded.
        const attachmentId = crypto.randomUUID();

        setUploadProgress((prev) => ({ ...prev, [uploadId]: 40 }));
        const encryptedDataStr = await encryptFile(
          buffer,
          userKey.slice(0, 32),
          `${itemId}:${attachmentId}`
        );
        const encryptedBlob = new Blob([encryptedDataStr], { type: 'text/plain' });

        const aadBytes = new TextEncoder().encode(`${itemId}:${attachmentId}`);
        const encName = await encryptString(file.name, userKey.slice(0, 32), aadBytes);
        const encMime = await encryptString(
          file.type || 'application/octet-stream',
          userKey.slice(0, 32),
          aadBytes
        );

        setUploadProgress((prev) => ({ ...prev, [uploadId]: 60 }));
        const formData = new FormData();
        formData.append('file', encryptedBlob);
        formData.append('attachmentId', attachmentId);
        formData.append('plaintextSize', String(file.size));
        formData.append('encryptedName', encName);
        formData.append('encryptedMimeType', encMime);

        const res = await fetch(`${API_BASE}/api/vault/items/${itemId}/attachments`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token}` },
          body: formData,
        });

        if (!res.ok) {
          const errRes = await res.json();
          throw new Error(errRes.error || 'Upload failed');
        }

        setUploadProgress((prev) => ({ ...prev, [uploadId]: 100 }));
        await fetchAttachments();

        setTimeout(() => {
          setUploadProgress((prev) => {
            const next = { ...prev };
            delete next[uploadId];
            return next;
          });
        }, 1000);
      } catch (err: unknown) {
        toast(getErrorMessage(err), 'error');
        setUploadProgress({});
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownload = async (a: DecryptedAttachment) => {
    if (!session?.token || !userKey) return;
    try {
      const res = await fetch(`${API_BASE}/api/vault/items/${itemId}/attachments/${a.id}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) throw new Error('Download failed');

      const encryptedBlob = await res.blob();
      const encryptedText = await encryptedBlob.text();

      const decryptedBuffer = await decryptFile(
        encryptedText,
        userKey.slice(0, 32),
        `${itemId}:${a.id}`
      );

      const blob = new Blob([decryptedBuffer], { type: a.mimeType });
      const url = URL.createObjectURL(blob);

      const aElem = document.createElement('a');
      aElem.href = url;
      aElem.download = a.name;
      document.body.appendChild(aElem);
      aElem.click();
      document.body.removeChild(aElem);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toast(getErrorMessage(err), 'error');
    }
  };

  const handlePreview = async (a: DecryptedAttachment) => {
    if (!a.mimeType.startsWith('image/') || a.previewUrl || !session?.token || !userKey) return;

    try {
      const res = await fetch(`${API_BASE}/api/vault/items/${itemId}/attachments/${a.id}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) return;

      const encryptedText = await res.text();
      const decryptedBuffer = await decryptFile(
        encryptedText,
        userKey.slice(0, 32),
        `${itemId}:${a.id}`
      );

      const blob = new Blob([decryptedBuffer], { type: a.mimeType });
      const url = URL.createObjectURL(blob);

      setAttachments((prev) =>
        prev.map((att) => (att.id === a.id ? { ...att, previewUrl: url } : att))
      );
    } catch (error) {
      console.error('Preview failed', error);
    }
  };

  const handleDelete = async (a: DecryptedAttachment) => {
    if (!confirm('Delete this attachment?')) return;
    if (!session?.token) return;

    try {
      const res = await fetch(`${API_BASE}/api/vault/items/${itemId}/attachments/${a.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) throw new Error('Delete failed');

      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);

      setAttachments((prev) => prev.filter((att) => att.id !== a.id));
    } catch (err: unknown) {
      toast(getErrorMessage(err), 'error');
    }
  };

  if (mode === 'add') return null;

  return (
    <div className="space-y-4 pt-4 border-t border-[var(--color-border)] mt-6">
      <h3 className="text-sm font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
        Attachments
      </h3>

      {/* Upload Zone */}
      {mode !== 'view' && (
        <div
          className={`relative w-full p-6 mb-4 rounded-[var(--radius-lg)] border-2 border-dashed transition-all duration-200 text-center cursor-pointer overflow-hidden ${
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
            handleUpload(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            onChange={(e) => handleUpload(e.target.files)}
          />
          <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
            <Icon name="paperclip" size={26} className="text-[var(--color-text-tertiary)]" />
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">
              Drag & drop files here, or click to browse
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Max 10MB per file. Encrypted before upload.
            </p>
          </div>

          {Object.values(uploadProgress).map((progress, i) => (
            <div
              key={i}
              className="absolute bottom-0 left-0 h-1 bg-[var(--color-primary)] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          ))}
        </div>
      )}

      {/* Quota */}
      {quotaUsed > 0 && (
        <div className="mb-3 text-xs text-right text-[var(--color-text-tertiary)] font-mono bg-[var(--color-bg-subtle)] px-3 py-1.5 rounded-[var(--radius-full)] inline-block float-right border border-[var(--color-border)] shadow-inner">
          Quota: {formatBytes(quotaUsed)} / {formatBytes(MAX_USER_QUOTA)} used
        </div>
      )}
      <div className="clear-both"></div>

      {/* File List */}
      {loading ? (
        <div className="text-center py-4 text-sm text-[var(--color-text-tertiary)] animate-pulse">
          Loading attachments…
        </div>
      ) : attachments.length === 0 ? (
        mode === 'view' ? null : (
          <div className="text-center py-6 bg-[var(--color-bg-subtle)] rounded-[var(--radius-lg)] text-sm text-[var(--color-text-tertiary)] border border-[var(--color-border)]">
            No attachments yet.
          </div>
        )
      ) : (
        <div className="space-y-3">
          {attachments.map((a) => {
            const isImage = a.mimeType.startsWith('image/');
                const displayName = a.name;

            return (
              <div
                key={a.id}
                className="group flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)] hover:border-[var(--color-border)] transition-colors"
              >
                <div className="flex items-center space-x-3 overflow-hidden">
                  {isImage && a.previewUrl ? (
                    <img
                      src={a.previewUrl}
                      alt={displayName}
                      className="w-10 h-10 object-cover rounded-[var(--radius-sm)] border border-[var(--color-border)]"
                    />
                  ) : (
                    <div className="w-10 h-10 flex items-center justify-center bg-[var(--color-surface)] text-[var(--color-text-secondary)] rounded-[var(--radius-sm)] text-lg">
                      <Icon name={isImage ? 'file' : 'file-description'} size={20} />
                    </div>
                  )}
                  <div className="truncate">
                    <p className="text-sm font-medium text-[var(--color-text)] truncate">
                      {displayName}
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)] font-mono mt-0.5">
                      {formatBytes(a.size)} • {a.mimeType}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {isImage && !a.previewUrl && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreview(a);
                      }}
                      title="Preview"
                    >
                      Preview
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDownload(a)}
                    title="Download"
                  >
                    Download
                  </Button>
                  {mode !== 'view' && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(a)}
                      title="Delete"
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
