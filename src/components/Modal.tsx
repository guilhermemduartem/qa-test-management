/* ═══════════════════════════════════════════════════════════
   Modal — equivalente React ao openModal/closeModal (app.js).
   Fecha com ESC ou clique no overlay.
   ═══════════════════════════════════════════════════════════ */
import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  large?: boolean;
  xlarge?: boolean;
  className?: string;
}

export function Modal({ title, onClose, children, footer, large, xlarge, className }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal${xlarge ? ' modal-xl' : large ? ' modal-lg' : ''}${className ? ' ' + className : ''}`} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h3 id="modal-title">{title}</h3>
          <button type="button" className="btn-icon" onClick={onClose} title="Fechar" aria-label="Fechar modal">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
