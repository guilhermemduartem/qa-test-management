/* ═══════════════════════════════════════════════════════════
   DocumentPreview — renderiza o HTML do reportEngine via
   dangerouslySetInnerHTML, mantendo os MESMOS ids/estrutura
   (#preview-scroll, #document-wrapper, #document-preview) que
   o exportPDF (exporters.ts) espera para capturar com html2canvas.
   ═══════════════════════════════════════════════════════════ */
import { useMemo, useState } from 'react';
import { buildDocumentHTML, hasReportContent } from '../lib/reportEngine';
import type { Report } from '../types';

const PLACEHOLDER = `
  <div class="doc-placeholder">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
    <h3>Seu relatório aparecerá aqui</h3>
    <p>Comece preenchendo as informações da User Story no formulário ao lado.</p>
  </div>`;

export function DocumentPreview({ report, active = true }: { report: Report; active?: boolean }) {
  const [zoom, setZoom] = useState(100);

  const html = useMemo(
    () => (hasReportContent(report) ? buildDocumentHTML(report) : PLACEHOLDER),
    [report],
  );

  const adjustZoom = (delta: number) => {
    setZoom((z) => (delta === 0 ? 100 : Math.max(40, Math.min(200, z + delta))));
  };

  return (
    <div className={`panel preview-panel${active ? ' active' : ''}`} id="preview-panel">
      <div className="preview-header">
        <span className="preview-label">Preview em tempo real</span>
        <div className="preview-zoom">
          <button className="btn-icon btn-icon-sm" onClick={() => adjustZoom(-10)} title="Diminuir zoom">−</button>
          <span id="zoom-display">{zoom}%</span>
          <button className="btn-icon btn-icon-sm" onClick={() => adjustZoom(10)} title="Aumentar zoom">+</button>
          <button className="btn-icon btn-icon-sm" onClick={() => adjustZoom(0)} title="Reset zoom" style={{ fontSize: 10 }}>↺</button>
        </div>
      </div>
      <div className="preview-scroll" id="preview-scroll">
        <div className="document-wrapper" id="document-wrapper" style={{ transform: `scale(${zoom / 100})` }}>
          <div className="document" id="document-preview" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}
