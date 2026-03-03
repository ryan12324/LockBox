import React from 'react';
import { Button, Input } from '@lockbox/design';

export interface IdentityFieldsProps {
  mode: 'view' | 'edit' | 'add';
  firstName: string;
  setFirstName: (v: string) => void;
  middleName: string;
  setMiddleName: (v: string) => void;
  lastName: string;
  setLastName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  address1: string;
  setAddress1: (v: string) => void;
  address2: string;
  setAddress2: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  stateValue: string;
  setStateValue: (v: string) => void;
  postalCode: string;
  setPostalCode: (v: string) => void;
  country: string;
  setCountry: (v: string) => void;
  company: string;
  setCompany: (v: string) => void;
  ssn: string;
  setSsn: (v: string) => void;
  showSsn: boolean;
  setShowSsn: (v: boolean) => void;
  passportNumber: string;
  setPassportNumber: (v: string) => void;
  licenseNumber: string;
  setLicenseNumber: (v: string) => void;
  copiedField: string | null;
  copyToClipboard: (text: string, field: string, element?: HTMLElement | null) => void;
}

export default function IdentityFields({
  mode,
  firstName,
  setFirstName,
  middleName,
  setMiddleName,
  lastName,
  setLastName,
  email,
  setEmail,
  phone,
  setPhone,
  address1,
  setAddress1,
  address2,
  setAddress2,
  city,
  setCity,
  stateValue,
  setStateValue,
  postalCode,
  setPostalCode,
  country,
  setCountry,
  company,
  setCompany,
  ssn,
  setSsn,
  showSsn,
  setShowSsn,
  passportNumber,
  setPassportNumber,
  licenseNumber,
  setLicenseNumber,
  copiedField,
  copyToClipboard,
}: IdentityFieldsProps) {
  if (mode === 'view') {
    return (
      <div className="space-y-4">
        {(firstName || middleName || lastName) && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Name
            </span>
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <span className="text-sm font-medium text-[var(--color-text)]">
                {[firstName, middleName, lastName].filter(Boolean).join(' ')}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) =>
                  copyToClipboard(
                    [firstName, middleName, lastName].filter(Boolean).join(' '),
                    'fullname',
                    e.currentTarget
                  )
                }
                style={{ padding: '6px', minHeight: 'auto' }}
              >
                {copiedField === 'fullname' ? '✓' : '📋'}
              </Button>
            </div>
          </div>
        )}
        {email && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Email
            </span>
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <span className="text-sm text-[var(--color-text)]">{email}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => copyToClipboard(email, 'email', e.currentTarget)}
                style={{ padding: '6px', minHeight: 'auto' }}
              >
                {copiedField === 'email' ? '✓' : '📋'}
              </Button>
            </div>
          </div>
        )}
        {phone && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Phone
            </span>
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <span className="text-sm text-[var(--color-text)]">{phone}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => copyToClipboard(phone, 'phone', e.currentTarget)}
                style={{ padding: '6px', minHeight: 'auto' }}
              >
                {copiedField === 'phone' ? '✓' : '📋'}
              </Button>
            </div>
          </div>
        )}
        {(address1 || address2 || city || stateValue || postalCode || country) && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Address
            </span>
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <div className="text-sm text-[var(--color-text)] space-y-1">
                {address1 && <p>{address1}</p>}
                {address2 && <p>{address2}</p>}
                {(city || stateValue || postalCode) && (
                  <p>{[city, stateValue, postalCode].filter(Boolean).join(', ')}</p>
                )}
                {country && <p>{country}</p>}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) =>
                  copyToClipboard(
                    [
                      address1,
                      address2,
                      [city, stateValue, postalCode].filter(Boolean).join(', '),
                      country,
                    ]
                      .filter(Boolean)
                      .join('\n'),
                    'address',
                    e.currentTarget
                  )
                }
                style={{ padding: '6px', minHeight: 'auto', alignSelf: 'flex-start' }}
              >
                {copiedField === 'address' ? '✓' : '📋'}
              </Button>
            </div>
          </div>
        )}
        {company && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Company
            </span>
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <span className="text-sm text-[var(--color-text)]">{company}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => copyToClipboard(company, 'company', e.currentTarget)}
                style={{ padding: '6px', minHeight: 'auto' }}
              >
                {copiedField === 'company' ? '✓' : '📋'}
              </Button>
            </div>
          </div>
        )}
        {ssn && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              SSN
            </span>
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <span className="text-sm font-mono text-[var(--color-text)]">
                {showSsn ? ssn : '•••-••-••••'}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSsn(!showSsn)}
                  style={{ padding: '6px', minHeight: 'auto' }}
                >
                  {showSsn ? '👁️‍🗨️' : '👁️'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => copyToClipboard(ssn, 'ssn', e.currentTarget)}
                  style={{ padding: '6px', minHeight: 'auto' }}
                >
                  {copiedField === 'ssn' ? '✓' : '📋'}
                </Button>
              </div>
            </div>
          </div>
        )}
        {passportNumber && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Passport Number
            </span>
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <span className="text-sm font-mono text-[var(--color-text)]">{passportNumber}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => copyToClipboard(passportNumber, 'passport', e.currentTarget)}
                style={{ padding: '6px', minHeight: 'auto' }}
              >
                {copiedField === 'passport' ? '✓' : '📋'}
              </Button>
            </div>
          </div>
        )}
        {licenseNumber && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              License Number
            </span>
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <span className="text-sm font-mono text-[var(--color-text)]">{licenseNumber}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => copyToClipboard(licenseNumber, 'license', e.currentTarget)}
                style={{ padding: '6px', minHeight: 'auto' }}
              >
                {copiedField === 'license' ? '✓' : '📋'}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4 border-t border-[var(--color-border)]">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
          Personal
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="First Name"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <Input
            label="Middle Name"
            type="text"
            value={middleName}
            onChange={(e) => setMiddleName(e.target.value)}
          />
        </div>
        <Input
          label="Last Name"
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input label="Phone" type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>

      <div className="space-y-4 pt-4 border-t border-[var(--color-border)]">
        <h3 className="text-sm font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
          Address
        </h3>
        <Input
          label="Address 1"
          type="text"
          value={address1}
          onChange={(e) => setAddress1(e.target.value)}
        />
        <Input
          label="Address 2"
          type="text"
          value={address2}
          onChange={(e) => setAddress2(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input label="City" type="text" value={city} onChange={(e) => setCity(e.target.value)} />
          <Input
            label="State/Province"
            type="text"
            value={stateValue}
            onChange={(e) => setStateValue(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Zip/Postal Code"
            type="text"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
          />
          <Input
            label="Country"
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4 pt-4 border-t border-[var(--color-border)]">
        <h3 className="text-sm font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
          Company
        </h3>
        <Input
          label="Company Name"
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      <div className="space-y-4 pt-4 border-t border-[var(--color-border)]">
        <h3 className="text-sm font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
          Identification
        </h3>
        <Input label="SSN" type="password" value={ssn} onChange={(e) => setSsn(e.target.value)} />
        <Input
          label="Passport Number"
          type="text"
          value={passportNumber}
          onChange={(e) => setPassportNumber(e.target.value)}
        />
        <Input
          label="License Number"
          type="text"
          value={licenseNumber}
          onChange={(e) => setLicenseNumber(e.target.value)}
        />
      </div>
    </div>
  );
}
