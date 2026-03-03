import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Toast, type ToastVariant } from '@lockbox/design';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  createdAt: number;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_TOASTS = 5;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const newToast: ToastItem = {
      id: crypto.randomUUID(),
      message,
      variant,
      createdAt: Date.now(),
    };

    setToasts((prev) => {
      const next = [...prev, newToast];
      if (next.length > MAX_TOASTS) {
        return next.slice(next.length - MAX_TOASTS);
      }
      return next;
    });
  }, []);

  const contextValue = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {createPortal(
        <div
          style={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            pointerEvents: 'none',
          }}
        >
          {toasts.map((item) => (
            <div key={item.id} style={{ pointerEvents: 'auto' }}>
              <Toast
                message={item.message}
                variant={item.variant}
                duration={4000}
                onDismiss={() => removeToast(item.id)}
                visible={true}
              />
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
