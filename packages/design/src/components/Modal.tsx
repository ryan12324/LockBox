import React from 'react';
import ReactDOM from 'react-dom';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap: Record<'sm' | 'md' | 'lg', number> = {
  sm: 400,
  md: 520,
  lg: 640,
};

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    opacity: visible ? 1 : 0,
    transition: `opacity var(--duration-normal) var(--ease-spring)`,
  };

  const panelStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    maxWidth: sizeMap[size],
    maxHeight: 'calc(100vh - 80px)',
    overflow: 'auto',
    margin: '0 20px',
    background: 'var(--color-frost)',
    border: '1px solid var(--color-frost-border)',
    boxShadow: 'var(--shadow-lg)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderRadius: 'var(--radius-organic-lg)',
    padding: '24px',
    fontFamily: 'var(--font-sans)',
    transform: visible ? 'scale(1)' : 'scale(0.95)',
    opacity: visible ? 1 : 0,
    transition: `transform var(--duration-normal) var(--ease-spring), opacity var(--duration-normal) var(--ease-spring)`,
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-semibold)' as React.CSSProperties['fontWeight'],
    color: 'var(--color-text)',
    lineHeight: 'var(--line-height-tight)',
    margin: 0,
  };

  const closeButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-text-tertiary)',
    fontSize: 'var(--font-size-lg)',
    borderRadius: 'var(--radius-sm)',
    transition: `color var(--duration-fast) var(--ease-smooth)`,
    padding: 0,
    lineHeight: 1,
  };

  return ReactDOM.createPortal(
    <div
      style={backdropStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Modal dialog'}
    >
      <div style={panelStyle}>
        {title !== undefined && (
          <div style={headerStyle}>
            <h2 style={titleStyle}>{title}</h2>
            <button type="button" onClick={onClose} style={closeButtonStyle} aria-label="Close">
              {'\u00D7'}
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
