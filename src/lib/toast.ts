/* ═══════════════════════════════════════════════════════════
   toast.ts — Ponte de notificações para módulos não-React.
   O ToastProvider registra o handler real; os libs (storage,
   reportData, exporters) chamam showToast() sem importar React.
   ═══════════════════════════════════════════════════════════ */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

type ToastHandler = (message: string, type?: ToastType, duration?: number) => void;

let handler: ToastHandler = (message, type) => {
  // Fallback antes do provider montar.
  console.log(`[toast:${type || 'info'}]`, message);
};

export function registerToastHandler(fn: ToastHandler): void {
  handler = fn;
}

export function showToast(message: string, type: ToastType = 'info', duration = 3500): void {
  handler(message, type, duration);
}
