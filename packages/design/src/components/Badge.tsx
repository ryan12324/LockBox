import React from 'react';

export type BadgeVariant = 'default' | 'primary' | 'error' | 'success' | 'warning';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  default: {
    background: 'var(--color-bg-subtle)',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)',
  },
  primary: {
    background: 'var(--color-aura-dim)',
    color: 'var(--color-primary)',
    border: '1px solid transparent',
  },
  error: {
    background: 'var(--color-error-subtle)',
    color: 'var(--color-error)',
    border: '1px solid transparent',
  },
  success: {
    background: 'var(--color-success-subtle)',
    color: 'var(--color-success)',
    border: '1px solid transparent',
  },
  warning: {
    background: 'var(--color-warning-subtle)',
    color: 'var(--color-warning)',
    border: '1px solid transparent',
  },
};

export function Badge({ variant = 'default', style, children, ...rest }: BadgeProps) {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 10px',
    fontSize: 'var(--font-size-xs)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 'var(--font-weight-medium)' as React.CSSProperties['fontWeight'],
    lineHeight: 'var(--line-height-tight)',
    letterSpacing: 'var(--letter-spacing-wide)',
    borderRadius: 'var(--radius-full)',
    whiteSpace: 'nowrap',
    ...variantStyles[variant],
  };

  return (
    <span {...rest} style={{ ...baseStyle, ...style }}>
      {children}
    </span>
  );
}
