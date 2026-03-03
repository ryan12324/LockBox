import React from 'react';

export type ToastVariant = 'info' | 'success' | 'error' | 'warning';

export interface ToastProps {
  variant?: ToastVariant;
  message: string;
  duration?: number;
  onDismiss?: () => void;
  visible?: boolean;
}

const variantConfig: Record<ToastVariant, { bg: string; border: string; icon: string }> = {
  info: {
    bg: 'var(--color-surface-raised)',
    border: 'var(--color-border)',
    icon: '\u2139',
  },
  success: {
    bg: 'var(--color-success-subtle)',
    border: 'var(--color-success)',
    icon: '\u2713',
  },
  error: {
    bg: 'var(--color-error-subtle)',
    border: 'var(--color-error)',
    icon: '\u2717',
  },
  warning: {
    bg: 'var(--color-warning-subtle)',
    border: 'var(--color-warning)',
    icon: '\u26A0',
  },
};

export function Toast({
  variant = 'info',
  message,
  duration = 4000,
  onDismiss,
  visible = true,
}: ToastProps) {
  const [show, setShow] = React.useState(visible);
  const timerRef = React.useRef<ReturnType<typeof setTimeout>>(null);

  React.useEffect(() => {
    setShow(visible);
  }, [visible]);

  React.useEffect(() => {
    if (!show || duration <= 0) return;

    timerRef.current = setTimeout(() => {
      setShow(false);
      onDismiss?.();
    }, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [show, duration, onDismiss]);

  if (!show) return null;

  const config = variantConfig[variant];

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 20,
    right: 20,
    zIndex: 9999,
  };

  const toastStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 18px',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--font-size-sm)',
    lineHeight: 'var(--line-height-tight)',
    color: 'var(--color-text)',
    background: config.bg,
    border: `1px solid ${config.border}`,
    borderRadius: 'var(--radius-organic-md)',
    boxShadow: 'var(--shadow-lg)',
    maxWidth: 360,
    minWidth: 200,
  };

  const iconStyle: React.CSSProperties = {
    flexShrink: 0,
    fontSize: 'var(--font-size-base)',
  };

  const dismissStyle: React.CSSProperties = {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-text-tertiary)',
    fontSize: 'var(--font-size-base)',
    padding: '0 0 0 8px',
    lineHeight: 1,
  };

  return (
    <div style={containerStyle}>
      <div className="fade-in" style={toastStyle}>
        <span style={iconStyle}>{config.icon}</span>
        <span style={{ flex: 1 }}>{message}</span>
        {onDismiss && (
          <button
            type="button"
            onClick={() => {
              setShow(false);
              onDismiss();
            }}
            style={dismissStyle}
            aria-label="Dismiss"
          >
            {'\u00D7'}
          </button>
        )}
      </div>
    </div>
  );
}
