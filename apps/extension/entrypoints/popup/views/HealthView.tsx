import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Badge,
  Card,
  Icon,
  SiteFavicon,
  getEntryFaviconSources,
} from '@lockbox/design';
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
  const [breachChecking, setBreachChecking] = useState(false);
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
        const breachStatus = await sendMessage<{
          success: boolean;
          breachedCount?: number;
          breachedItemIds?: string[];
        }>({ type: 'get-breach-status' });
        const breachedItemIds = new Set(breachStatus.breachedItemIds ?? []);
        setSummary({
          ...result.summary,
          breached: breachedItemIds.size,
        });
        setReports(
          result.reports.map((report) =>
            breachedItemIds.has(report.itemId) &&
            !report.issues.some((issue) => issue.type === 'breached')
              ? { ...report, issues: [...report.issues, { type: 'breached' as const }] }
              : report
          )
        );
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

  const checkBreaches = useCallback(async () => {
    setBreachChecking(true);
    setError('');
    try {
      const result = await sendMessage<{
        success: boolean;
        failedCount?: number;
        error?: string;
      }>({
        type: 'run-breach-check',
      });
      if (!result.success) throw new Error(result.error || 'Breach check failed');
      await analyze();
      if (result.failedCount) {
        setError(
          `${result.failedCount} password${result.failedCount === 1 ? '' : 's'} could not be checked. No safe verdict was inferred for those entries.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Breach check failed');
    } finally {
      setBreachChecking(false);
    }
  }, [analyze]);

  const displayReports = filterBreached
    ? reports.filter((r) => r.issues.some((i) => i.type === 'breached'))
    : reports.filter((r) => r.issues.length > 0).sort((a, b) => b.issues.length - a.issues.length);

  return (
    <div className="flex flex-col h-full">
      <div className="extension-subheader">
        <button type="button" className="lb-icon-button" onClick={onBack} aria-label="Back">
          <Icon name="arrow-left" size={19} />
        </button>
        <strong>Security review</strong>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={checkBreaches}
            disabled={loading || breachChecking}
            loading={breachChecking}
            aria-describedby="breach-check-privacy"
          >
            {!breachChecking && <Icon name="shield-check" size={16} />}
            {breachChecking ? 'Checking breaches…' : 'Check for breaches'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={analyze}
            loading={loading}
            title="Refresh local password review"
          >
            {!loading && <Icon name="refresh" size={16} />}
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
        {error && (
          <div className="px-3 py-2 bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-[var(--radius-sm)] text-[var(--color-error)] text-xs">
            {error}
          </div>
        )}

        <p id="breach-check-privacy" className="text-[10px] text-[var(--color-text-tertiary)] m-0">
          Breach checks are manual. Lockbox sends only the first five characters of each
          password's SHA-1 hash to Have I Been Pwned.
        </p>

        {loading && !summary ? (
          <div className="text-center text-[var(--color-text-tertiary)] text-sm mt-10">
            Reviewing vault…
          </div>
        ) : (
          summary && (
            <>
              <Card variant="surface" padding="sm">
                <div className="flex items-start gap-2.5">
                  <Icon
                    name={summary.breached > 0 ? 'alert-circle' : 'shield-check'}
                    size={22}
                    className={summary.breached > 0 ? 'text-[var(--color-error)]' : 'text-[var(--color-primary)]'}
                  />
                  <div>
                    <div className="text-sm font-semibold text-[var(--color-text)]">
                      {summary.breached > 0
                        ? 'Breach results need attention'
                        : summary.weak + summary.reused + summary.old > 0
                          ? 'Review the issues below'
                          : 'No current password issues found'}
                    </div>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 mb-0">
                      Reviewed {summary.totalItems} {summary.totalItems === 1 ? 'login' : 'logins'} locally.
                    </p>
                  </div>
                </div>
              </Card>

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
                      No issues found
                    </div>
                  </Card>
                ) : (
                  <div className="flex flex-col gap-2">
                    {displayReports.slice(0, filterBreached ? undefined : 10).map((report, idx) => {
                      const item = allItems.find((candidate) => candidate.id === report.itemId);
                      return (
                        <Card key={idx} variant="surface" padding="sm">
                          <div className="flex items-center gap-2 mb-1.5 min-w-0">
                            <SiteFavicon
                              sources={item ? getEntryFaviconSources(item) : []}
                              fallbackIcon="key"
                              size={18}
                            />
                            <div className="text-sm font-medium text-[var(--color-text)] truncate">
                              {item?.name || 'Unknown Item'}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {report.issues.map((issue, issueIndex) => (
                              <Badge key={issueIndex} variant={issue.type === 'breached' ? 'error' : 'warning'}>
                                {issue.type.toUpperCase()}
                              </Badge>
                            ))}
                          </div>
                        </Card>
                      );
                    })}
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
