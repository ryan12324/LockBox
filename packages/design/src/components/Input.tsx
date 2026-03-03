import React from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  type?: 'text' | 'password' | 'search' | 'email';
  error?: string;
  label?: string;
}

export function Input({
  type = 'text',
  error,
  label,
  disabled,
  className,
  style,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const [focused, setFocused] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  const resolvedType = type === 'password' && showPassword ? 'text' : type;

  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontFamily: 'var(--font-sans)',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)' as React.CSSProperties['fontWeight'],
    color: 'var(--color-text-secondary)',
    letterSpacing: 'var(--letter-spacing-wide)',
  };

  const inputWrapperStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    paddingRight: type === 'password' ? 44 : 14,
    fontSize: 'var(--font-size-base)',
    fontFamily: 'var(--font-sans)',
    lineHeight: 'var(--line-height-normal)',
    color: 'var(--color-text)',
    background: 'var(--color-surface)',
    border: `1px solid ${error ? 'var(--color-error)' : focused ? 'var(--color-aura)' : 'var(--color-border)'}`,
    borderRadius: 'var(--radius-md)',
    outline: 'none',
    transition: `all var(--duration-normal) var(--ease-spring)`,
    boxShadow: focused
      ? `0 0 0 3px var(--color-aura-dim), var(--shadow-sm)`
      : error
        ? `0 0 0 3px var(--color-error-subtle)`
        : 'none',
    opacity: disabled ? 0.55 : 1,
    cursor: disabled ? 'not-allowed' : 'text',
    ...style,
  };

  const toggleStyle: React.CSSProperties = {
    position: 'absolute',
    right: 4,
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-text-tertiary)',
    fontSize: 'var(--font-size-sm)',
    borderRadius: 'var(--radius-sm)',
    transition: `color var(--duration-fast) var(--ease-smooth)`,
    padding: 0,
  };

  const errorStyle: React.CSSProperties = {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-error)',
    marginTop: 2,
  };

  return (
    <div style={wrapperStyle} className={className}>
      {label && <label style={labelStyle}>{label}</label>}
      <div style={inputWrapperStyle}>
        <input
          {...rest}
          type={resolvedType}
          disabled={disabled}
          style={inputStyle}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
        {type === 'password' && (
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            style={toggleStyle}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {error && <span style={errorStyle}>{error}</span>}
    </div>
  );
}
