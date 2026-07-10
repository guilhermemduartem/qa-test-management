/* ═══════════════════════════════════════════════════════════
   ToastProvider — porta da função showToast (app.js).
   Registra o handler em lib/toast para módulos não-React.
   ═══════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { registerToastHandler, type ToastType } from '../lib/toast';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  fadeOut: boolean;
}

const ICONS: Record<ToastType, string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    registerToastHandler((message, type = 'info', duration = 3500) => {
      const id = ++counter.current;
      setToasts((prev) => [...prev, { id, message, type, fadeOut: false }]);
      setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, fadeOut: true } : t)));
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 300);
      }, duration);
    });
  }, []);

  return (
    <>
      {children}
      <div id="toast-container" className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}${t.fadeOut ? ' fade-out' : ''}`}>
            <span className="toast-icon">{ICONS[t.type] || 'ℹ️'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}
