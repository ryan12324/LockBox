import React, { useState } from 'react';
import { Button, Input, Select, Textarea } from '@lockbox/design';
import { generatePassword } from '@lockbox/generator';
import type {
  VaultItem,
  LoginItem,
  SecureNoteItem,
  CardItem,
  IdentityItem,
  DocumentItem,
  CustomField,
  Folder,
  VaultItemType,
} from '@lockbox/types';
import { sendMessage, typeIcon } from './shared.js';

export function AddEditView({
  editItem,
  folders,
  onSave,
  onCancel,
}: {
  editItem: VaultItem | null;
  folders: Folder[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const isEdit = editItem !== null;

  const [type, setType] = useState<VaultItemType>(editItem?.type || 'login');
  const [name, setName] = useState(editItem?.name || '');
  const [folderId, setFolderId] = useState(editItem?.folderId || '');
  const [favorite, setFavorite] = useState(editItem?.favorite || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loginItem = editItem?.type === 'login' ? (editItem as LoginItem) : null;
  const [username, setUsername] = useState(loginItem?.username || '');
  const [password, setPassword] = useState(loginItem?.password || '');
  const [uris, setUris] = useState<string[]>(loginItem?.uris?.length ? loginItem.uris : ['']);
  const [totpSecret, setTotpSecret] = useState(loginItem?.totp || '');
  const [generatingAlias, setGeneratingAlias] = useState(false);

  const noteItem = editItem?.type === 'note' ? (editItem as SecureNoteItem) : null;
  const [content, setContent] = useState(noteItem?.content || '');

  const cardItem = editItem?.type === 'card' ? (editItem as CardItem) : null;
  const [cardholderName, setCardholderName] = useState(cardItem?.cardholderName || '');
  const [number, setNumber] = useState(cardItem?.number || '');
  const [expMonth, setExpMonth] = useState(cardItem?.expMonth || '01');
  const [expYear, setExpYear] = useState(cardItem?.expYear || new Date().getFullYear().toString());
  const [cvv, setCvv] = useState(cardItem?.cvv || '');
  const [brand, setBrand] = useState(cardItem?.brand || '');

  const identityItem = editItem?.type === 'identity' ? (editItem as IdentityItem) : null;
  const [firstName, setFirstName] = useState(identityItem?.firstName || '');
  const [middleName, setMiddleName] = useState(identityItem?.middleName || '');
  const [lastName, setLastName] = useState(identityItem?.lastName || '');
  const [identityEmail, setIdentityEmail] = useState(identityItem?.email || '');
  const [identityPhone, setIdentityPhone] = useState(identityItem?.phone || '');
  const [address1, setAddress1] = useState(identityItem?.address1 || '');
  const [address2, setAddress2] = useState(identityItem?.address2 || '');
  const [city, setCity] = useState(identityItem?.city || '');
  const [state, setState] = useState(identityItem?.state || '');
  const [postalCode, setPostalCode] = useState(identityItem?.postalCode || '');
  const [country, setCountry] = useState(identityItem?.country || '');
  const [company, setCompany] = useState(identityItem?.company || '');
  const [ssn, setSsn] = useState(identityItem?.ssn || '');
  const [passportNumber, setPassportNumber] = useState(identityItem?.passportNumber || '');
  const [licenseNumber, setLicenseNumber] = useState(identityItem?.licenseNumber || '');

  const docItem = editItem?.type === 'document' ? (editItem as DocumentItem) : null;
  const [description, setDescription] = useState(docItem?.description || '');
  const [docFile, setDocFile] = useState<File | null>(null);

  const [customFields, setCustomFields] = useState<CustomField[]>(editItem?.customFields || []);

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [localFolders, setLocalFolders] = useState<Folder[]>(folders);

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    try {
      const result = await sendMessage<{ success: boolean; folder?: Folder }>({
        type: 'create-folder',
        name: newFolderName.trim(),
      });
      if (result.success && result.folder) {
        setLocalFolders((prev) => [...prev, result.folder!]);
        setFolderId(result.folder.id);
        setCreatingFolder(false);
        setNewFolderName('');
      }
    } catch {
      // ignore
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (type === 'login' && !username.trim() && !password.trim()) {
      setError('Username or password is required');
      return;
    }
    if (type === 'card' && !number.trim()) {
      setError('Card number is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const cfClean = customFields.filter((cf) => cf.name.trim());
      const base = {
        name,
        folderId: folderId || undefined,
        tags: editItem?.tags || [],
        favorite,
        customFields: cfClean.length > 0 ? cfClean : undefined,
      };
      let itemData: object;
      if (type === 'login') {
        itemData = {
          ...base,
          username,
          password,
          uris: uris.filter((u) => u.trim()),
          totp: totpSecret || undefined,
        };
      } else if (type === 'note') {
        itemData = {
          ...base,
          content,
        };
      } else if (type === 'card') {
        itemData = {
          ...base,
          cardholderName,
          number,
          expMonth,
          expYear,
          cvv,
          brand: brand || undefined,
        };
      } else if (type === 'identity') {
        itemData = {
          ...base,
          firstName: firstName || undefined,
          middleName: middleName || undefined,
          lastName: lastName || undefined,
          email: identityEmail || undefined,
          phone: identityPhone || undefined,
          address1: address1 || undefined,
          address2: address2 || undefined,
          city: city || undefined,
          state: state || undefined,
          postalCode: postalCode || undefined,
          country: country || undefined,
          company: company || undefined,
          ssn: ssn || undefined,
          passportNumber: passportNumber || undefined,
          licenseNumber: licenseNumber || undefined,
        };
      } else if (type === 'document') {
        itemData = {
          ...base,
          description: description || undefined,
          fileName: docFile?.name || undefined,
          mimeType: docFile?.type || undefined,
          size: docFile?.size || undefined,
        };
      } else {
        itemData = base;
      }

      let result: { success: boolean; error?: string };
      if (isEdit) {
        result = await sendMessage({ type: 'update-item', id: editItem.id, itemData });
      } else {
        result = await sendMessage({ type: 'create-item', itemData, itemType: type });
      }

      if (result.success) {
        onSave();
      } else {
        setError(result.error || 'Failed to save');
      }
    } catch {
      setError('Failed to save item');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            ←
          </Button>
          <span className="text-sm font-semibold text-[var(--color-text)]">
            {isEdit ? 'Edit Item' : 'New Item'}
          </span>
        </div>
        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {error && (
          <div className="px-3 py-2 bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-sm)] text-[var(--color-error)] text-xs">
            {error}
          </div>
        )}

        {!isEdit && (
          <div className="flex gap-1 p-1 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)] flex-wrap">
            {(['login', 'note', 'card', 'identity', 'document'] as VaultItemType[]).map((t) => (
              <Button
                key={t}
                variant={type === t ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setType(t)}
                className="flex-1"
              >
                {typeIcon(t)} {t.charAt(0).toUpperCase() + t.slice(1)}
              </Button>
            ))}
          </div>
        )}

        <Input
          type="text"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My Bank"
        />

        <div className="flex gap-2">
          <div className="flex-1">
            <Select
              label="Folder"
              value={creatingFolder ? '__new__' : folderId}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setCreatingFolder(true);
                } else {
                  setCreatingFolder(false);
                  setFolderId(e.target.value);
                }
              }}
              options={[
                { value: '', label: 'No folder' },
                ...localFolders.map((f) => ({ value: f.id, label: f.name })),
                { value: '__new__', label: '+ New folder…' },
              ]}
            />
            {creatingFolder && (
              <div className="flex gap-1 mt-1">
                <Input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                    if (e.key === 'Escape') {
                      setCreatingFolder(false);
                      setNewFolderName('');
                    }
                  }}
                  placeholder="Folder name"
                  className="flex-1"
                />
                <Button variant="primary" size="sm" onClick={handleCreateFolder}>
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
          <label className="flex items-end gap-1 pb-1 cursor-pointer text-xs text-[var(--color-text)] whitespace-nowrap">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
              className="mb-1"
            />
            ⭐
          </label>
        </div>

        {type === 'login' && (
          <>
            <div>
              <div className="flex gap-1">
                <Input
                  type="text"
                  label="Username / Email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="flex-1"
                />
                <div className="flex items-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      setGeneratingAlias(true);
                      try {
                        const res = await sendMessage<{
                          success: boolean;
                          alias?: string;
                          error?: string;
                        }>({
                          type: 'generate-alias',
                        });
                        if (res.success && res.alias) setUsername(res.alias);
                      } catch {
                        // ignore
                      } finally {
                        setGeneratingAlias(false);
                      }
                    }}
                    disabled={generatingAlias}
                    title="Generate email alias"
                  >
                    {generatingAlias ? '...' : '✉️ Alias'}
                  </Button>
                </div>
              </div>
            </div>
            <div>
              <div className="flex gap-1">
                <Input
                  type="password"
                  label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1"
                />
                <div className="flex items-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setPassword(
                        generatePassword({
                          length: 20,
                          uppercase: true,
                          lowercase: true,
                          digits: true,
                          symbols: true,
                        })
                      );
                    }}
                  >
                    Gen
                  </Button>
                </div>
              </div>
            </div>
            <Input
              type="text"
              label="TOTP Secret"
              value={totpSecret}
              onChange={(e) => setTotpSecret(e.target.value)}
              placeholder="Base32 or otpauth:// URI"
            />
            <div>
              <div className="block text-xs font-medium text-[var(--color-text)] mb-1">URIs</div>
              {uris.map((uri, idx) => (
                <div key={idx} className="flex gap-1 mb-1">
                  <Input
                    type="text"
                    value={uri}
                    onChange={(e) => {
                      const u = [...uris];
                      u[idx] = e.target.value;
                      setUris(u);
                    }}
                    placeholder="https://example.com"
                    className="flex-1"
                  />
                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setUris(uris.filter((_, i) => i !== idx))}
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setUris([...uris, ''])}>
                + Add URI
              </Button>
            </div>
          </>
        )}

        {type === 'note' && (
          <Textarea
            label="Secure Note"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
          />
        )}

        {type === 'card' && (
          <>
            <Input
              type="text"
              label="Cardholder Name"
              value={cardholderName}
              onChange={(e) => setCardholderName(e.target.value)}
            />
            <Input
              type="text"
              label="Card Number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
            <div className="flex gap-1.5">
              <div className="flex-1">
                <Select
                  label="Month"
                  value={expMonth}
                  onChange={(e) => setExpMonth(e.target.value)}
                  options={Array.from({ length: 12 }, (_, i) => {
                    const m = (i + 1).toString().padStart(2, '0');
                    return { value: m, label: m };
                  })}
                />
              </div>
              <div className="flex-1">
                <Input
                  type="text"
                  label="Year"
                  value={expYear}
                  onChange={(e) => setExpYear(e.target.value)}
                  placeholder="YYYY"
                />
              </div>
              <div className="flex-1">
                <Input
                  type="password"
                  label="CVV"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value)}
                />
              </div>
            </div>
            <Select
              label="Brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              options={[
                { value: '', label: 'Select...' },
                { value: 'Visa', label: 'Visa' },
                { value: 'Mastercard', label: 'Mastercard' },
                { value: 'Amex', label: 'American Express' },
                { value: 'Discover', label: 'Discover' },
                { value: 'Other', label: 'Other' },
              ]}
            />
          </>
        )}

        {type === 'identity' && (
          <>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] mt-1 mb-0.5">
              Personal
            </div>
            <div className="flex gap-1.5">
              <Input
                type="text"
                label="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="flex-1"
              />
              <Input
                type="text"
                label="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="flex-1"
              />
            </div>
            <Input
              type="text"
              label="Middle Name"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
            />
            <Input
              type="email"
              label="Email"
              value={identityEmail}
              onChange={(e) => setIdentityEmail(e.target.value)}
            />
            <Input
              type="text"
              label="Phone"
              value={identityPhone}
              onChange={(e) => setIdentityPhone(e.target.value)}
            />
            <Input
              type="text"
              label="Company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />

            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] mt-2 mb-0.5">
              Address
            </div>
            <Input
              type="text"
              label="Address 1"
              value={address1}
              onChange={(e) => setAddress1(e.target.value)}
            />
            <Input
              type="text"
              label="Address 2"
              value={address2}
              onChange={(e) => setAddress2(e.target.value)}
            />
            <div className="flex gap-1.5">
              <Input
                type="text"
                label="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="flex-1"
              />
              <Input
                type="text"
                label="State"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="flex-1"
              />
            </div>
            <div className="flex gap-1.5">
              <Input
                type="text"
                label="Postal Code"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className="flex-1"
              />
              <Input
                type="text"
                label="Country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="flex-1"
              />
            </div>

            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] mt-2 mb-0.5">
              Identification
            </div>
            <Input
              type="password"
              label="SSN"
              value={ssn}
              onChange={(e) => setSsn(e.target.value)}
            />
            <Input
              type="password"
              label="Passport Number"
              value={passportNumber}
              onChange={(e) => setPassportNumber(e.target.value)}
            />
            <Input
              type="password"
              label="License Number"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
            />
          </>
        )}

        {type === 'document' && (
          <>
            <Textarea
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
            {!isEdit && (
              <div>
                <div className="block text-xs font-medium text-[var(--color-text)] mb-1">File</div>
                <input
                  type="file"
                  onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-[var(--color-text-secondary)] file:mr-2 file:py-1.5 file:px-3 file:rounded-[var(--radius-sm)] file:border file:border-[var(--color-border)] file:text-sm file:bg-[var(--color-surface)] file:text-[var(--color-text-secondary)] file:cursor-pointer hover:file:bg-[var(--color-surface-raised)]"
                />
              </div>
            )}
          </>
        )}

        <div className="mt-2 pt-2 border-t border-[var(--color-border)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
              Custom Fields
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setCustomFields([...customFields, { name: '', value: '', type: 'text' }])
              }
            >
              + Add Field
            </Button>
          </div>
          {customFields.map((cf, idx) => (
            <div
              key={idx}
              className="flex flex-col gap-1 mb-2 p-2 bg-[var(--color-bg-subtle)] rounded-[var(--radius-sm)] border border-[var(--color-border)]"
            >
              <div className="flex gap-1">
                <Input
                  type="text"
                  value={cf.name}
                  onChange={(e) => {
                    const updated = [...customFields];
                    updated[idx] = { ...updated[idx], name: e.target.value };
                    setCustomFields(updated);
                  }}
                  placeholder="Field name"
                  className="flex-1"
                />
                <Select
                  value={cf.type}
                  onChange={(e) => {
                    const updated = [...customFields];
                    updated[idx] = {
                      ...updated[idx],
                      type: e.target.value as CustomField['type'],
                      value: e.target.value === 'boolean' ? 'false' : updated[idx].value,
                    };
                    setCustomFields(updated);
                  }}
                  options={[
                    { value: 'text', label: 'Text' },
                    { value: 'hidden', label: 'Hidden' },
                    { value: 'boolean', label: 'Bool' },
                  ]}
                  className="w-[80px]"
                />
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCustomFields(customFields.filter((_, i) => i !== idx))}
                  >
                    ✕
                  </Button>
                </div>
              </div>
              {cf.type === 'boolean' ? (
                <label className="flex items-center gap-2 px-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cf.value === 'true'}
                    onChange={(e) => {
                      const updated = [...customFields];
                      updated[idx] = {
                        ...updated[idx],
                        value: e.target.checked ? 'true' : 'false',
                      };
                      setCustomFields(updated);
                    }}
                  />
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    {cf.value === 'true' ? 'Yes' : 'No'}
                  </span>
                </label>
              ) : (
                <Input
                  type={cf.type === 'hidden' ? 'password' : 'text'}
                  value={cf.value}
                  onChange={(e) => {
                    const updated = [...customFields];
                    updated[idx] = { ...updated[idx], value: e.target.value };
                    setCustomFields(updated);
                  }}
                  placeholder="Value"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
