import type React from 'react';

export type CardVariant = 'surface' | 'raised' | 'frost';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: 'sm' | 'md' | 'lg';
}

export function Card({
  variant = 'surface',
  padding = 'md',
  onClick,
  onKeyDown,
  className,
  role,
  tabIndex,
  children,
  ...rest
}: CardProps) {
  const isInteractive = typeof onClick === 'function';
  const classes = [
    'lb-card',
    `lb-card--${variant}`,
    `lb-card--padding-${padding}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      {...rest}
      className={classes}
      data-interactive={isInteractive ? 'true' : undefined}
      onClick={onClick}
      role={isInteractive ? (role ?? 'button') : role}
      tabIndex={isInteractive ? (tabIndex ?? 0) : tabIndex}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (!isInteractive || event.defaultPrevented) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
    >
      {children}
    </div>
  );
}
