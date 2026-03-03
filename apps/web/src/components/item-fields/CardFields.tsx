import React from 'react';
import { Button, Input, Select } from '@lockbox/design';

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const m = (i + 1).toString().padStart(2, '0');
  return { value: m, label: m };
});

const BRAND_OPTIONS = [
  { value: '', label: 'Select Brand...' },
  { value: 'Visa', label: 'Visa' },
  { value: 'Mastercard', label: 'Mastercard' },
  { value: 'Amex', label: 'American Express' },
  { value: 'Discover', label: 'Discover' },
  { value: 'Other', label: 'Other' },
];

export interface CardFieldsProps {
  mode: 'view' | 'edit' | 'add';
  cardholderName: string;
  setCardholderName: (v: string) => void;
  number: string;
  setNumber: (v: string) => void;
  expMonth: string;
  setExpMonth: (v: string) => void;
  expYear: string;
  setExpYear: (v: string) => void;
  cvv: string;
  setCvv: (v: string) => void;
  brand: string;
  setBrand: (v: string) => void;
  showCvv: boolean;
  setShowCvv: (v: boolean) => void;
  showCardNumber: boolean;
  setShowCardNumber: (v: boolean) => void;
  copiedField: string | null;
  copyToClipboard: (text: string, field: string, element?: HTMLElement | null) => void;
}

export default function CardFields({
  mode,
  cardholderName,
  setCardholderName,
  number,
  setNumber,
  expMonth,
  setExpMonth,
  expYear,
  setExpYear,
  cvv,
  setCvv,
  brand,
  setBrand,
  showCvv,
  setShowCvv,
  showCardNumber,
  setShowCardNumber,
  copiedField,
  copyToClipboard,
}: CardFieldsProps) {
  if (mode === 'view') {
    return (
      <div className="space-y-4">
        {cardholderName && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Cardholder Name
            </span>
            <div className="p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]">
              {cardholderName}
            </div>
          </div>
        )}
        {number && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Card Number
            </span>
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <span className="text-sm font-mono text-[var(--color-text)]">
                {showCardNumber ? number : '•••• •••• •••• ' + number.slice(-4)}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCardNumber(!showCardNumber)}
                  style={{ padding: '6px', minHeight: 'auto' }}
                >
                  {showCardNumber ? '👁️‍🗨️' : '👁️'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => copyToClipboard(number, 'cardnum', e.currentTarget)}
                  style={{ padding: '6px', minHeight: 'auto' }}
                >
                  {copiedField === 'cardnum' ? '✓' : '📋'}
                </Button>
              </div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Expiration
            </span>
            <div className="p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]">
              {expMonth} / {expYear}
            </div>
          </div>
          {cvv && (
            <div>
              <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
                CVV
              </span>
              <div className="flex items-center justify-between p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
                <span className="text-sm font-mono text-[var(--color-text)]">
                  {showCvv ? cvv : '•••'}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCvv(!showCvv)}
                    style={{ padding: '6px', minHeight: 'auto' }}
                  >
                    {showCvv ? '👁️‍🗨️' : '👁️'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => copyToClipboard(cvv, 'cvv', e.currentTarget)}
                    style={{ padding: '6px', minHeight: 'auto' }}
                  >
                    {copiedField === 'cvv' ? '✓' : '📋'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
        {brand && (
          <div>
            <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1">
              Brand
            </span>
            <div className="p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]">
              {brand}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4 border-t border-[var(--color-border)]">
      <Input
        label="Cardholder Name"
        type="text"
        value={cardholderName}
        onChange={(e) => setCardholderName(e.target.value)}
      />
      <Input
        label="Card Number"
        type="text"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
      />
      <div className="flex gap-4">
        <div className="w-1/3">
          <Select
            label="Exp Month"
            value={expMonth}
            onChange={(e) => setExpMonth(e.target.value)}
            options={MONTH_OPTIONS}
          />
        </div>
        <div className="w-1/3">
          <Input
            label="Exp Year"
            type="text"
            value={expYear}
            onChange={(e) => setExpYear(e.target.value)}
            placeholder="YYYY"
          />
        </div>
        <div className="w-1/3">
          <Input label="CVV" type="password" value={cvv} onChange={(e) => setCvv(e.target.value)} />
        </div>
      </div>
      <Select
        label="Brand"
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
        options={BRAND_OPTIONS}
      />
    </div>
  );
}
