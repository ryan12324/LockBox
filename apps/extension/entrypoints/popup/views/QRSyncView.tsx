import React, { useState } from 'react';
import { Button, Textarea } from '@lockbox/design';
import { sendMessage } from './shared.js';

export function QRSyncView({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<'idle' | 'sending' | 'receiving'>('idle');
  const [qrData, setQrData] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [scanInput, setScanInput] = useState('');

  async function handleGenerateQR() {
    setError('');
    setSuccess('');
    setMode('sending');
    try {
      const result = await sendMessage<{
        success: boolean;
        qrData?: string;
        expiresAt?: string;
        error?: string;
      }>({ type: 'generate-sync-qr' });
      if (result.success && result.qrData) {
        setQrData(result.qrData);
        const expiresAt = new Date(result.expiresAt!).getTime();
        const updateRemaining = () => {
          const secs = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
          setRemaining(secs);
          if (secs <= 0) {
            setMode('idle');
            setQrData(null);
          }
        };
        updateRemaining();
        const timer = setInterval(updateRemaining, 1000);
        setTimeout(() => clearInterval(timer), 31000);
      } else {
        setError(result.error ?? 'Failed to generate QR');
        setMode('idle');
      }
    } catch {
      setError('Failed to generate QR');
      setMode('idle');
    }
  }

  async function handleScanSubmit() {
    if (!scanInput.trim()) return;
    setError('');
    setSuccess('');
    try {
      const result = await sendMessage<{ success: boolean; error?: string }>({
        type: 'process-sync-qr',
        qrData: scanInput.trim(),
      });
      if (result.success) {
        setSuccess('Device synced successfully!');
        setScanInput('');
        setMode('idle');
      } else {
        setError(result.error ?? 'Invalid or expired QR data');
      }
    } catch {
      setError('Sync failed');
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-border)]">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ←
        </Button>
        <span className="text-sm font-semibold text-[var(--color-text)]">📱 Device Sync</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {error && (
          <div className="px-3 py-2 bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-sm)] text-[var(--color-error)] text-xs">
            {error}
          </div>
        )}
        {success && (
          <div className="px-3 py-2 bg-[var(--color-success-subtle)] border border-[var(--color-success)] rounded-[var(--radius-sm)] text-[var(--color-success)] text-xs">
            {success}
          </div>
        )}

        <p className="text-xs text-[var(--color-text-tertiary)]">
          Securely transfer your session to another device using an encrypted QR code. The QR
          expires in 30 seconds.
        </p>

        {mode === 'idle' && (
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleGenerateQR}
              style={{ width: '100%' }}
            >
              📲 Share via QR (Sender)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setMode('receiving')}
              style={{ width: '100%' }}
            >
              📷 Scan QR (Receiver)
            </Button>
          </div>
        )}

        {mode === 'sending' && qrData && (
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 bg-white rounded-[var(--radius-md)]">
              <div className="w-[200px] h-[200px] flex items-center justify-center text-black/60 text-xs text-center font-mono break-all overflow-hidden">
                <div className="p-2 text-[8px] leading-tight">{qrData.slice(0, 120)}...</div>
              </div>
            </div>
            <div
              className={`text-sm font-bold ${remaining <= 5 ? 'text-[var(--color-error)]' : 'text-[var(--color-text-secondary)]'}`}
            >
              Expires in {remaining}s
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode('idle');
                setQrData(null);
              }}
            >
              Cancel
            </Button>
          </div>
        )}

        {mode === 'receiving' && (
          <div className="flex flex-col gap-3">
            <div className="text-xs text-[var(--color-text-secondary)]">
              Paste the QR data from the sender device:
            </div>
            <Textarea
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              rows={4}
              placeholder="Paste QR sync payload..."
              style={{ fontFamily: 'monospace', fontSize: '12px' }}
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleScanSubmit}
                disabled={!scanInput.trim()}
                className="flex-1"
              >
                Sync
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setMode('idle');
                  setScanInput('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
