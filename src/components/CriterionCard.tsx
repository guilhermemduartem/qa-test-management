/* ═══════════════════════════════════════════════════════════
   CriterionCard — porta de buildCriterionHTML + bindCriterionFieldEvents
   (app.js). Recebe `update` para mutar o critério no estado do relatório.
   ═══════════════════════════════════════════════════════════ */
import { StepItem } from './StepItem';
import { ImageDropzone } from './ImageDropzone';
import { statusColor, generateId } from '../lib/utils';
import { showToast } from '../lib/toast';
import type { Criterion, ReportImage, Status } from '../types';

const STATUS_LABELS: Record<Status, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Reprovado',
  partial: 'Parcial',
};

interface CriterionCardProps {
  criterion: Criterion;
  index: number;
  total: number;
  update: (fn: (c: Criterion) => void) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onToggleCollapse: () => void;
}

export function CriterionCard({ criterion: c, index, total, update, onRemove, onMove, onToggleCollapse }: CriterionCardProps) {
  return (
    <div className={`criterion-card${c.collapsed ? ' collapsed' : ''}`} data-criterion-id={c.id}>
      <div className="criterion-header" onClick={onToggleCollapse}>
        <div className="criterion-number">{index + 1}</div>
        <div className="criterion-header-title">{c.title || 'Critério sem título'}</div>
        <div className="criterion-header-status">
          <span className={`status-pill ${c.status || 'pending'}`}>{STATUS_LABELS[c.status] || 'Pendente'}</span>
        </div>
        <div className="criterion-actions" onClick={(e) => e.stopPropagation()}>
          {index > 0 && (
            <button className="btn-icon btn-icon-sm" onClick={() => onMove(-1)} title="Mover para cima">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 15l7-7 7 7" /></svg>
            </button>
          )}
          {index < total - 1 && (
            <button className="btn-icon btn-icon-sm" onClick={() => onMove(1)} title="Mover para baixo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M19 9l-7 7-7-7" /></svg>
            </button>
          )}
          <button className="btn-icon btn-icon-sm" onClick={onRemove} title="Remover critério" style={{ color: 'var(--error)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
        <div className="criterion-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 9l-7 7-7-7" /></svg>
        </div>
      </div>

      <div className="criterion-body">
        <div className="form-group">
          <label>Título do Critério</label>
          <input
            type="text"
            value={c.title}
            placeholder="Ex: Login com credenciais válidas"
            onChange={(e) => update((d) => { d.title = e.target.value; })}
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Descrição</label>
            <textarea
              rows={2}
              placeholder="Descrição do critério..."
              value={c.description}
              onChange={(e) => update((d) => { d.description = e.target.value; })}
            />
          </div>
          <div className="form-group">
            <label>Resultado Esperado</label>
            <textarea
              rows={2}
              placeholder="O que deve acontecer..."
              value={c.expectedResult}
              onChange={(e) => update((d) => { d.expectedResult = e.target.value; })}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="steps-section">
          <div className="steps-label">
            <span>Passo a Passo</span>
          </div>
          <div className="steps-list">
            {c.steps.map((s, si) => (
              <StepItem
                key={s.id}
                step={s}
                index={si}
                total={c.steps.length}
                collapsed={c.collapsed}
                onChange={(text) => update((d) => { const st = d.steps.find((x) => x.id === s.id); if (st) st.text = text; })}
                onRemove={() => {
                  if (c.steps.length <= 1) {
                    showToast('Deve haver pelo menos um passo.', 'warning');
                    return;
                  }
                  update((d) => { d.steps = d.steps.filter((x) => x.id !== s.id); });
                }}
                onMove={(dir) =>
                  update((d) => {
                    const idx = d.steps.findIndex((x) => x.id === s.id);
                    const ni = idx + dir;
                    if (idx < 0 || ni < 0 || ni >= d.steps.length) return;
                    [d.steps[idx], d.steps[ni]] = [d.steps[ni], d.steps[idx]];
                  })
                }
                onMoveTo={(pos) =>
                  update((d) => {
                    const idx = d.steps.findIndex((x) => x.id === s.id);
                    if (idx < 0) return;
                    const [step] = d.steps.splice(idx, 1);
                    if (pos === 'top') d.steps.unshift(step);
                    else d.steps.push(step);
                  })
                }
              />
            ))}
          </div>
          <div className="steps-add-action">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => update((d) => { d.steps.push({ id: generateId(), text: '' }); })}
            >
              + Adicionar Passo
            </button>
          </div>
        </div>

        {/* Images */}
        <ImageDropzone
          images={c.images}
          onAdd={(imgs: ReportImage[]) => update((d) => { d.images.push(...imgs); })}
          onRemove={(imageId) => update((d) => { d.images = d.images.filter((i) => i.id !== imageId); })}
          onMove={(imageId, dir) =>
            update((d) => {
              const idx = d.images.findIndex((i) => i.id === imageId);
              const ni = idx + dir;
              if (idx < 0 || ni < 0 || ni >= d.images.length) return;
              [d.images[idx], d.images[ni]] = [d.images[ni], d.images[idx]];
            })
          }
          onRename={(imageId, newName) =>
            update((d) => {
              const img = d.images.find((i) => i.id === imageId);
              if (img) img.name = newName;
            })
          }
        />

        {/* Obtained Result & Status */}
        <div className="form-row">
          <div className="form-group">
            <label>Resultado Obtido</label>
            <textarea
              rows={3}
              placeholder="Descreva o resultado observado durante o teste..."
              value={c.obtainedResult}
              onChange={(e) => update((d) => { d.obtainedResult = e.target.value; })}
            />
          </div>
          <div className="form-group form-group-sm" style={{ minWidth: 150, maxWidth: 180 }}>
            <label>Status do Teste</label>
            <div className="status-select-wrap">
              <div className="status-select-icon" style={{ background: statusColor(c.status) }} />
              <select
                className="status-select"
                value={c.status}
                onChange={(e) => update((d) => { d.status = e.target.value as Status; })}
              >
                <option value="pending">⏳ Pendente</option>
                <option value="approved">✅ Aprovado</option>
                <option value="rejected">❌ Reprovado</option>
                <option value="partial">⚠️ Parcial</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
