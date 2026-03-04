import React, { useState, useCallback } from 'react';
import { generatePassword, generatePassphrase, evaluateStrength } from '@lockbox/generator';
import { Button, Input, Card, Badge } from '@lockbox/design';

type Tab = 'password' | 'passphrase';

export default function Generator() {
  const [tab, setTab] = useState<Tab>('password');

  const [length, setLength] = useState(20);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);

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
  const strengthColors: Record<number, string> = {
    0: 'var(--color-error)',
    1: 'var(--color-warning)',
    2: 'var(--color-warning)',
    3: 'var(--color-primary)',
    4: 'var(--color-success)',
  };
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
    <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <h1
          style={{
            fontSize: 'var(--font-size-2xl)',
            fontWeight: 700,
            color: 'var(--color-text)',
            marginBottom: 20,
          }}
        >
          Password Generator
        </h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              gap: 6,
              padding: 4,
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-full)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            {(['password', 'passphrase'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-full)',
                  border: 'none',
                  background: tab === t ? 'var(--color-primary)' : 'transparent',
                  color: tab === t ? 'var(--color-primary-fg)' : 'var(--color-text-secondary)',
                  fontWeight: 600,
                  fontSize: 'var(--font-size-sm)',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 150ms ease',
                  boxShadow: tab === t ? 'var(--shadow-md)' : 'none',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <Card variant="frost" padding="lg" style={{ textAlign: 'center' }}>
            <p
              data-testid="generated-password"
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 24,
                fontWeight: 600,
                color: 'var(--color-text)',
                wordBreak: 'break-all',
                minHeight: 40,
                lineHeight: 1.4,
                margin: 0,
              }}
            >
              {generated || (
                <span
                  style={{
                    color: 'var(--color-text-tertiary)',
                    fontSize: 'var(--font-size-base)',
                    fontWeight: 400,
                  }}
                >
                  Click generate to create a {tab}
                </span>
              )}
            </p>

            {strength && generated && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height: 6,
                        borderRadius: 'var(--radius-full)',
                        background:
                          i <= strength.score
                            ? strengthColors[strength.score]
                            : 'var(--color-surface-raised)',
                        transition: 'background 200ms ease',
                      }}
                    />
                  ))}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <Badge variant={strengthVariants[strength.score]}>
                    {strengthLabels[strength.score]}
                  </Badge>
                  <span
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    {Math.round(strength.entropy)} bits entropy
                  </span>
                </div>
              </div>
            )}

            {generated && (
              <Button
                variant="secondary"
                size="sm"
                onClick={copyToClipboard}
                style={{ marginTop: 16 }}
              >
                {copied ? '✓ Copied' : '📋 Copy'}
              </Button>
            )}
          </Card>

          <Card variant="surface" padding="lg">
            <h2
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: 600,
                color: 'var(--color-text)',
                marginBottom: 16,
              }}
            >
              Options
            </h2>

            {tab === 'password' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 500,
                      color: 'var(--color-text)',
                      marginBottom: 8,
                    }}
                  >
                    <span>Length</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{length}</span>
                  </label>
                  {React.createElement('input', {
                    type: 'range',
                    min: 8,
                    max: 128,
                    value: length,
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                      setLength(Number(e.target.value)),
                    style: { width: '100%' },
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
                  <div
                    key={label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 500,
                        color: 'var(--color-text)',
                      }}
                    >
                      {label}
                    </span>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 500,
                      color: 'var(--color-text)',
                      marginBottom: 8,
                    }}
                  >
                    <span>Word Count</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{wordCount}</span>
                  </label>
                  {React.createElement('input', {
                    type: 'range',
                    min: 3,
                    max: 10,
                    value: wordCount,
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                      setWordCount(Number(e.target.value)),
                    style: { width: '100%' },
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
                  <div
                    key={label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 500,
                        color: 'var(--color-text)',
                      }}
                    >
                      {label}
                    </span>
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
          </Card>

          <Button variant="primary" size="lg" onClick={generate} style={{ width: '100%' }}>
            🎲 Generate
          </Button>
        </div>
      </div>
    </div>
  );
}
