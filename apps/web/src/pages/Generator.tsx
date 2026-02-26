import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { generatePassword, generatePassphrase, evaluateStrength } from '@lockbox/generator';

type Tab = 'password' | 'passphrase';

export default function Generator() {
  const navigate = useNavigate();
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Password Generator</h1>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 space-y-6">
          {/* Tab toggle */}
          <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700 p-1">
            {(['password', 'passphrase'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
                  tab === t
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Generated output */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <p
              data-testid="generated-password"
              className="font-mono text-lg text-gray-900 dark:text-white break-all min-h-[2rem]"
            >
              {generated || <span className="text-gray-400">Click generate to create a password</span>}
            </p>
            {strength && generated && (
              <div className="mt-3">
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full ${i <= strength.score ? strengthColors[strength.score] : 'bg-gray-200 dark:bg-gray-600'}`}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {strengthLabels[strength.score]} · {Math.round(strength.entropy)} bits entropy
                </p>
              </div>
            )}
          </div>

          {/* Options */}
          {tab === 'password' ? (
            <div className="space-y-4">
              <div>
                <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                  <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => set(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                </label>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Separator
                </label>
                <input
                  type="text"
                  value={separator}
                  onChange={(e) => setSeparator(e.target.value)}
                  maxLength={3}
                  className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center font-mono"
                />
              </div>

              {[
                { label: 'Capitalize words', value: capitalize, set: setCapitalize },
                { label: 'Include a number', value: includeNumber, set: setIncludeNumber },
              ].map(({ label, value, set }) => (
                <label key={label} className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => set(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                </label>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={generate}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
            >
              🎲 Generate
            </button>
            {generated && (
              <button
                onClick={copyToClipboard}
                className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors"
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
