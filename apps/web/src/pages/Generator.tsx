import React, { useState, useCallback } from 'react';
import { generatePassword, generatePassphrase, evaluateStrength } from '@lockbox/generator';

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
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] p-6 space-y-6">
          {/* Tab toggle */}
          <div className="flex rounded-[var(--radius-md)] bg-[var(--color-surface)] p-1">
            {(['password', 'passphrase'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 text-sm font-medium rounded-[var(--radius-sm)] transition-colors capitalize ${
                  tab === t
                    ? 'bg-[var(--color-surface-raised)] text-[var(--color-text)] shadow-sm'
                    : 'text-[var(--color-text-tertiary)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Generated output */}
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
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                  {strengthLabels[strength.score]} · {Math.round(strength.entropy)} bits entropy
                </p>
              </div>
            )}
          </div>

          {/* Options */}
          {tab === 'password' ? (
            <div className="space-y-4">
              <div>
                <label className="flex justify-between text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  <span>Length</span>
                  <span className="font-mono">{length}</span>
                </label>
                <input
                  type="range"
                  min={8}
                  max={128}
                  value={length}
                  onChange={(e) => setLength(Number(e.target.value))}
                  className="w-full"
                />
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
                <label key={label} className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-[var(--color-text-secondary)]">{label}</span>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => set(e.target.checked)}
                    className="w-4 h-4 text-[var(--color-primary)] rounded border-[var(--color-border-strong)] bg-[var(--color-surface-raised)]"
                  />
                </label>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="flex justify-between text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  <span>Word Count</span>
                  <span className="font-mono">{wordCount}</span>
                </label>
                <input
                  type="range"
                  min={3}
                  max={10}
                  value={wordCount}
                  onChange={(e) => setWordCount(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                  Separator
                </label>
                <input
                  type="text"
                  value={separator}
                  onChange={(e) => setSeparator(e.target.value)}
                  maxLength={3}
                  className="w-20 px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)] text-center font-mono"
                />
              </div>

              {[
                { label: 'Capitalize words', value: capitalize, set: setCapitalize },
                { label: 'Include a number', value: includeNumber, set: setIncludeNumber },
              ].map(({ label, value, set }) => (
                <label key={label} className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-[var(--color-text-secondary)]">{label}</span>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => set(e.target.checked)}
                    className="w-4 h-4 text-[var(--color-primary)] rounded border-[var(--color-border-strong)] bg-[var(--color-surface-raised)]"
                  />
                </label>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={generate}
              className="flex-1 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-fg)] font-medium rounded-[var(--radius-md)] transition-colors"
            >
              🎲 Generate
            </button>
            {generated && (
              <button
                onClick={copyToClipboard}
                className="px-4 py-2.5 bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)] font-medium rounded-[var(--radius-md)] transition-colors"
              >
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
