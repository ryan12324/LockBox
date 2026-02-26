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
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30"
            >
              Weak
            </span>
          );
        case 'reused':
          return (
            <span
              key={idx}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30"
            >
              Reused
            </span>
          );
        case 'old':
          return (
            <span
              key={idx}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
            >
              Old
            </span>
          );
        case 'breached':
          return (
            <span
              key={idx}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30"
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
    if (score < 2) return 'text-red-500';
    if (score === 2) return 'text-amber-500';
    if (score === 3) return 'text-indigo-400';
    return 'text-emerald-500';
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
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-medium text-white mb-2">Looking Good</h3>
        <p className="text-white/60 max-w-sm mx-auto">
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
            className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === tab.id
                ? 'bg-indigo-600/80 text-white border border-indigo-500/50'
                : 'bg-white/[0.06] text-white/70 border border-white/[0.12] hover:bg-white/[0.1] hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-white/[0.07] backdrop-blur-xl border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] overflow-hidden">
        {filteredReports.length === 0 ? (
          <div className="p-8 text-center text-white/50">No items match this filter.</div>
        ) : (
          <ul className="divide-y divide-white/[0.08]">
            {filteredReports.map((report) => {
              const item = items.find((i) => i.id === report.itemId);
              if (!item) return null;

              return (
                <li key={report.itemId}>
                  <button
                    onClick={() => onItemClick(item.id)}
                    className="w-full text-left px-6 py-4 hover:bg-white/[0.04] transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-4">
                      {/* Item Icon Placeholder */}
                      <div className="w-10 h-10 rounded-full bg-white/[0.08] flex items-center justify-center border border-white/[0.1] flex-shrink-0 text-white/60">
                        {item.type === 'login' ? '🔑' : '📄'}
                      </div>

                      <div className="flex flex-col">
                        <span className="text-white font-medium text-base mb-1">{item.name}</span>
                        <div className="flex flex-wrap gap-2">{getBadges(report)}</div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end opacity-80 group-hover:opacity-100 transition-opacity">
                      <span className={`text-sm font-bold ${getScoreColor(report.score)}`}>
                        {getScoreLabel(report.score)}
                      </span>
                      <span className="text-xs text-white/40 mt-1">Score: {report.score}/4</span>
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
