import React from 'react';
import { Badge, Button } from '@lockbox/design';
import type { SecurityAlert } from '@lockbox/ai';

export interface SecurityAlertsSectionProps {
  alerts: SecurityAlert[];
  dismissedAlerts: Set<string>;
  setDismissedAlerts: React.Dispatch<React.SetStateAction<Set<string>>>;
  onAlertAction: (actionType: string) => void;
}

export default function SecurityAlertsSection({
  alerts,
  dismissedAlerts,
  setDismissedAlerts,
  onAlertAction,
}: SecurityAlertsSectionProps) {
  const visibleAlerts = alerts.filter((a) => !dismissedAlerts.has(a.title));
  if (visibleAlerts.length === 0) return null;

  return (
    <div className="space-y-3 pt-4 border-t border-[var(--color-border)]">
      <span className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-2">
        Security Alerts
      </span>
      {visibleAlerts.map((alert, i) => {
        const isCritical = alert.severity === 'critical';
        const isWarning = alert.severity === 'warning';
        return (
          <div
            key={i}
            className={`p-4 rounded-[var(--radius-lg)] border flex items-start gap-3 ${
              isCritical
                ? 'bg-[var(--color-error-subtle)] border-[var(--color-error)] text-[var(--color-error)]'
                : isWarning
                  ? 'bg-[var(--color-warning-subtle)] border-[var(--color-warning)] text-[var(--color-warning)]'
                  : 'bg-[var(--color-aura-dim)] border-[var(--color-primary)] text-[var(--color-primary)]'
            }`}
          >
            <div className="text-xl">{isCritical ? '🛡️' : isWarning ? '⚠️' : 'ℹ️'}</div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start gap-2">
                <div className="flex items-center gap-2">
                  <h4
                    className={`font-medium text-sm ${
                      isCritical
                        ? 'text-[var(--color-error)]'
                        : isWarning
                          ? 'text-[var(--color-warning)]'
                          : 'text-[var(--color-primary)]'
                    }`}
                  >
                    {alert.title}
                  </h4>
                  <Badge variant={isCritical ? 'error' : isWarning ? 'warning' : 'primary'}>
                    {alert.severity}
                  </Badge>
                </div>
                {alert.dismissible && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDismissedAlerts((prev) => new Set([...prev, alert.title]))}
                    style={{
                      padding: '4px',
                      minHeight: 'auto',
                      marginRight: '-8px',
                      marginTop: '-8px',
                    }}
                  >
                    ✕
                  </Button>
                )}
              </div>
              <p className="text-sm mt-1 opacity-80 leading-relaxed">{alert.message}</p>
              {alert.action && (
                <Button
                  variant={isCritical ? 'danger' : isWarning ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={() => onAlertAction(alert.action!.type)}
                  style={{ marginTop: '12px' }}
                >
                  {alert.action.label}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
