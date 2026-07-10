/* ═══════════════════════════════════════════════════════════
   HelpTooltip — ícone "?" com popover de ajuda.
   Usado ao lado do título de cada tela do módulo de Testes para
   explicar, em linguagem simples, como usar a tela (foco beta).
   Abre no hover e no clique (acessível por teclado).
   ═══════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState, type ReactNode } from 'react';

interface HelpTooltipProps {
  /** Conteúdo da ajuda (texto ou JSX com <strong>, <ul>, etc.). */
  children: ReactNode;
  /** Rótulo acessível do botão. */
  label?: string;
}

export function HelpTooltip({ children, label = 'Como usar esta tela' }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span
      className="help-tip"
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="help-tip-btn"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open && (
        <span className="help-tip-pop" role="tooltip">
          {children}
        </span>
      )}
    </span>
  );
}
