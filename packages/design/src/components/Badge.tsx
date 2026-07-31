import type React from 'react';

export type BadgeVariant = 'default' | 'primary' | 'error' | 'success' | 'warning';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = 'default', className, children, ...rest }: BadgeProps) {
  const classes = ['lb-badge', `lb-badge--${variant}`, className].filter(Boolean).join(' ');
  return (
    <span {...rest} className={classes}>
      {children}
    </span>
  );
}
