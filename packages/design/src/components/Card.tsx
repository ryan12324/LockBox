import React from 'react';

export type CardVariant = 'surface' | 'raised' | 'frost';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: 'sm' | 'md' | 'lg';
}

const variantStyles: Record<CardVariant, React.CSSProperties> = {
  surface: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    boxShadow: 'var(--shadow-sm)',
    backdropFilter: undefined,
  },
  raised: {
    background: 'var(--color-surface-raised)',
    border: '1px solid var(--color-border)',
    boxShadow: 'var(--shadow-md)',
    backdropFilter: undefined,
  },
  frost: {
    background: 'var(--color-frost)',
    border: '1px solid var(--color-frost-border)',
    boxShadow: 'var(--shadow-sm)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
  },
};

const paddingMap: Record<'sm' | 'md' | 'lg', string> = {
  sm: '12px',
  md: '20px',
  lg: '28px',
};

export function Card({
  variant = 'surface',
  padding = 'md',
  onClick,
  style,
  children,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: CardProps) {
  const [hovered, setHovered] = React.useState(false);

  const isInteractive = typeof onClick === 'function';

  const baseStyle: React.CSSProperties = {
    borderRadius: 'var(--radius-organic-lg)',
    padding: paddingMap[padding],
    transition: `all var(--duration-normal) var(--ease-spring)`,
    cursor: isInteractive ? 'pointer' : 'default',
    ...variantStyles[variant],
  };

  if (isInteractive && hovered) {
    baseStyle.boxShadow = 'var(--shadow-lg)';
    baseStyle.transform = 'translateY(-1px)';
  }

  return (
    <div
      {...rest}
      onClick={onClick}
      style={{ ...baseStyle, ...style }}
      onMouseEnter={(e) => {
        setHovered(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        onMouseLeave?.(e);
      }}
    >
      {children}
    </div>
  );
}
