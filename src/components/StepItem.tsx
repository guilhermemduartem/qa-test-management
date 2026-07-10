/* ═══════════════════════════════════════════════════════════
   StepItem — passo de um critério, com autocomplete a partir dos
   "Dados do Relatório" (getStepSuggestions). Porta de buildStepHTML +
   bindStepEvents (app.js).
   ═══════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { getStepSuggestions } from '../lib/reportData';
import { showToast } from '../lib/toast';
import type { Step } from '../types';

interface StepItemProps {
  step: Step;
  index: number;
  total: number;
  /** Estado de recolhimento do critério-pai: usado para re-medir o textarea ao expandir. */
  collapsed?: boolean;
  onChange: (text: string) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onMoveTo: (pos: 'top' | 'bottom') => void;
}

const ArrowUp = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 15l7-7 7 7" /></svg>
);
const ArrowDown = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M19 9l-7 7-7-7" /></svg>
);
const Trash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
);

export function StepItem({ step, index, total, collapsed, onChange, onRemove, onMove, onMoveTo }: StepItemProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [matches, setMatches] = useState<{ texto: string; acoes: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Auto-resize. Enquanto o critério está recolhido o textarea fica em display:none
  // (offsetParent === null) e scrollHeight = 0 — medir nesse estado travaria a altura
  // em ~0px. Então só medimos quando o elemento está visível, e re-medimos ao expandir.
  const resize = () => {
    const el = taRef.current;
    if (!el || el.offsetParent === null) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };
  useEffect(resize, [step.text, collapsed]);

  const close = () => {
    setOpen(false);
    setMatches([]);
    setActiveIndex(-1);
  };

  const updateSuggestions = (text: string) => {
    if (text.trim().length < 3) {
      close();
      return;
    }
    const found = getStepSuggestions(text);
    setMatches(found);
    setActiveIndex(found.length ? 0 : -1);
    setOpen(found.length > 0);
  };

  const apply = (idx: number) => {
    if (idx < 0 || idx >= matches.length) return;
    const selected = matches[idx];
    if (!selected.acoes) {
      showToast('Este passo não possui ação cadastrada e não pode ser adicionado.', 'warning');
      return;
    }
    onChange(selected.texto);
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || matches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      apply(activeIndex >= 0 ? activeIndex : 0);
    } else if (e.key === 'Escape') {
      close();
    }
  };

  return (
    <div className="step-item" data-step-id={step.id}>
      <div className="step-number">{index + 1}</div>
      <div className="step-input-wrap">
        <textarea
          ref={taRef}
          className="step-input"
          rows={1}
          placeholder={`Descreva o passo ${index + 1}...`}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={step.text}
          onChange={(e) => {
            onChange(e.target.value);
            updateSuggestions(e.target.value);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(close, 120)}
        />
        <div className={`step-autocomplete${open ? ' open' : ''}`}>
          {open &&
            matches.map((item, idx) => (
              <button
                type="button"
                key={idx}
                className={`step-ac-item${idx === activeIndex ? ' active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  apply(idx);
                }}
              >
                <span className="step-ac-title">{item.texto}</span>
                {item.acoes ? <span className="step-ac-meta">{item.acoes}</span> : null}
              </button>
            ))}
        </div>
      </div>
      <div className="step-actions">
        {index > 0 && (
          <button className="btn-step-action" onClick={() => onMoveTo('top')} title="Mover para o topo">Topo</button>
        )}
        {index > 0 && (
          <button className="btn-step-action" onClick={() => onMove(-1)} title="Mover para cima"><ArrowUp /></button>
        )}
        {index < total - 1 && (
          <button className="btn-step-action" onClick={() => onMove(1)} title="Mover para baixo"><ArrowDown /></button>
        )}
        {index < total - 1 && (
          <button className="btn-step-action" onClick={() => onMoveTo('bottom')} title="Mover para o fim">Fim</button>
        )}
        <button className="btn-step-action btn-step-action-danger" onClick={onRemove} title="Remover passo"><Trash /></button>
      </div>
    </div>
  );
}
