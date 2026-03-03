import React from 'react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
}

export function Select({
  label,
  error,
  options,
  disabled,
  className,
  style,
  onFocus,
  onBlur,
  ...rest
}: SelectProps) {
  const [focused, setFocused] = React.useState(false);

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

  const selectWrapperStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  };

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 36px 10px 14px',
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
    cursor: disabled ? 'not-allowed' : 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none' as React.CSSProperties['MozAppearance'],
    ...style,
  };

  const chevronStyle: React.CSSProperties = {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: 'translateY(-50%)',
    pointerEvents: 'none',
    color: 'var(--color-text-tertiary)',
    fontSize: 'var(--font-size-sm)',
    lineHeight: 1,
  };

  const errorStyle: React.CSSProperties = {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-error)',
    marginTop: 2,
  };

  return (
    <div style={wrapperStyle} className={className}>
      {label && <label style={labelStyle}>{label}</label>}
      <div style={selectWrapperStyle}>
        <select
          {...rest}
          disabled={disabled}
          style={selectStyle}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span style={chevronStyle} aria-hidden="true">
          {'\u25BE'}
        </span>
      </div>
      {error && <span style={errorStyle}>{error}</span>}
    </div>
  );
}
