import React from 'react';

export type CardVariant = 'surface' | 'raised' | 'frost';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: 'sm' | 'md' | 'lg';
}

const variantStyles: Record<CardVariant, React.CSSProperties> = {
  surface: {
    background: 'var(--color-surface)',
    border: 'none',
    boxShadow: 'var(--shadow-md)',
  },
  raised: {
    background: 'var(--color-surface-raised)',
    border: 'none',
    boxShadow: 'var(--shadow-lg)',
  },
  frost: {
    background: 'var(--color-frost)',
    border: 'none',
    boxShadow: 'var(--shadow-lg)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
  },
};

const paddingMap: Record<'sm' | 'md' | 'lg', string> = {
  sm: '14px',
  md: '22px',
  lg: '32px',
};

export function Card({
  variant = 'surface',
  padding = 'md',
  onClick,
  style,
  children,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onMouseUp,
  ...rest
}: CardProps) {
  const [hovered, setHovered] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);

  const isInteractive = typeof onClick === 'function';

  const baseStyle: React.CSSProperties = {
    borderRadius: 'var(--radius-organic-lg)',
    padding: paddingMap[padding],
    transition: `all var(--duration-normal) cubic-bezier(0.34, 1.56, 0.64, 1)`,
    cursor: isInteractive ? 'pointer' : 'default',
    ...variantStyles[variant],
  };

  if (isInteractive && pressed) {
    baseStyle.boxShadow = 'var(--shadow-depress)';
    baseStyle.transform = 'translateY(1px) scale(0.985)';
  } else if (isInteractive && hovered) {
    baseStyle.boxShadow = 'var(--shadow-xl)';
    baseStyle.transform = 'translateY(-3px)';
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
        setPressed(false);
        onMouseLeave?.(e);
      }}
      onMouseDown={(e) => {
        if (isInteractive) setPressed(true);
        onMouseDown?.(e);
      }}
      onMouseUp={(e) => {
        setPressed(false);
        onMouseUp?.(e);
      }}
    >
      {children}
    </div>
  );
}
