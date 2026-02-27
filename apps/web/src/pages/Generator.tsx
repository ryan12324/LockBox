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
      const pw = generatePassword({ length, uppercase, lowercase, digits, symbols, excludeAmbiguous });
      setGenerated(pw);
    } else {
      const pp = generatePassphrase({ wordCount, separator, capitalize, includeNumber });
      setGenerated(pp);
    }
    setCopied(false);
  }, [tab, length, uppercase, lowercase, digits, symbols, excludeAmbiguous, wordCount, separator, capitalize, includeNumber]);

  const strength = generated ? evaluateStrength(generated) : null;
  const strengthColors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'];
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
        <h1 className="text-2xl font-bold text-white mb-6">Password Generator</h1>
        <div className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6 space-y-6">
          {/* Tab toggle */}
          <div className="flex rounded-lg bg-white/[0.06] p-1">
            {(['password', 'passphrase'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
                  tab === t
                    ? 'bg-white/[0.12] text-white shadow-sm'
                    : 'text-white/40'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Generated output */}
          <div className="bg-white/[0.04] rounded-lg p-4 border border-white/[0.06]">
            <p
              data-testid="generated-password"
              className="font-mono text-lg text-white break-all min-h-[2rem]"
            >
              {generated || <span className="text-white/30">Click generate to create a password</span>}
            </p>
            {strength && generated && (
              <div className="mt-3">
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full ${i <= strength.score ? strengthColors[strength.score] : 'bg-white/10'}`}
                    />
                  ))}
                </div>
                <p className="text-xs text-white/40 mt-1">
                  {strengthLabels[strength.score]} · {Math.round(strength.entropy)} bits entropy
                </p>
              </div>
            )}
          </div>

          {/* Options */}
          {tab === 'password' ? (
            <div className="space-y-4">
              <div>
                <label className="flex justify-between text-sm font-medium text-white/70 mb-2">
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
                { label: 'Exclude ambiguous (0O1lI)', value: excludeAmbiguous, set: setExcludeAmbiguous },
              ].map(({ label, value, set }) => (
                <label key={label} className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-white/70">{label}</span>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => set(e.target.checked)}
                    className="w-4 h-4 text-indigo-500 rounded border-white/20 bg-white/10"
                  />
                </label>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="flex justify-between text-sm font-medium text-white/70 mb-2">
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
                <label className="block text-sm font-medium text-white/70 mb-1">
                  Separator
                </label>
                <input
                  type="text"
                  value={separator}
                  onChange={(e) => setSeparator(e.target.value)}
                  maxLength={3}
                  className="w-20 px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.06] text-white text-center font-mono"
                />
              </div>

              {[
                { label: 'Capitalize words', value: capitalize, set: setCapitalize },
                { label: 'Include a number', value: includeNumber, set: setIncludeNumber },
              ].map(({ label, value, set }) => (
                <label key={label} className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-white/70">{label}</span>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => set(e.target.checked)}
                    className="w-4 h-4 text-indigo-500 rounded border-white/20 bg-white/10"
                  />
                </label>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={generate}
              className="flex-1 py-2.5 bg-indigo-600/80 hover:bg-indigo-500/90 text-white font-medium rounded-lg backdrop-blur-sm transition-colors"
            >
              🎲 Generate
            </button>
            {generated && (
              <button
                onClick={copyToClipboard}
                className="px-4 py-2.5 bg-white/[0.08] hover:bg-white/[0.14] text-white/70 font-medium rounded-lg transition-colors"
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
