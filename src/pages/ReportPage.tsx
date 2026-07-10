/* ═══════════════════════════════════════════════════════════
   ReportPage — gerador de relatórios (porta de index.html + app.js).
   ═══════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate, useBlocker } from 'react-router-dom';
import { Sidebar, type ReportActions } from '../components/Sidebar';
import { DocumentPreview } from '../components/DocumentPreview';
import { CriterionCard } from '../components/CriterionCard';
import { Modal } from '../components/Modal';
import { useReport } from '../hooks/useReport';
import { useAuth } from '../context/AuthProvider';
import { cachedProfiles } from '../lib/auth';
import { exportPDF } from '../lib/exporters';
import { showToast } from '../lib/toast';
import { showLoading, hideLoading } from '../lib/loading';
import { generateId, getCompanyLogoUrl, statusColor, formatDate, stripBold } from '../lib/utils';
import {
  addToHistory,
  loadHistory,
  deleteFromHistory,
  clearHistory,
  loadTemplates,
  saveTemplates,
  addTemplate,
  deleteTemplate,
  syncTemplatesFromSupabase,
  syncTemplateListFromSupabase,
  fetchTemplateSnapshotFromSupabase,
  hydrateTemplateSnapshotImages,
  exportReportAsJSON,
  parseImportedJSON,
} from '../lib/storage';
import {
  createReportSession,
  buildSessionLink,
  isSharingAvailable,
} from '../lib/reportSession';
import type { Criterion, Report, Status, Template, HistoryEntry } from '../types';

const norm = (v: unknown) => String(v || '').trim().toLowerCase();

const STATUS_LABEL: Record<Status, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Reprovado',
  partial: 'Parcial',
};

/** Donut com a divisão de critérios por status (total no centro, tooltip por fatia). */
function CriteriaDonut({
  counts,
  total,
}: {
  counts?: Partial<Record<Status, number>> | null;
  total: number;
}) {
  const order: Status[] = ['pending', 'approved', 'rejected', 'partial'];
  const segs = order.map((s) => ({ s, n: counts?.[s] || 0 })).filter((x) => x.n > 0);
  const sum = segs.reduce((a, b) => a + b.n, 0) || total || 1;

  const size = 84;
  const stroke = 13;
  const c = size / 2;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="tpl-donut" role="img" aria-label={`${total} critério(s)`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle className="tpl-donut-track" cx={c} cy={c} r={r} fill="none" strokeWidth={stroke} />
        {segs.map((seg) => {
          const len = (seg.n / sum) * circ;
          const el = (
            <circle
              key={seg.s}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={statusColor(seg.s)}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${c} ${c})`}
            >
              <title>{`${STATUS_LABEL[seg.s]}: ${seg.n}`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="tpl-donut-center">
        <span className="tpl-donut-num">{total}</span>
        <span className="tpl-donut-lbl">critérios</span>
      </div>
    </div>
  );
}

type ModalState =
  | { type: 'saveTemplate'; name: string }
  | { type: 'loadTemplate' }
  | { type: 'history' }
  | { type: 'share'; link: string }
  | null;

/* Ctrl/Cmd+B → envolve a seleção do campo focado com **negrito**. Atualiza o
   estado controlado via setter nativo + evento 'input' (React captura o onChange). */
function wrapSelectionBold(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  const s = el.selectionStart, e = el.selectionEnd;
  if (s == null || e == null || s === e) return false;
  const v = el.value;
  const next = v.slice(0, s) + '**' + v.slice(s, e) + '**' + v.slice(e);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  requestAnimationFrame(() => { el.focus(); el.selectionStart = s + 2; el.selectionEnd = e + 2; });
  return true;
}

export function ReportPage() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  /* Negrito com Ctrl/Cmd+B em qualquer campo de texto do editor. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B'))) return;
      const el = document.activeElement;
      const editable = el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === 'text');
      if (!editable || (el as HTMLInputElement | HTMLTextAreaElement).readOnly) return;
      if (wrapSelectionBold(el as HTMLInputElement | HTMLTextAreaElement)) e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const {
    report,
    patch,
    replaceReport,
    saveNow,
    saveState,
    session: live,
  } = useReport(sessionId ?? null);
  const { session } = useAuth();
  const canWrite = session?.role !== 'viewer';

  // Em sessão compartilhada, o histórico/salvar pertence ao DONO (co-propriedade).
  const historyOwnerId = live.active ? live.ownerId ?? session?.id : session?.id;

  // O botão "Compartilhar" aparece quando o relatório já tem conteúdo de verdade
  // (e, portanto, já foi autossalvo). Relatório vazio não pode ser compartilhado.
  // Em sessão já ativa, não faz sentido recompartilhar.
  const hasContent = Boolean(report.story.id || report.story.title) || report.criteria.length > 0;
  const [sharing, setSharing] = useState(false);

  // Em sessão: salva o relatório como TEMPLATE na coleção do DONO (mesmo se quem
  // salva é colaborador), persiste a sessão ao vivo e avisa os participantes.
  const saveSessionTemplate = async () => {
    const name = buildTemplateNameFromStory();
    if (!name) {
      showToast('Preencha o ID e o Título da User Story para salvar.', 'warning');
      return;
    }
    const ownerName = live.ownerName ?? session?.nome ?? 'dono';
    const ownerId = live.ownerId ?? session?.id ?? null;
    showLoading('Salvando template...');
    try {
      await syncTemplatesFromSupabase().catch(() => {});
      saveNow(); // garante o push do snapshot atual da sessão ao vivo
      const saved = await addTemplate(name, report, { id: ownerId });
      if (!saved) {
        showToast('Falha ao salvar o template. Tente novamente.', 'error');
        return;
      }
      showToast(
        live.isOwner ? 'Template salvo nos seus templates.' : `Salvo nos templates de ${ownerName}.`,
        'success',
      );
      live.notifySaved({
        byId: session?.id ?? '',
        byName: session?.nome ?? 'Um colaborador',
        ownerName,
      });
    } finally {
      hideLoading();
    }
  };

  const markSaved = () => {
    if (live.active) {
      void saveSessionTemplate();
      return;
    }
    addToHistory(report, historyOwnerId);
    saveNow();
    showToast('Relatório salvo!', 'success');
  };
  const isQA = session?.role === 'qa';
  const isAdmin = session?.role === 'admin' || session?.role === 'master_admin';

  const [tab, setTab] = useState<'form' | 'preview'>('form');
  const [modal, setModal] = useState<ModalState>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateQuery, setTemplateQuery] = useState('');
  const [selectedFolderKey, setSelectedFolderKey] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyQuery, setHistoryQuery] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
  } | null>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  /* ── Controle de "alterações não salvas no template" ── */
  // Guarda o snapshot do relatório na última vez que um template foi salvo/carregado.
  const savedReportRef = useRef<string>(JSON.stringify(report));
  const markTemplateSaved = (r: Report) => { savedReportRef.current = JSON.stringify(r); };
  const isDirty = JSON.stringify(report) !== savedReportRef.current;

  // Bloqueia navegação interna (trocar de menu/rota) quando há alterações.
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  // Aviso nativo do browser para F5 / fechar aba.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Quando o blocker dispara, abre o modal de confirmação.
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    setConfirmDialog({
      title: 'Alterações não salvas',
      message: 'Você tem alterações que ainda não foram salvas como template. Se sair agora elas serão perdidas.',
      confirmLabel: 'Sair sem salvar',
      danger: true,
      onConfirm: () => blocker.proceed(),
      secondaryLabel: 'Salvar e sair',
      onSecondary: async () => {
        const ok = await persistTemplate(buildTemplateNameFromStory() || 'Template', { skipPrompt: true, forceUpdate: true });
        if (ok) blocker.proceed();
      },
    });
  }, [blocker.state]);

  /* ── Auto-carrega template do banco quando há ?t=<id> na URL (ex: após F5) ── */
  useEffect(() => {
    const tid = searchParams.get('t');
    if (!tid || !session) return;
    (async () => {
      showLoading('Carregando template salvo…');
      try {
        await syncTemplatesFromSupabase();
        const list = loadTemplates();
        const t = list.find((x) => x.id === tid);
        if (!t) {
          showToast('Template não encontrado no banco.', 'error');
          setSearchParams({}, { replace: true });
          return;
        }
        const snapshot = await fetchTemplateSnapshotFromSupabase(tid);
        if (snapshot) {
          t.snapshot = snapshot;
          saveTemplates(list);
        }
        if (!t.snapshot) {
          showToast('Template sem dados disponíveis.', 'error');
          return;
        }
        const hydrated = await hydrateTemplateSnapshotImages(t.snapshot);
        hydrated.id = generateId();
        replaceReport(hydrated);
        markTemplateSaved(hydrated);
      } finally {
        hideLoading();
      }
    })();
  }, [session?.id]);

  /* ── Helpers de mutação de campos ── */
  const setStory = (k: keyof Report['story'], v: string) => patch((d) => { d.story[k] = v; });
  const setCompany = (k: keyof Report['company'], v: string) => patch((d) => { d.company[k] = v; });
  const setAdd = (k: keyof Report['additionalData'], v: string) => patch((d) => { d.additionalData[k] = v; });
  const updateCriterion = (id: string, fn: (c: Criterion) => void) =>
    patch((d) => { const c = d.criteria.find((x) => x.id === id); if (c) fn(c); });

  /* ── Logo ── */
  const onLogoFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Selecione um arquivo de imagem válido.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setCompany('logoUrl', String(e.target?.result || ''));
    reader.readAsDataURL(file);
  };

  /* ── Critérios ── */
  const addCriterion = () => {
    patch((d) => {
      d.criteria.push({
        id: generateId(),
        title: '',
        description: '',
        expectedResult: '',
        steps: [{ id: generateId(), text: '' }],
        obtainedResult: '',
        status: 'pending',
        images: [],
        collapsed: false,
      });
    });
  };

  /* ── Topbar actions ── */
  // Com createHashRouter o hash é parte da URL — mantém ?new=1 no search real
  // para que initReport() o leia, e inclui o hash correto na mesma abertura.
  const newReport = () => window.open('/?new=1#/relatorio', '_blank');

  const duplicateReport = () => {
    const clone: Report = JSON.parse(JSON.stringify(report));
    clone.id = generateId();
    clone.createdAt = new Date().toISOString();
    clone.updatedAt = new Date().toISOString();
    clone.story.id = clone.story.id ? clone.story.id + '_cópia' : '';
    clone.story.title = clone.story.title ? clone.story.title + ' (cópia)' : 'Cópia';
    addToHistory(report, session?.id);
    replaceReport(clone);
    showToast('Relatório duplicado.', 'success');
  };

  /* ── Compartilhar sessão (colaboração em tempo real) ── */
  const shareCurrentReport = async () => {
    if (!session) return;
    if (sharing) return;
    setSharing(true);
    showLoading('Criando sessão compartilhada...');
    try {
      // Garante que o relatório esteja salvo no histórico antes de publicar.
      addToHistory(report, historyOwnerId);
      const id = await createReportSession(report, session);
      if (!id) {
        showToast('Não foi possível criar a sessão. Verifique sua conexão.', 'error');
        return;
      }
      const link = buildSessionLink(id);
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        /* clipboard pode falhar em http; o modal mostra o link mesmo assim */
      }
      // Abre a sessão ao vivo nesta aba; o modal traz o link para enviar ao colega.
      window.open(link, '_blank');
      setModal({ type: 'share', link });
      showToast('Sessão criada! Link copiado para a área de transferência.', 'success');
    } catch (err) {
      console.error('Falha ao compartilhar:', err);
      showToast('Falha ao criar a sessão compartilhada.', 'error');
    } finally {
      hideLoading();
      setSharing(false);
    }
  };

  const copySessionLink = async () => {
    const link = sessionId ? buildSessionLink(sessionId) : '';
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      showToast('Link copiado!', 'success');
    } catch {
      showToast('Não foi possível copiar. Copie da barra de endereços.', 'warning');
    }
  };

  /* ── JSON import/export ── */
  const onJSONFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = parseImportedJSON(String(e.target?.result || ''));
      if (!result.ok || !result.data) {
        showToast('Erro ao importar: ' + result.error, 'error');
      } else {
        addToHistory(report, session?.id);
        replaceReport(result.data);
        showToast('Relatório importado com sucesso!', 'success');
      }
    };
    reader.readAsText(file);
  };

  const exportJSON = async () => {
    await exportReportAsJSON(report);
    showToast('JSON exportado!', 'success');
  };

  /* ── Templates ── */
  const buildTemplateNameFromStory = () => {
    const id = String(report.story.id || '').trim();
    const title = String(report.story.title || '').trim();
    if (!id || !title) return '';
    return `${id} - ${title}`;
  };

  const findTemplateByCurrentStory = (list: Template[]) => {
    const sid = norm(report.story.id);
    const stitle = norm(report.story.title);
    if (!sid || !stitle) return null;
    // Apenas templates do próprio usuário podem ser "atualizados". Usar o de
    // outra pessoa e salvar gera um novo template na pasta de quem salvou.
    return (
      list.find(
        (t) =>
          (t.createdBy || null) === (session?.id || null) &&
          norm(t?.snapshot?.story?.id) === sid &&
          norm(t?.snapshot?.story?.title) === stitle,
      ) || null
    );
  };

  const persistTemplate = useCallback(
    async (name: string, opts: { skipPrompt?: boolean; forceUpdate?: boolean }): Promise<boolean> => {
      const autoName = buildTemplateNameFromStory();
      if (!autoName) {
        showToast('Preencha User Story ID e Título para salvar o template.', 'warning');
        return false;
      }
      const finalName = (autoName || name || '').trim();
      if (!finalName) {
        showToast('Informe um nome para o template.', 'warning');
        return false;
      }

      showLoading('Preparando template…');
      const start = Date.now();
      const minMs = 700;

      const existing = findTemplateByCurrentStory(loadTemplates());
      let saved: Template | null = null;
      try {
        await new Promise((r) => requestAnimationFrame(r));
        saved = await addTemplate(finalName, report, undefined, (msg) => showLoading(msg));
      } catch (err) {
        console.error('Falha ao salvar template:', err);
        showToast('Falha ao salvar template no banco. Verifique sua conexão e tente novamente.', 'error');
        const el = Date.now() - start;
        if (el < minMs) await new Promise((r) => setTimeout(r, minMs - el));
        hideLoading();
        return false;
      }

      if (!saved) {
        showToast('Nao foi possivel salvar o template agora. Tente novamente em instantes.', 'error');
        const el = Date.now() - start;
        if (el < minMs) await new Promise((r) => setTimeout(r, minMs - el));
        hideLoading();
        return false;
      }

      if (!opts.skipPrompt) setModal(null);
      if (opts.forceUpdate || existing) showToast(`Template "${finalName}" atualizado!`, 'success');
      else showToast(`Template "${finalName}" salvo!`, 'success');

      if (saved?.id) setSearchParams({ t: saved.id }, { replace: true });
      markTemplateSaved(report);

      const el = Date.now() - start;
      if (el < minMs) await new Promise((r) => setTimeout(r, minMs - el));
      hideLoading();
      return true;
    },
    [report],
  );

  const openSaveTemplate = async () => {
    await syncTemplatesFromSupabase();
    const existing = findTemplateByCurrentStory(loadTemplates());
    const autoName = buildTemplateNameFromStory();
    if (existing) {
      persistTemplate(autoName || existing.name, { skipPrompt: true, forceUpdate: true });
      return;
    }
    setModal({ type: 'saveTemplate', name: autoName });
  };

  const openLoadTemplate = async () => {
    showLoading('Carregando templates...');
    try {
      await syncTemplateListFromSupabase();
    } finally {
      hideLoading();
    }
    setTemplateQuery('');
    setSelectedFolderKey(null);
    setTemplates([...loadTemplates()]);
    setModal({ type: 'loadTemplate' });
  };

  const loadTemplateById = async (id: string) => {
    const list = loadTemplates();
    const t = list.find((x) => x.id === id);
    if (!t) return;

    const snapCriteria = Array.isArray(t?.snapshot?.criteria) ? t.snapshot!.criteria : [];
    const hasImageEntries = snapCriteria.some((c) => Array.isArray(c?.images) && c.images.length > 0);
    const hasEmbedded = snapCriteria.some(
      (c) => Array.isArray(c?.images) && c.images.some((img) => typeof img?.dataUrl === 'string' && img.dataUrl.trim()),
    );

    showLoading('Carregando template...');
    try {
      await new Promise((r) => requestAnimationFrame(r));
      const shouldFetch = !t.snapshot || (hasImageEntries && !hasEmbedded);
      if (shouldFetch) {
        const snapshot = await fetchTemplateSnapshotFromSupabase(id);
        if (snapshot) {
          t.snapshot = snapshot;
          saveTemplates(list);
        }
      }
      if (!t.snapshot) {
        showToast('Template sem snapshot disponível.', 'error');
        return;
      }
      addToHistory(report, session?.id);
      const hydrated = await hydrateTemplateSnapshotImages(t.snapshot);
      hydrated.id = generateId();
      replaceReport(hydrated);
      markTemplateSaved(hydrated);
      setModal(null);
      setSearchParams({ t: id }, { replace: true });
      showToast(`Template "${t.name}" carregado.`, 'success');
    } finally {
      hideLoading();
    }
  };

  // Usar template: se for de outra pessoa, avisa que será criada uma cópia
  // no nome do usuário atual antes de duplicar os dados para o editor.
  const useTemplate = (t: Template) => {
    const mine = !!t.createdBy && t.createdBy === session?.id;
    if (!mine) {
      setConfirmDialog({
        title: 'Criar cópia do template',
        message:
          `O template "${t.name}" é de outro usuário.\n\n` +
          'Ao usá-lo, será criada uma cópia no seu nome com os dados dele. ' +
          'Tudo o que você alterar (textos e imagens) afeta apenas a sua cópia — ' +
          'o template original do outro usuário não é modificado.',
        confirmLabel: 'Criar minha cópia',
        onConfirm: () => loadTemplateById(t.id),
      });
      return;
    }
    loadTemplateById(t.id);
  };

  // Dono pode excluir o próprio; admin pode excluir qualquer um.
  const canDeleteTemplate = (t: Template) => isAdmin || (!!t.createdBy && t.createdBy === session?.id);

  const removeTemplate = (t: Template) => {
    if (!canDeleteTemplate(t)) {
      showToast('Você só pode excluir seus próprios templates.', 'error');
      return;
    }
    setConfirmDialog({
      title: 'Excluir template',
      message: `Excluir o template "${t.name}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      danger: true,
      onConfirm: async () => {
        await deleteTemplate(t.id);
        setTemplates([...loadTemplates()]);
        showToast('Template excluído.', 'info');
      },
    });
  };

  /* ── Histórico ── */
  const openHistory = () => {
    setHistoryQuery('');
    setHistory(loadHistory());
    setModal({ type: 'history' });
  };

  const loadFromHistory = (id: string) => {
    const h = loadHistory().find((x) => x.id === id);
    if (!h) return;
    showLoading('Carregando relatório...');
    requestAnimationFrame(() => {
      try {
        addToHistory(report, session?.id);
        replaceReport(JSON.parse(JSON.stringify(h.snapshot)));
        setModal(null);
        showToast('Relatório carregado do histórico.', 'success');
      } finally {
        hideLoading();
      }
    });
  };

  const removeHistory = (h: HistoryEntry) => {
    if (isQA && h.createdBy && h.createdBy !== session?.id) {
      showToast('Você só pode excluir seus próprios registros de histórico.', 'error');
      return;
    }
    deleteFromHistory(h.id);
    setHistory(loadHistory());
    showToast('Entrada excluída do histórico.', 'info');
  };

  const doClearHistory = () => {
    setConfirmDialog({
      title: 'Limpar histórico',
      message: 'Limpar todo o histórico? Esta ação não pode ser desfeita.',
      confirmLabel: 'Limpar histórico',
      danger: true,
      onConfirm: () => {
        clearHistory();
        setModal(null);
        showToast('Histórico limpo.', 'info');
      },
    });
  };

  /* ── Scroll para seção ── */
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (window.innerWidth <= 900) setTab('form');
  };

  /* ── Atalhos de teclado (Ctrl+S / Ctrl+P) ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        markSaved();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        exportPDF(report);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [report, session, saveNow]);

  /* ── Aviso quando outro participante salva o relatório ── */
  useEffect(() => {
    const ev = live.savedEvent;
    if (!ev) return;
    showToast(`${ev.byName} salvou o relatório nos templates de ${ev.ownerName}.`, 'info');
  }, [live.savedEvent?.ts]);

  const reportActions: ReportActions = {
    scrollTo,
    saveTemplate: openSaveTemplate,
    loadTemplate: openLoadTemplate,
    history: openHistory,
    importJSON: () => jsonInputRef.current?.click(),
    exportJSON,
  };

  const topbarTitle = stripBold((report.story.id ? report.story.id + ' — ' : '') + (report.story.title || 'Novo Relatório'));
  const logoUrl = getCompanyLogoUrl(report);
  const hasLogo = Boolean(report.company.logoUrl);

  const filteredHistory = history.filter((h) => {
    const q = historyQuery.toLowerCase().trim();
    if (!q) return true;
    return h.storyTitle.toLowerCase().includes(q) || h.storyId.toLowerCase().includes(q);
  });

  /* ── Templates agrupados por pasta (usuário) ── */
  const tq = norm(templateQuery);
  const matchesTemplateQuery = (t: Template) =>
    !tq || [t.name, t.system, t.module, t.sprint, t.environment].some((v) => norm(v).includes(tq));

  const profileNameById = new Map(cachedProfiles().map((p) => [p.id, p.nome]));

  interface TemplateFolder { key: string; label: string; isMine: boolean; items: Template[] }

  const templateFolders: TemplateFolder[] = (() => {
    const map = new Map<string, TemplateFolder>();
    for (const t of templates) {
      if (!matchesTemplateQuery(t)) continue;
      const owner = t.createdBy || '';
      const isMine = !!owner && owner === session?.id;
      const knownName = isMine
        ? session?.nome || profileNameById.get(owner) || 'Eu'
        : owner
        ? profileNameById.get(owner)
        : undefined;
      const key = isMine ? owner : owner && knownName ? owner : '__outros__';
      const label = isMine ? `${knownName} (você)` : knownName || 'Outros';
      if (!map.has(key)) map.set(key, { key, label, isMine, items: [] });
      map.get(key)!.items.push(t);
    }
    const folders = [...map.values()];
    folders.forEach((f) => f.items.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || '')));
    folders.sort((a, b) => {
      if (a.isMine !== b.isMine) return a.isMine ? -1 : 1; // minha pasta primeiro
      if (a.key === '__outros__') return 1; // "Outros" por último
      if (b.key === '__outros__') return -1;
      return a.label.localeCompare(b.label);
    });
    return folders;
  })();

  // Pasta exibida no painel da direita (seleção do usuário ou a primeira disponível).
  const activeFolder =
    templateFolders.find((f) => f.key === selectedFolderKey) || templateFolders[0] || null;

  // Outros participantes online (exclui você).
  const others = live.participants.filter((p) => p.id !== session?.id);
  const canShare = canWrite && !live.active && hasContent && isSharingAvailable();

  /* ── Estados de sessão compartilhada (carregando / não encontrada) ── */
  if (live.active && live.loading) {
    return (
      <div className="app" id="app">
        <Sidebar reportActions={reportActions} canWrite={canWrite} />
        <div className="main" id="main">
          <div className="empty-state" style={{ margin: 'auto', textAlign: 'center' }}>
            <p>🔄 Entrando na sessão compartilhada...</p>
          </div>
        </div>
      </div>
    );
  }
  if (live.active && live.notFound) {
    return (
      <div className="app" id="app">
        <Sidebar reportActions={reportActions} canWrite={canWrite} />
        <div className="main" id="main">
          <div className="empty-state" style={{ margin: 'auto', textAlign: 'center' }}>
            <p>❌ Sessão não encontrada ou expirada.</p>
            <a className="btn btn-primary" href={`${window.location.pathname}#/`}>Voltar ao relatório</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app" id="app">
      <Sidebar reportActions={reportActions} canWrite={canWrite} />

      <div className="main" id="main">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-title">
              <span className="breadcrumb">Relatório</span>
              <h1 id="topbar-title">{topbarTitle}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            {live.active && (
              <div className="live-session-badge" title="Sessão compartilhada em tempo real">
                <span className="live-dot" />
                <span>Ao vivo</span>
                <div className="live-avatars">
                  {live.participants.slice(0, 4).map((p) => (
                    <span
                      key={p.id}
                      className={`live-avatar${p.id === session?.id ? ' me' : ''}`}
                      title={p.id === session?.id ? `${p.name} (você)` : p.name}
                    >
                      {(p.name || '?').trim().charAt(0).toUpperCase()}
                    </span>
                  ))}
                </div>
                <span className="live-count">
                  {others.length > 0
                    ? `${others.length} colaborador${others.length > 1 ? 'es' : ''} online`
                    : 'só você por aqui'}
                </span>
              </div>
            )}
            <div className={`autosave-badge${saveState === 'saving' ? ' saving' : ''}`}>
              <span className="autosave-dot" />
              <span>{saveState === 'saving' ? 'Salvando...' : 'Salvo'}</span>
            </div>
            {canWrite && (
              <>
                {!live.active && (
                  <button className="btn btn-ghost" onClick={newReport}>Novo</button>
                )}
                {!live.active && (
                  <button className="btn btn-ghost" onClick={duplicateReport} title="Duplicar relatório">Duplicar</button>
                )}
                <button
                  className="btn btn-ghost"
                  onClick={markSaved}
                  title={
                    live.active && live.ownerName
                      ? `Salvar nos templates de ${live.ownerName} (Ctrl+S)`
                      : 'Salvar no histórico (Ctrl+S)'
                  }
                >
                  Salvar
                </button>
                {canShare && (
                  <button
                    className="btn btn-share"
                    onClick={shareCurrentReport}
                    disabled={sharing}
                    title="Compartilhar sessão para editar em tempo real"
                  >
                    {sharing ? '...' : '🔗 Compartilhar'}
                  </button>
                )}
                {live.active && (
                  <button className="btn btn-ghost" onClick={copySessionLink} title="Copiar link da sessão">
                    🔗 Copiar link
                  </button>
                )}
                <button className="btn btn-primary" onClick={() => exportPDF(report)}>PDF</button>
              </>
            )}
          </div>
        </header>

        {live.active && !live.isOwner && live.ownerName && (
          <div className="collab-notice">
            👥 Você está editando o relatório de <strong>{live.ownerName}</strong> em tempo real.
            Ao salvar, o template vai para a coleção dele(a).
          </div>
        )}

        <div className="mobile-tabs">
          <button className={`tab-btn${tab === 'form' ? ' active' : ''}`} onClick={() => setTab('form')}>Formulário</button>
          <button className={`tab-btn${tab === 'preview' ? ' active' : ''}`} onClick={() => setTab('preview')}>Preview</button>
        </div>

        <div className="content-area">
          <fieldset className={`panel form-panel${tab === 'form' ? ' active' : ''}`} id="form-panel" disabled={!canWrite} style={{ border: 0, margin: 0, padding: 0, minInlineSize: 'auto' }}>
            <div className="panel-inner">
              {/* Empresa */}
              <div className="form-section" id="section-company">
                <div className="section-header"><div className="section-icon">🏢</div><div><h2>Empresa</h2><p>Identidade visual do relatório</p></div></div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Nome da Empresa</label>
                    <input type="text" value={report.company.name} placeholder="Ex: Acme Corporation" onChange={(e) => setCompany('name', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Logo da Empresa</label>
                    <div className="logo-upload-area" onClick={() => logoInputRef.current?.click()}>
                      <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onLogoFile(e.target.files?.[0])} />
                      {hasLogo || logoUrl ? <img src={logoUrl} className="logo-preview" alt="Logo" /> : null}
                      {!hasLogo && !logoUrl ? <div><span>Clique para adicionar logo</span></div> : null}
                      {hasLogo && (
                        <button
                          className="btn-remove-logo"
                          onClick={(e) => { e.stopPropagation(); setCompany('logoUrl', ''); }}
                        >
                          ✕ Remover
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* User Story */}
              <div className="form-section" id="section-story">
                <div className="section-header"><div className="section-icon">📌</div><div><h2>Informações da User Story</h2><p>Dados principais da US a ser testada</p></div></div>
                <div className="form-group"><label>ID da User Story</label><input type="text" value={report.story.id} placeholder="Ex: US1183437" onChange={(e) => setStory('id', e.target.value)} /></div>
                <div className="form-group"><label>Título</label><input type="text" value={report.story.title} placeholder="Título da User Story" onChange={(e) => setStory('title', e.target.value)} /></div>
                <div className="form-group"><label>Descrição</label><textarea rows={3} value={report.story.description} placeholder="Como [usuário], quero [ação] para [benefício]..." onChange={(e) => setStory('description', e.target.value)} /></div>
                <div className="form-group"><label>Sistema</label><input type="text" value={report.story.system} placeholder="Ex: Portal Web" onChange={(e) => setStory('system', e.target.value)} /></div>
                <div className="form-group"><label>Módulo</label><input type="text" value={report.story.module} placeholder="Ex: Cadastro" onChange={(e) => setStory('module', e.target.value)} /></div>
                <div className="form-group"><label>Sprint</label><input type="text" value={report.story.sprint} placeholder="Ex: Sprint 42" onChange={(e) => setStory('sprint', e.target.value)} /></div>
                <div className="form-group"><label>Ambiente</label><input type="text" value={report.story.environment} placeholder="Ex: TST, HML, PRD, UAT" onChange={(e) => setStory('environment', e.target.value)} /></div>
              </div>

              {/* Critérios */}
              <div className="form-section" id="section-criteria">
                <div className="section-header"><div className="section-icon">✅</div><div><h2>Critérios de Aceite</h2><p>Defina e evidencie cada critério</p></div></div>
                <div id="criteria-container">
                  {report.criteria.map((c, idx) => (
                    <CriterionCard
                      key={c.id}
                      criterion={c}
                      index={idx}
                      total={report.criteria.length}
                      update={(fn) => updateCriterion(c.id, fn)}
                      onRemove={() => patch((d) => { d.criteria = d.criteria.filter((x) => x.id !== c.id); })}
                      onMove={(dir) =>
                        patch((d) => {
                          const i = d.criteria.findIndex((x) => x.id === c.id);
                          const ni = i + dir;
                          if (i < 0 || ni < 0 || ni >= d.criteria.length) return;
                          [d.criteria[i], d.criteria[ni]] = [d.criteria[ni], d.criteria[i]];
                        })
                      }
                      onToggleCollapse={() => updateCriterion(c.id, (cc) => { cc.collapsed = !cc.collapsed; })}
                    />
                  ))}
                </div>
                {report.criteria.length > 0 ? (
                  <div className="criteria-add-action"><button className="btn btn-primary btn-sm" onClick={addCriterion}>Adicionar Critério</button></div>
                ) : (
                  <div className="empty-state"><p>Nenhum critério adicionado</p><button className="btn btn-primary" onClick={addCriterion}>+ Adicionar Primeiro Critério</button></div>
                )}
              </div>

              {/* Dados Adicionais */}
              <div className="form-section" id="section-additional">
                <div className="section-header"><div className="section-icon">📅</div><div><h2>Dados Adicionais</h2><p>Informações complementares do teste</p></div></div>
                <div className="form-row">
                  <div className="form-group"><label>Responsável pelo Teste</label><input type="text" value={report.additionalData.responsible} placeholder="Nome do responsável" onChange={(e) => setAdd('responsible', e.target.value)} /></div>
                  <div className="form-group form-group-sm"><label>Data do Teste</label><input type="date" value={report.additionalData.testDate} onChange={(e) => setAdd('testDate', e.target.value)} /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Versão do Backoffice</label><input type="text" value={report.additionalData.versionBko} placeholder="Ex: v1.9.0.217" onChange={(e) => setAdd('versionBko', e.target.value)} /></div>
                  <div className="form-group"><label>Versão do Portal B2B</label><input type="text" value={report.additionalData.versionPortal} placeholder="Ex: v1.0.0.19" onChange={(e) => setAdd('versionPortal', e.target.value)} /></div>
                </div>
                <div className="form-group"><label>Observações</label><textarea rows={3} value={report.additionalData.notes} placeholder="Observações gerais sobre os testes realizados..." onChange={(e) => setAdd('notes', e.target.value)} /></div>
              </div>

              {/* Status Final */}
              <div className="form-section" id="section-final-status">
                <div className="section-header"><div className="section-icon">🏁</div><div><h2>Status Final do Teste</h2><p>Resultado geral do ciclo de testes</p></div></div>
                <div className="form-group">
                  <label>Status Final</label>
                  <div className="status-select-wrap">
                    <div className="status-select-icon" style={{ background: statusColor(report.finalStatus) }} />
                    <select className="status-select" value={report.finalStatus} onChange={(e) => patch((d) => { d.finalStatus = e.target.value as Status; })}>
                      <option value="pending">⏳ Pendente</option>
                      <option value="approved">✅ Aprovado</option>
                      <option value="rejected">❌ Reprovado</option>
                      <option value="partial">⚠️ Parcial</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </fieldset>

          <DocumentPreview report={report} active={tab === 'preview'} />
        </div>
      </div>

      <input ref={jsonInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => { onJSONFile(e.target.files?.[0]); e.target.value = ''; }} />

      {/* ── Modais ── */}
      {modal?.type === 'saveTemplate' && (
        <Modal
          title="💾 Salvar Template"
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => persistTemplate(modal.name, {})}>Salvar</button>
            </>
          }
        >
          <div className="modal-input-group">
            <label>Nome do template</label>
            <input
              type="text"
              autoFocus
              value={modal.name}
              placeholder="Ex: US-123 - Login com credenciais válidas"
              style={{ width: '100%' }}
              onChange={(e) => setModal({ type: 'saveTemplate', name: e.target.value })}
            />
          </div>
        </Modal>
      )}

      {modal?.type === 'loadTemplate' && (
        <Modal title="Carregar Template" onClose={() => setModal(null)} large className="modal-tpl">
          <div className="tpl-modal">
            <div className="tpl-search">
              <input
                type="text"
                autoFocus
                value={templateQuery}
                placeholder="Buscar template, sistema, módulo, sprint ou ambiente..."
                onChange={(e) => setTemplateQuery(e.target.value)}
              />
            </div>

            {templates.length === 0 ? (
              <div className="modal-empty">Nenhum template salvo ainda.<br />Preencha um relatório e clique em "Salvar Template".</div>
            ) : templateFolders.length === 0 ? (
              <div className="modal-empty">Nenhum template encontrado para “{templateQuery}”.</div>
            ) : (
              <div className="tpl-layout">
                {/* Lista de pastas (usuários) */}
                <aside className="tpl-sidebar">
                  {templateFolders.map((folder) => (
                    <button
                      key={folder.key}
                      type="button"
                      className={`tpl-folder-item${folder.key === activeFolder?.key ? ' active' : ''}`}
                      onClick={() => setSelectedFolderKey(folder.key)}
                    >
                      <span className="tpl-folder-name">
                        <span className="tpl-folder-label">{folder.label}</span>
                      </span>
                      <span className="tpl-folder-count">{folder.items.length}</span>
                    </button>
                  ))}
                </aside>

                {/* Templates da pasta selecionada */}
                <div className="tpl-detail">
                  {(activeFolder?.items || []).map((t) => {
                    const mine = !!t.createdBy && t.createdBy === session?.id;
                    const meta = [
                      { label: 'Sistema', value: t.system || '' },
                      { label: 'Módulo', value: t.module || '' },
                      { label: 'Sprint', value: t.sprint || '' },
                      { label: 'Ambiente', value: t.environment || '' },
                    ].filter((m) => m.value.trim());
                    return (
                      <div className={`tpl-card${mine ? ' mine' : ' shared'}`} key={t.id}>
                        <div className="tpl-card-main">
                          <div className="tpl-card-title">{t.name}</div>
                          <div className="tpl-tags">
                            <span className={`tpl-tag ${mine ? 'mine' : 'shared'}`}>
                              {mine ? 'Meu template' : 'Compartilhado'}
                            </span>
                            {t.finalStatus && (
                              <span className={`tpl-tag status status-${t.finalStatus}`}>
                                {STATUS_LABEL[t.finalStatus] ?? t.finalStatus}
                              </span>
                            )}
                          </div>
                          {meta.length > 0 && (
                            <div className="tpl-meta-grid">
                              {meta.map((m) => (
                                <div className="tpl-meta-item" key={m.label}>
                                  <div className="tpl-meta-label">{m.label}</div>
                                  <div className="tpl-meta-value">{m.value}</div>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="tpl-card-dates">
                            <div>Criado: {formatDate(t.createdAt || t.savedAt)}</div>
                            <div>Atualizado: {formatDate(t.savedAt)}</div>
                          </div>
                        </div>
                        <div className="tpl-card-actions">
                          <CriteriaDonut counts={t.criteriaStatus} total={t.criteriaCount} />
                          <div className="tpl-card-btns">
                            <button className="tpl-btn-use" type="button" onClick={() => useTemplate(t)}>
                              Usar
                            </button>
                            {canDeleteTemplate(t) && (
                              <button className="tpl-btn-delete" type="button" onClick={() => removeTemplate(t)}>
                                Excluir
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {modal?.type === 'history' && (
        <Modal
          title="🕐 Histórico de Relatórios"
          onClose={() => setModal(null)}
          footer={filteredHistory.length > 0 && !historyQuery ? <button className="btn btn-danger" onClick={doClearHistory}>🗑 Limpar Histórico</button> : undefined}
        >
          <div className="search-input-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={11} cy={11} r={8} /><path d="M21 21l-4.35-4.35" /></svg>
            <input type="text" placeholder="Buscar relatórios..." value={historyQuery} autoFocus onChange={(e) => setHistoryQuery(e.target.value)} />
          </div>
          {filteredHistory.length === 0 ? (
            <div className="modal-empty">{historyQuery ? 'Nenhum resultado encontrado.' : 'Histórico vazio.'}</div>
          ) : (
            <div className="modal-list">
              {filteredHistory.map((h) => (
                <div className="modal-item" key={h.id} onClick={() => loadFromHistory(h.id)}>
                  <div className="modal-item-icon">📄</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="modal-item-title">{h.storyId ? h.storyId + ' — ' : ''}{h.storyTitle}</div>
                    <div className="modal-item-meta">{h.criteriaCount} critério(s) · {formatDate(h.savedAt)}</div>
                  </div>
                  <div className="modal-item-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-danger btn-sm" onClick={() => removeHistory(h)}>Excluir</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {modal?.type === 'share' && (
        <Modal title="🔗 Compartilhar sessão" onClose={() => setModal(null)}>
          <p style={{ marginTop: 0 }}>
            Envie este link para um colega. Quem abrir (logado no app) edita o
            relatório <strong>junto com você, em tempo real</strong> — critérios,
            status, imagens e tudo mais.
          </p>
          <div className="share-link-row">
            <input type="text" readOnly value={modal.link} onFocus={(e) => e.target.select()} />
            <button
              className="btn btn-primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(modal.link);
                  showToast('Link copiado!', 'success');
                } catch {
                  showToast('Copie o link manualmente.', 'warning');
                }
              }}
            >
              Copiar
            </button>
          </div>
          <div className="modal-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => window.open(modal.link, '_blank')}>
              Abrir em nova aba
            </button>
            <button className="btn btn-primary" onClick={() => setModal(null)}>Pronto</button>
          </div>
        </Modal>
      )}

      {confirmDialog && (
        <Modal
          title={confirmDialog.title}
          onClose={() => {
            if (blocker.state === 'blocked') blocker.reset();
            setConfirmDialog(null);
          }}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => {
                if (blocker.state === 'blocked') blocker.reset();
                setConfirmDialog(null);
              }}>Cancelar</button>
              {confirmDialog.secondaryLabel && confirmDialog.onSecondary && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const run = confirmDialog.onSecondary!;
                    setConfirmDialog(null);
                    run();
                  }}
                >
                  {confirmDialog.secondaryLabel}
                </button>
              )}
              <button
                className={`btn ${confirmDialog.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => {
                  const run = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  run();
                }}
              >
                {confirmDialog.confirmLabel}
              </button>
            </>
          }
        >
          <div style={{ whiteSpace: 'pre-line', lineHeight: 1.55 }}>{confirmDialog.message}</div>
        </Modal>
      )}
    </div>
  );
}
