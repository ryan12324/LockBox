import React, { useState } from 'react';
import { Card, Badge, Button, Icon, type IconName } from '@lockbox/design';
import type { PasswordHealthReport, VaultItem } from '@lockbox/types';

interface IssueListProps {
  reports: PasswordHealthReport[];
  items: VaultItem[];
  onItemClick: (itemId: string) => void;
}

type FilterType = 'all' | 'weak' | 'reused' | 'old' | 'breached';

export default function IssueList({ reports, items, onItemClick }: IssueListProps) {
  const [filter, setFilter] = useState<FilterType>('all');

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
            <Badge key={idx} variant="error">
              Weak
            </Badge>
          );
        case 'reused':
          return (
            <Badge key={idx} variant="warning">
              Reused
            </Badge>
          );
        case 'old':
          return (
            <Badge key={idx} variant="warning">
              Old
            </Badge>
          );
        case 'breached':
          return (
            <Badge key={idx} variant="error">
              Breached
            </Badge>
          );
        default:
          return null;
      }
    });
  };

  const tabs: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'All issues' },
    { id: 'weak', label: 'Weak' },
    { id: 'reused', label: 'Reused' },
    { id: 'old', label: 'Old' },
    { id: 'breached', label: 'Breached' },
  ];

  if (problematicReports.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-[var(--radius-md)] bg-[var(--color-success-subtle)] text-[var(--color-success)] flex items-center justify-center mx-auto mb-4 border border-[var(--color-success)]">
          <Icon name="shield-check" size={30} />
        </div>
        <h3 className="text-xl font-medium text-[var(--color-text)] mb-2">No issues found</h3>
        <p className="text-[var(--color-text-secondary)] max-w-sm mx-auto">
          The current local review did not flag any weak, reused, old, or breached passwords.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-6">
      <div className="flex overflow-x-auto pb-2 -mx-2 px-2 space-x-2 scrollbar-hide">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={filter === tab.id ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFilter(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <Card variant="surface" padding="sm" style={{ overflow: 'hidden' }}>
        {filteredReports.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-text-tertiary)]">
            No items match this filter.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {filteredReports.map((report) => {
              const item = items.find((i) => i.id === report.itemId);
              if (!item) return null;
              const itemIcons: Record<string, IconName> = {
                login: 'key',
                note: 'note',
                card: 'credit-card',
                identity: 'id',
                passkey: 'fingerprint',
                document: 'file-description',
              };

              return (
                <li key={report.itemId}>
                  <Card
                    variant="surface"
                    padding="md"
                    onClick={() => onItemClick(item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderRadius: 0,
                      border: 'none',
                      boxShadow: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--color-surface)] flex items-center justify-center border border-[var(--color-border)] flex-shrink-0 text-[var(--color-text-secondary)]">
                        <Icon name={itemIcons[item.type] ?? 'file'} size={18} />
                      </div>

                      <div className="flex flex-col">
                        <span className="text-[var(--color-text)] text-base mb-1">
                          {item.name}
                        </span>
                        <div className="flex flex-wrap gap-2">{getBadges(report)}</div>
                      </div>
                    </div>

                    <Icon name="chevron-right" size={18} className="text-[var(--color-text-tertiary)]" />
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
