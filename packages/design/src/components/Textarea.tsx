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
  id: providedId,
  'aria-describedby': describedBy,
  style,
  ...rest
}: TextareaProps) {
  const generatedId = React.useId();
  const id = providedId ?? `lb-textarea-${generatedId}`;
  const errorId = `${id}-error`;

  return (
    <div className={['lb-field', className].filter(Boolean).join(' ')}>
      {label && (
        <label className="lb-field__label" htmlFor={id}>
          {label}
        </label>
      )}
      <textarea
        {...rest}
        id={id}
        disabled={disabled}
        className="lb-field__textarea"
        style={{ ...style, resize }}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined}
      />
      {error && (
        <p id={errorId} className="lb-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
