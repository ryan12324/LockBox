import React from 'react';
import { Icon } from './Icon.js';

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
  id: providedId,
  'aria-describedby': describedBy,
  ...rest
}: SelectProps) {
  const generatedId = React.useId();
  const id = providedId ?? `lb-select-${generatedId}`;
  const errorId = `${id}-error`;

  return (
    <div className={['lb-field', className].filter(Boolean).join(' ')}>
      {label && (
        <label className="lb-field__label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="lb-field__control">
        <select
          {...rest}
          id={id}
          disabled={disabled}
          className="lb-field__select"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={[describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size={18} className="lb-field__chevron" />
      </div>
      {error && (
        <p id={errorId} className="lb-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
