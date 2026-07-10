/* ═══════════════════════════════════════════════════════════
   exporters.ts — Export PDF & DOCX

   O PDF é gerado capturando o DOM do preview (#document-preview)
   com html2canvas. O documento é paginado por blocos: agrupa blocos
   inteiros (header, cada critério, status final, footer) até o limite
   de altura de cada página e quebra SEMPRE na borda de um bloco —
   nunca no meio de um critério. Mantém scale 2 (texto legível) e cada
   página é capturada à parte, evitando o limite de canvas do navegador.
   Espelha o app legado (painel - Copia/js/export.js), que usa o mesmo
   html2canvas 1.4.1, mesmo CSS e mesmo HTML.
   ═══════════════════════════════════════════════════════════ */
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
} from 'docx';
import { showToast } from './toast';
import { showLoading, hideLoading } from './loading';
import { formatDateForFilename, stripBold } from './utils';
import type { Report, Status } from '../types';

/* Serializa todas as regras CSS legíveis da página (folhas same-origin e
   <style> injetados pelo Vite, incluindo adoptedStyleSheets). Folhas
   cross-origin — ex.: Google Fonts — lançam ao acessar cssRules e são puladas. */
function collectPageCss(): string {
  let css = '';
  const sheets: CSSStyleSheet[] = [
    ...Array.from(document.styleSheets) as CSSStyleSheet[],
    ...((document as unknown as { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets || []),
  ];
  for (const sheet of sheets) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      rules = null; // folha cross-origin sem CORS — pula
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      css += rule.cssText + '\n';
    }
  }
  return css;
}

/* ══════════════════════════════
   PDF EXPORT — página contínua única (igual ao preview)

   Em vez de capturar o preview ao vivo (onde a entrega de CSS do Vite e as
   media-queries do app confundem o html2canvas, gerando PDF sem estilo /
   vazio), recriamos o documento num IFRAME isolado e autossuficiente: HTML
   do doc + TODO o CSS embutido inline + largura desktop fixa. Determinístico
   e independente de como o Vite serve o CSS. Captura com html2canvas.
   ══════════════════════════════ */
