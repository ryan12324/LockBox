import React from 'react';
import { Icon, type IconName } from './Icon.js';

export type ToastVariant = 'info' | 'success' | 'error' | 'warning';

export interface ToastProps {
  variant?: ToastVariant;
  message: string;
  duration?: number;
  onDismiss?: () => void;
  visible?: boolean;
}

const variantIcon: Record<ToastVariant, IconName> = {
  info: 'info-circle',
  success: 'circle-check',
  error: 'alert-circle',
  warning: 'alert-triangle',
};

export function Toast({
  variant = 'info',
  message,
  duration = 4000,
  onDismiss,
  visible = true,
}: ToastProps) {
  const [show, setShow] = React.useState(visible);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    setShow(visible);
  }, [visible]);

  React.useEffect(() => {
    if (!show || paused || duration <= 0) return;
    const timer = setTimeout(() => {
      setShow(false);
      onDismiss?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [show, paused, duration, onDismiss]);

  if (!show) return null;

  return (
    <div
      className={`lb-toast lb-toast--${variant}`}
      role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
      aria-live={variant === 'error' || variant === 'warning' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon name={variantIcon[variant]} size={20} className="lb-toast__icon" />
      <span className="lb-toast__message">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={() => {
            setShow(false);
            onDismiss();
          }}
          className="lb-icon-button"
          aria-label="Dismiss notification"
        >
          <Icon name="x" size={18} />
        </button>
      )}
    </div>
  );
}
