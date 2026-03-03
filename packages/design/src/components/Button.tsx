import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--color-primary)',
    color: 'var(--color-primary-fg)',
    border: '1px solid transparent',
  },
  secondary: {
    background: 'var(--color-surface)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'var(--color-error)',
    color: '#ffffff',
    border: '1px solid transparent',
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: {
    padding: '6px 14px',
    fontSize: 'var(--font-size-sm)',
    minHeight: 32,
  },
  md: {
    padding: '10px 20px',
    fontSize: 'var(--font-size-base)',
    minHeight: 40,
  },
  lg: {
    padding: '14px 28px',
    fontSize: 'var(--font-size-lg)',
    minHeight: 48,
  },
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  style,
  children,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onMouseUp,
  ...rest
}: ButtonProps) {
  const [hovered, setHovered] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);

  const isDisabled = disabled || loading;

  const hoverBackground: Record<ButtonVariant, string> = {
    primary: 'var(--color-primary-hover)',
    secondary: 'var(--color-bg-subtle)',
    ghost: 'var(--color-bg-subtle)',
    danger: 'var(--color-error)',
  };

  const activeBackground: Record<ButtonVariant, string> = {
    primary: 'var(--color-primary-active)',
    secondary: 'var(--color-bg)',
    ghost: 'var(--color-border)',
    danger: 'var(--color-error)',
  };

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    fontFamily: 'var(--font-sans)',
    fontWeight: 'var(--font-weight-medium)' as React.CSSProperties['fontWeight'],
    lineHeight: 'var(--line-height-tight)',
    letterSpacing: 'var(--letter-spacing-normal)',
    borderRadius: 'var(--radius-organic-md)',
    boxShadow: variant === 'primary' || variant === 'danger' ? 'var(--shadow-sm)' : 'none',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.55 : 1,
    transition: `all var(--duration-normal) var(--ease-spring)`,
    outline: 'none',
    textDecoration: 'none',
    userSelect: 'none' as const,
    ...variantStyles[variant],
    ...sizeStyles[size],
  };

  if (!isDisabled && pressed) {
    baseStyle.background = activeBackground[variant];
    baseStyle.transform = 'scale(0.97)';
  } else if (!isDisabled && hovered) {
    baseStyle.background = hoverBackground[variant];
    baseStyle.boxShadow =
      variant === 'primary' || variant === 'danger' ? 'var(--shadow-md)' : 'var(--shadow-sm)';
  }

  return (
    <button
      {...rest}
      disabled={isDisabled}
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
        setPressed(true);
        onMouseDown?.(e);
      }}
      onMouseUp={(e) => {
        setPressed(false);
        onMouseUp?.(e);
      }}
    >
      {loading ? '...' : children}
    </button>
  );
}
