import React, { useState, useCallback } from 'react';
import { generatePassword, generatePassphrase, evaluateStrength } from '@lockbox/generator';
import { Button, Input, Card, Badge } from '@lockbox/design';

type Tab = 'password' | 'passphrase';

export default function Generator() {
  const [tab, setTab] = useState<Tab>('password');

  // Password options
  const [length, setLength] = useState(20);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);

  // Passphrase options
  const [wordCount, setWordCount] = useState(5);
  const [separator, setSeparator] = useState('-');
  const [capitalize, setCapitalize] = useState(true);
  const [includeNumber, setIncludeNumber] = useState(false);

  const [generated, setGenerated] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = useCallback(() => {
    if (tab === 'password') {
      const pw = generatePassword({
        length,
        uppercase,
        lowercase,
        digits,
        symbols,
        excludeAmbiguous,
      });
      setGenerated(pw);
    } else {
      const pp = generatePassphrase({ wordCount, separator, capitalize, includeNumber });
      setGenerated(pp);
    }
    setCopied(false);
  }, [
    tab,
    length,
    uppercase,
    lowercase,
    digits,
    symbols,
    excludeAmbiguous,
    wordCount,
    separator,
    capitalize,
    includeNumber,
  ]);

  const strength = generated ? evaluateStrength(generated) : null;
  const strengthColors = [
    'bg-[var(--color-error)]',
    'bg-[var(--color-warning)]',
    'bg-[var(--color-warning)]',
    'bg-[var(--color-primary)]',
    'bg-[var(--color-success)]',
  ];
  const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
  const strengthVariants: Array<'error' | 'warning' | 'warning' | 'primary' | 'success'> = [
    'error',
    'warning',
    'warning',
    'primary',
    'success',
  ];

  async function copyToClipboard() {
    await navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => {
      navigator.clipboard.writeText('').catch(() => {});
      setCopied(false);
    }, 30_000);
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">Password Generator</h1>
        <Card variant="surface" padding="md">
          <div className="space-y-6">
            <div className="flex rounded-[var(--radius-md)] bg-[var(--color-surface)] p-1">
              {(['password', 'passphrase'] as Tab[]).map((t) => (
                <Button
                  key={t}
                  variant={tab === t ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setTab(t)}
                  style={{ flex: 1, textTransform: 'capitalize' }}
                >
                  {t}
                </Button>
              ))}
            </div>

            <div className="bg-[var(--color-bg-subtle)] rounded-[var(--radius-md)] p-4 border border-[var(--color-border)]">
              <p
                data-testid="generated-password"
                className="font-mono text-lg text-[var(--color-text)] break-all min-h-[2rem]"
              >
                {generated || (
                  <span className="text-[var(--color-text-tertiary)]">
                    Click generate to create a password
                  </span>
                )}
              </p>
              {strength && generated && (
                <div className="mt-3">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-[var(--radius-full)] ${i <= strength.score ? strengthColors[strength.score] : 'bg-[var(--color-surface-raised)]'}`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={strengthVariants[strength.score]}>
                      {strengthLabels[strength.score]}
                    </Badge>
                    <span className="text-xs text-[var(--color-text-tertiary)]">
                      {Math.round(strength.entropy)} bits entropy
                    </span>
                  </div>
                </div>
              )}
            </div>

            {tab === 'password' ? (
              <div className="space-y-4">
                <div>
                  <label className="flex justify-between text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                    <span>Length</span>
                    <span className="font-mono">{length}</span>
                  </label>
                  {React.createElement('input', {
                    type: 'range',
                    min: 8,
                    max: 128,
                    value: length,
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                      setLength(Number(e.target.value)),
                    className: 'w-full',
                  })}
                </div>

                {[
                  { label: 'Uppercase (A-Z)', value: uppercase, set: setUppercase },
                  { label: 'Lowercase (a-z)', value: lowercase, set: setLowercase },
                  { label: 'Digits (0-9)', value: digits, set: setDigits },
                  { label: 'Symbols (!@#$...)', value: symbols, set: setSymbols },
                  {
                    label: 'Exclude ambiguous (0O1lI)',
                    value: excludeAmbiguous,
                    set: setExcludeAmbiguous,
                  },
                ].map(({ label, value, set }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-sm text-[var(--color-text-secondary)]">{label}</span>
                    <Button
                      variant={value ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => set(!value)}
                      style={{ minWidth: 52 }}
                    >
                      {value ? 'On' : 'Off'}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="flex justify-between text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                    <span>Word Count</span>
                    <span className="font-mono">{wordCount}</span>
                  </label>
                  {React.createElement('input', {
                    type: 'range',
                    min: 3,
                    max: 10,
                    value: wordCount,
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                      setWordCount(Number(e.target.value)),
                    className: 'w-full',
                  })}
                </div>

                <Input
                  type="text"
                  label="Separator"
                  value={separator}
                  onChange={(e) => setSeparator(e.target.value)}
                  maxLength={3}
                  style={{ width: 80, textAlign: 'center', fontFamily: 'var(--font-mono)' }}
                />

                {[
                  { label: 'Capitalize words', value: capitalize, set: setCapitalize },
                  { label: 'Include a number', value: includeNumber, set: setIncludeNumber },
                ].map(({ label, value, set }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-sm text-[var(--color-text-secondary)]">{label}</span>
                    <Button
                      variant={value ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => set(!value)}
                      style={{ minWidth: 52 }}
                    >
                      {value ? 'On' : 'Off'}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="primary" onClick={generate} style={{ flex: 1 }}>
                🎲 Generate
              </Button>
              {generated && (
                <Button variant="secondary" onClick={copyToClipboard}>
                  {copied ? '✓ Copied' : '📋 Copy'}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
