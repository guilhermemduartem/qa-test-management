/* ═══════════════════════════════════════════════════════════
   reportEngine.ts — Montagem do HTML do documento (preview/PDF)

   ⚠️ PORTA VERBATIM de app.js:buildDocumentHTML/buildStatusBadge/
   buildStatusBlock. Não alterar a saída HTML: o PDF é gerado a
   partir da captura deste HTML pelo html2canvas. Qualquer mudança
   aqui altera o PDF final. Ver SECURITY/relatórios no plano.
   ═══════════════════════════════════════════════════════════ */
import { escapeHtml, nl2brBold, getCompanyLogoUrl } from './utils';
import type { Report, Status } from '../types';

export function buildStatusBadge(status: Status): string {
  const map: Record<Status, { label: string; cls: string }> = {
    approved: { label: '✅ Aprovado', cls: 'approved' },
    rejected: { label: '❌ Reprovado', cls: 'rejected' },
    partial: { label: '⚠️ Parcial', cls: 'partial' },
    pending: { label: '⏳ Pendente', cls: 'pending' },
  };
  const s = map[status] || map.pending;
  return `<span class="status-pill ${s.cls}">${s.label}</span>`;
}

export function buildStatusBlock(status: Status): string {
  const map: Record<Status, { icon: string; label: string; cls: string }> = {
    approved: { icon: '✅', label: 'APROVADO', cls: 'approved' },
    rejected: { icon: '❌', label: 'REPROVADO', cls: 'rejected' },
    partial: { icon: '⚠️', label: 'PARCIAL', cls: 'partial' },
    pending: { icon: '⏳', label: 'PENDENTE', cls: 'pending' },
  };
  const s = map[status] || map.pending;
  return `<div class="doc-status-wrap ${s.cls}">
    <div class="doc-status-icon">${s.icon}</div>
    <div class="doc-status-text">Status do Teste: ${s.label}</div>
  </div>`;
}

export function hasReportContent(r: Report): boolean {
  return Boolean(
    r.company?.name ||
      r.company?.logoUrl ||
      r.story?.id ||
      r.story?.title ||
      r.story?.description ||
      r.story?.system ||
      r.story?.module ||
      r.story?.sprint ||
      r.story?.environment ||
      r.criteria?.length > 0 ||
      r.additionalData?.responsible ||
      r.additionalData?.versionBko ||
      r.additionalData?.versionPortal ||
      r.additionalData?.notes,
  );
}

