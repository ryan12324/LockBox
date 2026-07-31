import React from 'react';
import { Icon } from './Icon.js';

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
  id: providedId,
  'aria-describedby': describedBy,
  ...rest
}: InputProps) {
  const generatedId = React.useId();
  const id = providedId ?? `lb-input-${generatedId}`;
  const errorId = `${id}-error`;
  const [showPassword, setShowPassword] = React.useState(false);
  const resolvedType = type === 'password' && showPassword ? 'text' : type;
  const inputClasses = ['lb-field__input', type === 'password' && 'lb-field__input--password']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={['lb-field', className].filter(Boolean).join(' ')}>
      {label && (
        <label className="lb-field__label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="lb-field__control">
        <input
          {...rest}
          id={id}
          type={resolvedType}
          disabled={disabled}
          className={inputClasses}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={[describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined}
        />
        {type === 'password' && (
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="lb-icon-button lb-field__password-toggle"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            disabled={disabled}
          >
            <Icon name={showPassword ? 'eye-off' : 'eye'} size={20} />
          </button>
        )}
      </div>
      {error && (
        <p id={errorId} className="lb-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
