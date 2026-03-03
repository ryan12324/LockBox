import React, { useState } from 'react';
import type { PasswordHealthReport, VaultItem } from '@lockbox/types';

interface IssueListProps {
  reports: PasswordHealthReport[];
  items: VaultItem[];
  onItemClick: (itemId: string) => void;
}

type FilterType = 'all' | 'weak' | 'reused' | 'old' | 'breached';

export default function IssueList({ reports, items, onItemClick }: IssueListProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  // Filter reports that actually have issues
  const problematicReports = reports.filter((r) => r.issues.length > 0);

  const filteredReports = problematicReports.filter((report) => {
    if (filter === 'all') return true;
    return report.issues.some((issue) => issue.type === filter);
  });

  const getBadges = (report: PasswordHealthReport) => {
    return report.issues.map((issue, idx) => {
      switch (issue.type) {
        case 'weak':
          return (
            <span
              key={idx}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-error-subtle)] text-[var(--color-error)] border border-[var(--color-error)]"
            >
              Weak
            </span>
          );
        case 'reused':
          return (
            <span
              key={idx}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-warning-subtle)] text-[var(--color-warning)] border border-[var(--color-warning)]"
            >
              Reused
            </span>
          );
        case 'old':
          return (
            <span
              key={idx}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-warning-subtle)] text-[var(--color-warning)] border border-[var(--color-warning)]"
            >
              Old
            </span>
          );
        case 'breached':
          return (
            <span
              key={idx}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-error-subtle)] text-[var(--color-error)] border border-[var(--color-error)]"
            >
              💀 Breached
            </span>
          );
        default:
          return null;
      }
    });
  };

  const getScoreColor = (score: number) => {
    // Score is 0-4 (zxcvbn scale)
    if (score < 2) return 'text-[var(--color-error)]';
    if (score === 2) return 'text-[var(--color-warning)]';
    if (score === 3) return 'text-[var(--color-primary)]';
    return 'text-[var(--color-success)]';
  };

  const getScoreLabel = (score: number) => {
    if (score < 2) return 'Poor';
    if (score === 2) return 'Fair';
    if (score === 3) return 'Good';
    return 'Excellent';
  };

  const tabs: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'All Issues' },
    { id: 'weak', label: 'Weak' },
    { id: 'reused', label: 'Reused' },
    { id: 'old', label: 'Old' },
    { id: 'breached', label: 'Breached' },
  ];

  if (problematicReports.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-[var(--radius-full)] bg-[var(--color-success-subtle)] text-[var(--color-success)] flex items-center justify-center mx-auto mb-4 border border-[var(--color-success)]">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-medium text-[var(--color-text)] mb-2">Looking Good</h3>
        <p className="text-[var(--color-text-secondary)] max-w-sm mx-auto">
          We didn't find any issues with your passwords. Keep up the good work!
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-6">
      {/* Filter Tabs */}
      <div className="flex overflow-x-auto pb-2 -mx-2 px-2 space-x-2 scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`whitespace-nowrap px-4 py-2 rounded-[var(--radius-md)] text-sm font-medium transition-colors ${
              filter === tab.id
                ? 'bg-[var(--color-primary)] text-[var(--color-primary-fg)] border border-[var(--color-primary)]'
                : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] overflow-hidden">
        {filteredReports.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-text-tertiary)]">
            No items match this filter.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {filteredReports.map((report) => {
              const item = items.find((i) => i.id === report.itemId);
              if (!item) return null;

              return (
                <li key={report.itemId}>
                  <button
                    onClick={() => onItemClick(item.id)}
                    className="w-full text-left px-6 py-4 hover:bg-[var(--color-bg-subtle)] transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-4">
                      {/* Item Icon Placeholder */}
                      <div className="w-10 h-10 rounded-[var(--radius-full)] bg-[var(--color-surface)] flex items-center justify-center border border-[var(--color-border)] flex-shrink-0 text-[var(--color-text-secondary)]">
                        {item.type === 'login' ? '🔑' : '📄'}
                      </div>

                      <div className="flex flex-col">
                        <span className="text-[var(--color-text)] font-medium text-base mb-1">
                          {item.name}
                        </span>
                        <div className="flex flex-wrap gap-2">{getBadges(report)}</div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end opacity-80 group-hover:opacity-100 transition-opacity">
                      <span className={`text-sm font-bold ${getScoreColor(report.score)}`}>
                        {getScoreLabel(report.score)}
                      </span>
                      <span className="text-xs text-[var(--color-text-tertiary)] mt-1">
                        Score: {report.score}/4
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
