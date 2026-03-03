import React, { useState, useEffect, useCallback } from 'react';
import { Button, Badge, Card } from '@lockbox/design';
import type { VaultItem, VaultHealthSummary, PasswordHealthReport } from '@lockbox/types';
import { sendMessage } from './shared.js';

export function HealthSummaryView({
  onBack,
  filterBreached,
  allItems,
}: {
  onBack: () => void;
  filterBreached?: boolean;
  allItems: VaultItem[];
}) {
  const [summary, setSummary] = useState<VaultHealthSummary | null>(null);
  const [reports, setReports] = useState<PasswordHealthReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const analyze = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await sendMessage<{
        success: boolean;
        summary?: VaultHealthSummary;
        reports?: PasswordHealthReport[];
        error?: string;
      }>({
        type: 'run-health-analysis',
      });
      if (result.success && result.summary && result.reports) {
        setSummary(result.summary);
        setReports(result.reports);
      } else {
        setError(result.error || 'Failed to analyze vault health');
      }
    } catch (err) {
      setError('Error connecting to background service');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    analyze();
  }, [analyze]);

  const score = summary?.overallScore ?? 100;
  const scoreColor =
    score < 40
      ? 'text-[var(--color-error)]'
      : score < 70
        ? 'text-[var(--color-warning)]'
        : score < 90
          ? 'text-[var(--color-primary)]'
          : 'text-[var(--color-success)]';
  const strokeColor =
    score < 40 ? '#f87171' : score < 70 ? '#fbbf24' : score < 90 ? '#818cf8' : '#34d399';

  const displayReports = filterBreached
    ? reports.filter((r) => r.issues.some((i) => i.type === 'breached'))
    : reports.filter((r) => r.issues.length > 0).sort((a, b) => b.issues.length - a.issues.length);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            ←
          </Button>
          <span className="text-sm font-semibold text-[var(--color-text)]">Security Health</span>
        </div>
        <Button variant="primary" size="sm" onClick={analyze} disabled={loading}>
          {loading ? 'Analyzing...' : 'Analyze Now'}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
        {error && (
          <div className="px-3 py-2 bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-sm)] text-[var(--color-error)] text-xs">
            {error}
          </div>
        )}

        {loading && !summary ? (
          <div className="text-center text-[var(--color-text-tertiary)] text-sm mt-10">
            Scanning vault...
          </div>
        ) : (
          summary && (
            <>
              <div className="flex items-center justify-center py-4">
                <div className="relative flex items-center justify-center w-[80px] h-[80px]">
                  <svg
                    className="absolute inset-0 w-full h-full transform -rotate-90"
                    viewBox="0 0 100 100"
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="transparent"
                      className="text-[var(--color-text-tertiary)]"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      stroke={strokeColor}
                      strokeWidth="8"
                      fill="transparent"
                      strokeDasharray={`${(score / 100) * 251.2} 251.2`}
                      className="transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="flex flex-col items-center justify-center z-10">
                    <span className={`text-xl font-bold ${scoreColor}`}>{score}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Card variant="surface" padding="sm">
                  <span className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">
                    Weak
                  </span>
                  <span className="text-lg font-bold text-[var(--color-text)]">{summary.weak}</span>
                </Card>
                <Card variant="surface" padding="sm">
                  <span className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">
                    Reused
                  </span>
                  <span className="text-lg font-bold text-[var(--color-text)]">
                    {summary.reused}
                  </span>
                </Card>
                <Card variant="surface" padding="sm">
                  <span className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">
                    Old
                  </span>
                  <span className="text-lg font-bold text-[var(--color-text)]">{summary.old}</span>
                </Card>
                <Card variant="surface" padding="sm">
                  <span className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">
                    Breached
                  </span>
                  <span className="text-lg font-bold text-[var(--color-error)]">
                    {summary.breached}
                  </span>
                </Card>
              </div>

              <div className="mt-2">
                <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">
                  {filterBreached ? 'Breached Items' : 'Top Issues'}
                </h3>
                {displayReports.length === 0 ? (
                  <Card variant="surface" padding="sm">
                    <div className="text-center text-xs text-[var(--color-text-tertiary)] py-2">
                      No issues found!
                    </div>
                  </Card>
                ) : (
                  <div className="flex flex-col gap-2">
                    {displayReports.slice(0, filterBreached ? undefined : 10).map((report, idx) => (
                      <Card key={idx} variant="surface" padding="sm">
                        <div className="text-sm font-medium text-[var(--color-text)] mb-1.5 truncate">
                          {allItems.find((i) => i.id === report.itemId)?.name || 'Unknown Item'}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {report.issues.map((i, iidx) => (
                            <Badge key={iidx} variant={i.type === 'breached' ? 'error' : 'warning'}>
                              {i.type.toUpperCase()}
                            </Badge>
                          ))}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
