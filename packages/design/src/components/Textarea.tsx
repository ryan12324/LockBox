import React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  resize?: 'none' | 'vertical' | 'both';
}

export function Textarea({
  label,
  error,
  resize = 'vertical',
  disabled,
  className,
  style,
  onFocus,
  onBlur,
  ...rest
}: TextareaProps) {
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

  const textareaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 100,
    padding: '10px 14px',
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
    resize,
    ...style,
  };

  const errorStyle: React.CSSProperties = {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-error)',
    marginTop: 2,
  };

  return (
    <div style={wrapperStyle} className={className}>
      {label && <label style={labelStyle}>{label}</label>}
      <textarea
        {...rest}
        disabled={disabled}
        style={textareaStyle}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
      />
      {error && <span style={errorStyle}>{error}</span>}
    </div>
  );
}