export function buildDocumentHTML(r: Report): string {
  const s = r.story;
  const ad = r.additionalData || ({} as Report['additionalData']);
  const company = r.company || ({} as Report['company']);
  // Logo do relatório (logo explícita ou a padrão Miketec, via getCompanyLogoUrl).
  const companyLogoUrl = getCompanyLogoUrl(r);

  let html = '';

  /* ── Header ── */
  html += `<div class="doc-header">`;
  if (companyLogoUrl) {
    html += `<img src="${companyLogoUrl}" class="doc-company-logo" alt="Logo" />`;
  }
  if (company.name) {
    html += `<div class="doc-company-name">${nl2brBold(company.name)}</div>`;
  }
  html += `<div class="doc-title">Evidência de Teste</div>`;
  html += `<div class="doc-subtitle">Critérios de Aceite${s.id ? ' — ' + nl2brBold(s.id) : ''}</div>`;
  html += `</div>`;

  /* ── User Story ── */
  if (s.id || s.title || s.system) {
    html += `<div class="doc-section">`;
    html += `<div class="doc-section-title">📌 Informações da User Story</div>`;
    html += `<div class="doc-info-grid">`;

    const infoFields: [string, string][] = [
      ['ID da US', s.id],
      ['Título', s.title],
      ['Sistema', s.system],
      ['Módulo', s.module],
      ['Sprint', s.sprint],
      ['Ambiente', s.environment],
    ];

    infoFields.forEach(([label, val]) => {
      if (!val) return;
      html += `<div class="doc-info-cell" style="border-bottom:1px solid var(--doc-border);padding:8px 12px;display:flex;gap:8px;align-items:flex-start">
        <span class="doc-info-label">${escapeHtml(label)}</span>
        <span class="doc-info-value">${nl2brBold(val)}</span>
      </div>`;
    });

    html += `</div>`;

    if (s.description) {
      html += `<div class="doc-description">${nl2brBold(s.description)}</div>`;
    }

    /* Criteria summary list */
    if ((r.criteria || []).length > 0) {
      html += `<div style="margin-top:14px">`;
      html += `<div class="doc-meta-label" style="margin-bottom:8px">Critérios de Aceite</div>`;
      html += `<ol style="padding-left:0;list-style:none;display:flex;flex-direction:column;gap:6px">`;
      r.criteria.forEach((c, idx) => {
        html += `<li style="display:flex;align-items:flex-start;gap:10px;font-size:12px;color:var(--doc-text);line-height:1.5">`;
        html += `<div style="width:20px;height:20px;background:var(--accent);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:white;flex-shrink:0">${idx + 1}</div>`;
        html += `<span>${nl2brBold(c.title) || '(sem título)'}</span>`;
        html += `</li>`;
      });
      html += `</ol></div>`;
    }

    html += `</div>`;
  }

  /* ── Criteria ── */
  (r.criteria || []).forEach((c, idx) => {
    html += `<div class="doc-section">`;
    html += `<div class="doc-section-title">✅ Evidência do Critério de Aceite ${idx + 1}</div>`;
    html += `<div class="doc-criterion">`;

    /* Criterion header */
    html += `<div class="doc-criterion-header">
      <div class="doc-criterion-num">${idx + 1}</div>
      <div class="doc-criterion-title">${nl2brBold(c.title) || 'Critério sem título'}</div>
      ${buildStatusBadge(c.status)}
    </div>`;

    html += `<div class="doc-criterion-body">`;

    /* Meta */
    if (c.description || c.expectedResult) {
      html += `<div class="doc-criterion-meta">`;
      if (c.description) {
        html += `<div class="doc-meta-block">
          <div class="doc-meta-label">Descrição</div>
          <div class="doc-meta-value">${nl2brBold(c.description)}</div>
        </div>`;
      }
      if (c.expectedResult) {
        html += `<div class="doc-meta-block">
          <div class="doc-meta-label">Resultado Esperado</div>
          <div class="doc-meta-value">${nl2brBold(c.expectedResult)}</div>
        </div>`;
      }
      html += `</div>`;
    }

    /* Steps */
    const steps = (c.steps || []).filter((st) => st.text.trim());
    if (steps.length > 0) {
      html += `<div>
        <div class="doc-meta-label" style="margin-bottom:8px">Passo a Passo</div>
        <ol class="doc-steps-list">
          ${steps
            .map(
              (st, si) => `
            <li class="doc-step-item">
              <div class="doc-step-num">${si + 1}</div>
              <span>${nl2brBold(st.text)}</span>
            </li>`,
            )
            .join('')}
        </ol>
      </div>`;
    }

    /* Images */
    const validImages = (c.images || []).filter(
      (img) => typeof img?.dataUrl === 'string' && img.dataUrl.trim() !== '',
    );
    if (validImages.length > 0) {
      html += `<div>
        <div class="doc-meta-label" style="margin-bottom:8px">Prints de Tela</div>
        <div class="doc-images-grid">
          ${validImages
            .map(
              (img) => `
            <div class="doc-image-item">
              <img src="${img.dataUrl}" alt="${escapeHtml(img.name)}" loading="lazy" />
              <div class="doc-image-caption">${escapeHtml(img.name)}</div>
            </div>`,
            )
            .join('')}
        </div>
      </div>`;
    }

    /* Obtained result */
    if (c.obtainedResult) {
      html += `<div>
        <div class="doc-meta-label" style="margin-bottom:6px">Resultado Obtido</div>
        <div class="doc-meta-value">${nl2brBold(c.obtainedResult)}</div>
      </div>`;
    }

    /* Status */
    html += buildStatusBlock(c.status);

    html += `</div></div></div>`; // body, criterion, section
  });

  /* ── Additional Data ── */
  if (ad.responsible || ad.testDate || ad.versionBko || ad.versionPortal || s.sprint) {
    html += `<div class="doc-section">`;
    html += `<div class="doc-section-title">📅 Dados Adicionais</div>`;
    html += `<div class="doc-additional-grid" style="grid-template-columns:repeat(2,1fr)">`;

    const addCells: [string, string | null][] = [
      ['Data do Teste', ad.testDate ? new Date(ad.testDate + 'T12:00:00').toLocaleDateString('pt-BR') : null],
      ['Ambiente', s.environment],
      ['Responsável pelo Teste', ad.responsible],
      ['Sprint', s.sprint],
      ['Versão do Backoffice', ad.versionBko],
      ['Versão do Portal B2B', ad.versionPortal],
    ];

    addCells.forEach(([label, val]) => {
      html += `<div class="doc-additional-cell">
        <div class="doc-additional-label">${escapeHtml(label)}</div>
        <div class="doc-additional-value">${nl2brBold(val) || '—'}</div>
      </div>`;
    });

    html += `</div></div>`;
  }

  /* ── Notes ── */
  if (ad.notes) {
    html += `<div class="doc-section">
      <div class="doc-section-title">📝 Observações</div>
      <div class="doc-notes">${nl2brBold(ad.notes)}</div>
    </div>`;
  }

  /* ── Status Final ── */
  const fs = r.finalStatus || 'pending';
  const fsMap: Record<Status, { icon: string; label: string; cls: string }> = {
    approved: { icon: '✅', label: 'APROVADO', cls: 'approved' },
    rejected: { icon: '❌', label: 'REPROVADO', cls: 'rejected' },
    partial: { icon: '⚠️', label: 'PARCIAL', cls: 'partial' },
    pending: { icon: '⏳', label: 'PENDENTE', cls: 'pending' },
  };
  const fsData = fsMap[fs] || fsMap.pending;
  html += `<div class="doc-section">
    <div class="doc-section-title">🏁 Status Final do Teste</div>
    <div class="doc-status-wrap ${fsData.cls}" style="padding:14px 18px;border-radius:var(--radius-md);">
      <div class="doc-status-icon" style="font-size:22px">${fsData.icon}</div>
      <div>
        <div class="doc-status-text" style="font-size:16px">${fsData.label}</div>
      </div>
    </div>
  </div>`;

  /* ── Footer ── */
  html += `<div class="doc-footer">
    <span>${company.name ? escapeHtml(company.name) + ' · ' : ''}Evidência de Teste</span>
    <span>Gerado em ${new Date().toLocaleDateString('pt-BR')}</span>
  </div>`;

  return html;
}