export async function exportPDF(report: Report): Promise<void> {
  showLoading('Capturando documento...');

  let iframe: HTMLIFrameElement | null = null;

  try {
    const source = document.getElementById('document-preview');
    if (!source) throw new Error('Preview não encontrado');

    // Remove loading="lazy" das imagens: no iframe offscreen, imagens lazy
    // abaixo da dobra nunca carregam, e a altura do documento (scrollHeight)
    // é medida MENOR que a real — o que fazia o html2canvas cortar as seções
    // finais (Dados Adicionais, Status Final) em relatórios longos.
    const docHtml = source.innerHTML.replace(/\sloading=(["'])lazy\1/gi, '');
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    const css = collectPageCss();

    // Iframe offscreen, largura de desktop (≥1100) p/ não disparar media-queries mobile.
    iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    Object.assign(iframe.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: '1280px',
      height: '800px',
      border: '0',
      background: 'transparent',
    });
    document.body.appendChild(iframe);

    const idoc = iframe.contentDocument;
    if (!idoc) throw new Error('Falha ao criar o documento de exportação');

    idoc.open();
    idoc.write(
      `<!DOCTYPE html><html data-theme="${theme}"><head><meta charset="utf-8">` +
        // <base> p/ resolver URLs relativas (ex.: logo padrão) contra a origem real.
        `<base href="${document.baseURI}">` +
        `<link rel="preconnect" href="https://fonts.googleapis.com">` +
        `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">` +
        `<style>${css}</style>` +
        `<style>html,body{margin:0;padding:0;background:transparent;overflow:visible;height:auto}` +
        `#pdf-export-doc{margin:0}</style>` +
        `</head><body><div class="document" id="pdf-export-doc">${docHtml}</div></body></html>`,
    );
    idoc.close();

    const target = idoc.getElementById('pdf-export-doc');
    if (!target) throw new Error('Falha ao montar o documento de exportação');

    // Espera fontes do iframe.
    try {
      await idoc.fonts?.ready;
    } catch {
      /* fonts.ready indisponível — segue */
    }

    // Espera todas as imagens (logo + prints) carregarem.
    const imgs = Array.from(target.querySelectorAll('img'));
    await Promise.all(
      imgs.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 4000);
          const done = () => {
            clearTimeout(t);
            resolve();
          };
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        });
      }),
    );

    // Deixa o layout assentar.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => setTimeout(r, 80));

    showLoading('Gerando PDF...');

    const bg = idoc.defaultView?.getComputedStyle(target).backgroundColor || '#FFFFFF';

    const pxToMm = 25.4 / 96;
    const docWidth = target.scrollWidth;

    /* Captura BLOCO A BLOCO em escala cheia + composição das páginas.

       O documento é uma lista de blocos de topo (.doc-header, uma .doc-section
       por critério, .doc-footer). Capturamos CADA bloco isolado (o html2canvas
       processa só a subárvore daquele bloco — clona só as imagens dele, então a
       memória não estoura mesmo com centenas de imagens e nenhuma imagem some).
       Cada peça é capturada na escala cheia (baseScale = 2 → sem perda de
       qualidade); um bloco mais alto que uma página é FATIADO em escala cheia.

       As peças fluem de forma contínua em páginas de altura FIXA (todas iguais),
       preservando a posição horizontal (margens laterais iguais ao preview) e um
       respiro entre blocos. Captura e composição são feitas peça a peça
       (streaming) → só 1 página + 1 peça na memória de cada vez.

       Limites de canvas seguros p/ todos os navegadores de desktop (o mais
       restrito é o Firefox: ~11.180 px/lado e ~124 MP). Respeitamos dimensão e
       área — só geram mais páginas, nunca reduzem a qualidade. */
    const baseScale = 2;
    const SAFE_DIM = 10000;
    const SAFE_AREA = 100_000_000;
    const pageWdev = Math.round(docWidth * baseScale);                 // largura da página (device px)
    const maxPageDev = Math.min(SAFE_DIM, Math.floor(SAFE_AREA / Math.max(1, pageWdev))); // altura máx. (device px)
    const sliceCapCss = Math.max(1, Math.floor(maxPageDev / baseScale)); // altura máx. de captura (px CSS)
    const pageWidthMm = pageWdev * pxToMm;

    // TODAS as páginas têm a MESMA altura fixa (H) e o conteúdo FLUI de forma
    // contínua: as peças preenchem a página e, quando passam da borda, continuam
    // na próxima — sem espaço vazio no meio/fim das páginas (só o fundo no
    // restante da última). Capturamos e compomos peça a peça (streaming), então
    // só mantemos 1 página + 1 peça na memória de cada vez.
    const H = maxPageDev;
    const gapDev = Math.round(16 * baseScale); // espaçamento entre blocos (~16px CSS)

    const blockEls = (Array.from(target.children) as HTMLElement[]).filter(
      (b) => b.getBoundingClientRect().height > 0.5,
    );
    const els = blockEls.length ? blockEls : [target];

    const pdfRef: { pdf: jsPDF | null } = { pdf: null };
    let pageCanvas = document.createElement('canvas');
    let ctx: CanvasRenderingContext2D | null = null;
    let pageY = 0;

    const startPage = () => {
      pageCanvas = document.createElement('canvas');
      pageCanvas.width = pageWdev;
      pageCanvas.height = H;
      ctx = pageCanvas.getContext('2d');
      if (ctx) { ctx.fillStyle = bg; ctx.fillRect(0, 0, pageWdev, H); }
      pageY = 0;
    };
    // Emite a página. Páginas cheias usam altura H; a ÚLTIMA pode passar
    // `devHeight` < H para sair só do tamanho do conteúdo (sem espaço vazio).
    const emitPage = async (devHeight: number = H) => {
      let src = pageCanvas;
      if (devHeight < H) {
        const trimmed = document.createElement('canvas');
        trimmed.width = pageWdev;
        trimmed.height = Math.max(1, Math.round(devHeight));
        trimmed.getContext('2d')?.drawImage(pageCanvas, 0, 0); // recorta o topo
        src = trimmed;
      }
      const ph = pageWidthMm * (src.height / src.width);
      const ori: 'landscape' | 'portrait' = pageWidthMm > ph ? 'landscape' : 'portrait';
      const imgData = src.toDataURL('image/jpeg', 0.95);
      if (!pdfRef.pdf) pdfRef.pdf = new jsPDF({ orientation: ori, unit: 'mm', format: [pageWidthMm, ph], compress: true });
      else pdfRef.pdf.addPage([pageWidthMm, ph], ori);
      pdfRef.pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, ph, undefined, 'FAST');
      pageCanvas.width = 0; pageCanvas.height = 0;
      if (src !== pageCanvas) { src.width = 0; src.height = 0; }
      await new Promise((r) => setTimeout(r, 0));
    };
    // Desenha uma peça (canvas) no fluxo, quebrando entre páginas quando preciso.
    const place = async (c: HTMLCanvasElement, xDev: number) => {
      let srcY = 0;
      while (srcY < c.height) {
        const take = Math.min(H - pageY, c.height - srcY);
        ctx?.drawImage(c, 0, srcY, c.width, take, xDev, pageY, c.width, take);
        srcY += take;
        pageY += take;
        if (pageY >= H) { await emitPage(); startPage(); }
      }
    };

    startPage();
    const targetRect = target.getBoundingClientRect();
    for (let i = 0; i < els.length; i++) {
      showLoading(els.length > 1 ? `Gerando PDF... (${i + 1}/${els.length})` : 'Gerando PDF...');
      const b = els[i];
      const rect = b.getBoundingClientRect();
      const xDev = Math.round((rect.left - targetRect.left) * baseScale);
      const bwCss = Math.ceil(b.scrollWidth || rect.width);
      const bhCss = Math.ceil(rect.height);

      // Espaçamento entre blocos (preserva o respiro do preview), só no meio da página.
      if (i > 0 && pageY > 0) {
        pageY = Math.min(H, pageY + gapDev);
        if (pageY >= H) { await emitPage(); startPage(); }
      }

      if (bhCss <= sliceCapCss) {
        const c = await html2canvas(b, {
          scale: baseScale, useCORS: true, allowTaint: true, backgroundColor: null,
          logging: false, windowWidth: docWidth,
        });
        await place(c, xDev);
        c.width = 0; c.height = 0;
      } else {
        // Bloco mais alto que uma página → fatia em escala cheia e flui.
        for (let y = 0; y < bhCss; y += sliceCapCss) {
          const hCss = Math.min(sliceCapCss, bhCss - y);
          const c = await html2canvas(b, {
            scale: baseScale, useCORS: true, allowTaint: true, backgroundColor: null,
            logging: false, width: bwCss, height: hCss, x: 0, y, windowWidth: docWidth, windowHeight: bhCss,
          });
          await place(c, xDev);
          c.width = 0; c.height = 0;
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    // Última página: sai só do tamanho do conteúdo (sem espaço vazio embaixo).
    if (pageY > 0) await emitPage(pageY);

    if (!pdfRef.pdf) throw new Error('Falha ao renderizar o documento');

    const storyId = stripBold(report?.story?.id) || 'relatorio';
    pdfRef.pdf.save(`${storyId}_${formatDateForFilename()}.pdf`);

    showToast('PDF exportado com sucesso!', 'success');
  } catch (err) {
    console.error('PDF export error:', err);
    showToast('Erro ao gerar PDF: ' + (err as Error).message, 'error');
  } finally {
    if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    hideLoading();
  }
}

/* ══════════════════════════════
   DOCX EXPORT
   ══════════════════════════════ */
export async function exportDOCX(report: Report): Promise<void> {
  showLoading('Gerando DOCX...');

  try {
    if (!report) throw new Error('Nenhum relatório carregado');

    const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const allNoBorders = {
      top: noBorder,
      bottom: noBorder,
      left: noBorder,
      right: noBorder,
      insideHorizontal: noBorder,
      insideVertical: noBorder,
    };
    const cellNoBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

    const children: (Paragraph | Table)[] = [];

    /* ── Helpers ── */
    const spacer = (lines = 1): Paragraph[] =>
      Array.from(
        { length: lines },
        () => new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun('')] }),
      );

    const divider = (): Paragraph =>
      new Paragraph({
        spacing: { before: 80, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 4 } },
        children: [],
      });

    const sectionHeader = (text: string, bgColor = '6366F1'): Table =>
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: allNoBorders,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: bgColor, type: ShadingType.SOLID, color: 'auto' },
                borders: cellNoBorders,
                margins: { top: 100, bottom: 100, left: 180, right: 180 },
                children: [
                  new Paragraph({
                    spacing: { before: 0, after: 0 },
                    children: [new TextRun({ text, bold: true, size: 24, color: 'FFFFFF', font: 'Calibri' })],
                  }),
                ],
              }),
            ],
          }),
        ],
      });

    const statusBadge = (text: string, bgColor: string): Table =>
      new Table({
        width: { size: 40, type: WidthType.PERCENTAGE },
        borders: allNoBorders,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: bgColor, type: ShadingType.SOLID, color: 'auto' },
                borders: cellNoBorders,
                margins: { top: 80, bottom: 80, left: 200, right: 200 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 0, after: 0 },
                    children: [new TextRun({ text, bold: true, size: 24, color: 'FFFFFF', font: 'Calibri' })],
                  }),
                ],
              }),
            ],
          }),
        ],
      });

    const clean = (v: unknown): string =>
      (v || '—')
        .toString()
        .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
        .replace(/[✅❌⚠⏳️]/g, '');

    const labeledPara = (label: string, value: unknown): Paragraph =>
      new Paragraph({
        spacing: { before: 80, after: 40 },
        children: [
          new TextRun({ text: label + ': ', bold: true, size: 22, font: 'Calibri' }),
          new TextRun({ text: clean(value), size: 22, font: 'Calibri' }),
        ],
      });

    const bodyPara = (text: unknown, opts: { bold?: boolean; italics?: boolean } = {}): Paragraph =>
      new Paragraph({
        spacing: { before: 60, after: 60 },
        children: [new TextRun({ text: clean(text), size: 22, font: 'Calibri', ...opts })],
      });

    /* ════════════════ TÍTULO ════════════════ */
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: allNoBorders,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: '1E1B4B', type: ShadingType.SOLID, color: 'auto' },
                borders: cellNoBorders,
                margins: { top: 300, bottom: 300, left: 400, right: 400 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 0, after: 80 },
                    children: [
                      new TextRun({
                        text: clean(report.company?.name) || 'Empresa',
                        bold: true,
                        size: 28,
                        color: 'A5B4FC',
                        font: 'Calibri',
                      }),
                    ],
                  }),
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 0, after: 0 },
                    children: [
                      new TextRun({
                        text: 'Evidencia de Teste — Criterios de Aceite',
                        bold: true,
                        size: 36,
                        color: 'FFFFFF',
                        font: 'Calibri',
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    );
    children.push(...spacer(1));

    /* ════════════════ USER STORY ════════════════ */
    children.push(sectionHeader('INFORMACOES DA USER STORY'));
    children.push(...spacer(1));
    children.push(labeledPara('ID', stripBold(report.story?.id)));
    children.push(labeledPara('Titulo', stripBold(report.story?.title)));
    if (report.story?.description) {
      children.push(labeledPara('Descricao', report.story.description));
    }
    children.push(labeledPara('Sistema', report.story?.system));
    children.push(labeledPara('Modulo', report.story?.module));
    children.push(labeledPara('Sprint', report.story?.sprint));
    children.push(labeledPara('Ambiente', report.story?.environment));

    /* Criteria summary */
    const criteria = report.criteria || [];
    if (criteria.length > 0) {
      children.push(...spacer(1));
      children.push(bodyPara('Criterios de Aceite:', { bold: true }));
      criteria.forEach((c, idx) => {
        children.push(bodyPara(`  ${idx + 1}. ${stripBold(c.title) || '(sem titulo)'}`));
      });
    }

    /* ════════════════ CRITERIOS ════════════════ */
    const statusColors: Record<Status, string> = {
      approved: '16A34A',
      rejected: 'DC2626',
      partial: 'D97706',
      pending: '6B7280',
    };
    const statusLabels: Record<Status, string> = {
      approved: 'APROVADO',
      rejected: 'REPROVADO',
      partial: 'PARCIAL',
      pending: 'PENDENTE',
    };

    for (let i = 0; i < criteria.length; i++) {
      const c = criteria[i];
      children.push(...spacer(1));
      children.push(divider());

      const sBg = statusColors[c.status] || '6B7280';

      children.push(sectionHeader(`CRITERIO DE ACEITE ${i + 1} — ${statusLabels[c.status] || 'PENDENTE'}`, sBg));
      children.push(...spacer(1));

      children.push(labeledPara('Criterio', c.title));
      if (c.description) children.push(labeledPara('Descricao', c.description));
      if (c.expectedResult) children.push(labeledPara('Resultado Esperado', c.expectedResult));

      const steps = (c.steps || []).filter((s) => s.text && s.text.trim());
      if (steps.length > 0) {
        children.push(...spacer(1));
        children.push(bodyPara('Passo a Passo:', { bold: true }));
        steps.forEach((s, idx) => children.push(bodyPara(`  ${idx + 1}. ${s.text}`)));
      }

      if ((c.images || []).length > 0) {
        children.push(...spacer(1));
        children.push(
          new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [
              new TextRun({
                text: `[${c.images.length} imagem(ns) anexada(s) — consultar exportacao PDF]`,
                italics: true,
                color: '9CA3AF',
                size: 20,
                font: 'Calibri',
              }),
            ],
          }),
        );
      }

      if (c.obtainedResult) {
        children.push(...spacer(1));
        children.push(bodyPara('Resultado Obtido:', { bold: true }));
        children.push(bodyPara(c.obtainedResult));
      }

      children.push(...spacer(1));
      children.push(statusBadge('STATUS: ' + (statusLabels[c.status] || 'PENDENTE'), sBg));
    }

    /* ════════════════ DADOS ADICIONAIS ════════════════ */
    const ad = report.additionalData || ({} as Report['additionalData']);
    children.push(...spacer(1));
    children.push(divider());
    children.push(sectionHeader('DADOS ADICIONAIS', '374151'));
    children.push(...spacer(1));

    const dateStr = ad.testDate
      ? new Date(ad.testDate + 'T12:00:00').toLocaleDateString('pt-BR')
      : '—';
    children.push(labeledPara('Data do Teste', dateStr));
    children.push(labeledPara('Responsavel pelo Teste', ad.responsible));
    children.push(labeledPara('Sprint', report.story?.sprint));
    children.push(labeledPara('Ambiente', report.story?.environment));
    if (ad.versionBko) children.push(labeledPara('Versao do Backoffice', ad.versionBko));
    if (ad.versionPortal) children.push(labeledPara('Versao do Portal B2B', ad.versionPortal));

    if (ad.notes) {
      children.push(...spacer(1));
      children.push(bodyPara('Observacoes:', { bold: true }));
      children.push(bodyPara(ad.notes, { italics: true }));
    }

    /* ════════════════ STATUS FINAL ════════════════ */
    const fs = report.finalStatus || 'pending';

    children.push(...spacer(1));
    children.push(divider());
    children.push(sectionHeader('STATUS FINAL DO TESTE', statusColors[fs] || '6B7280'));
    children.push(...spacer(1));
    children.push(
      new Table({
        width: { size: 50, type: WidthType.PERCENTAGE },
        borders: allNoBorders,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: statusColors[fs] || '6B7280', type: ShadingType.SOLID, color: 'auto' },
                borders: cellNoBorders,
                margins: { top: 160, bottom: 160, left: 400, right: 400 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 0, after: 0 },
                    children: [
                      new TextRun({
                        text: statusLabels[fs] || 'PENDENTE',
                        bold: true,
                        size: 36,
                        color: 'FFFFFF',
                        font: 'Calibri',
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    );

    /* ════════════════ BUILD ════════════════ */
    const wordDoc = new Document({
      creator: clean(report.company?.name) || 'QA Reporter',
      description: 'Evidencia de Teste - Criterios de Aceite',
      title: stripBold(`${report.story?.id || ''} ${report.story?.title || ''}`.trim()),
      styles: {
        default: {
          document: { run: { font: 'Calibri', size: 22, color: '111827' } },
        },
      },
      sections: [
        { properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } }, children },
      ],
    });

    const blob = await Packer.toBlob(wordDoc);
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    const fname = `${stripBold(report.story?.id) || 'relatorio'}_${formatDateForFilename()}.docx`;
    a.href = url;
    a.download = fname;
    a.click();
    URL.revokeObjectURL(url);

    showToast('DOCX exportado com sucesso!', 'success');
  } catch (err) {
    console.error('DOCX export error:', err);
    showToast('Erro ao gerar DOCX: ' + (err as Error).message, 'error');
  } finally {
    hideLoading();
  }
}
