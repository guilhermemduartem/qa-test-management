import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TestsLayout } from './TestsLayout';
import { ProjectBar } from '../../components/tests/ProjectBar';
import { Modal } from '../../components/Modal';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useUserNames } from '../../hooks/useUserNames';
import {
  listCases, listRuns, listRunResults, listDefects, listPlans, listCards, listSprints, listMilestones,
  listSessions, listRequirements, listCaseRequirements, saveDefect, savePlan, saveSession, currentUserId,
} from '../../lib/testManagement';
import { listAzureConfigs, getMyAzureSettings } from '../../lib/azureManagement';
import { getComments, addComment, getMyAzureId, downloadAttachment, extractImgTags } from '../../lib/azureDevOps';
import { runAzureSync, loadSyncResult, saveSyncResult, type SyncResult, type SyncItem } from '../../lib/azureSync';
import type { AzureConfig, AzureComment } from '../../types/azure';
import {
  RUN_STATUS_LABEL, DEFECT_STATUS_LABEL, DEFECT_SEVERITY_LABEL, SESSION_STATUS_LABEL, SESSION_STATUS_COLOR,
  type TestRun, type Defect, type TestPlan, type Card, type Sprint, type Milestone,
  type ExploratorySession, type DefectStatus,
} from '../../types/tests';
import { formatDate } from '../../lib/utils';
import { showToast } from '../../lib/toast';
import {
  IconBug, IconPlay, IconNote, IconAlertTriangle, IconCheck, IconLightbulb, IconX, IconExternal, IconChevron, IconPencil,
} from '../../components/tests/icons';
import { WorkItemModal, type AzureItem, AZ_TYPE_COLOR, AZ_TYPE_LABEL } from '../../components/tests/AzureWorkItemModal';

type LocalComment = { text: string; at: string };

const COMPANY_LABEL: Record<string, string> = {
  '7': 'Bedsonline', '8': 'Cativa', '10': 'Flot', '12': 'Smiles', '17': 'Azul',
};
function isImage(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/i.test(url);
}

const PLAN_LABEL: Record<string, string> = {
  pendente: 'Pendente', em_teste: 'Em teste', com_bug: 'Com bug',
  bloqueado: 'Bloqueado', finalizado: 'Finalizado', cancelado: 'Cancelado',
};

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--error)', high: 'var(--warning)',
  medium: '#f59e0b', low: 'var(--text-muted)',
};
const SEV_LABEL: Record<string, string> = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' };

const PLAN_COLOR: Record<string, string> = {
  pendente: '#94a3b8', em_teste: '#60a5fa', com_bug: '#ef4444',
  bloqueado: '#f59e0b', finalizado: '#10b981', cancelado: '#94a3b8',
};

const DEFECT_STATUS_COLOR: Record<string, string> = {
  pending_azure: '#f59e0b', open: '#ef4444', in_progress: '#f59e0b',
  resolved: '#10b981', closed: '#10b981',
};

const RUN_STATUS_COLOR: Record<string, string> = {
  open: '#60a5fa', in_progress: '#f59e0b', closed: '#10b981',
};

const SESSION_TYPE_COLOR: Record<string, string> = {
  has_bug: '#ef4444', has_blocker: '#f97316', clean: '#10b981',
};

const NOTE_COLOR: Record<string, string> = {
  bug: 'var(--error)', blocker: '#f97316', idea: '#f59e0b', improvement: '#10b981', note: 'var(--text-secondary)',
};
const NOTE_LABEL: Record<string, string> = {
  bug: 'Bug', blocker: 'Bloqueio', idea: 'Ideia', improvement: 'Melhoria', note: 'Nota',
};

type EnrichedRun = TestRun & { passRate: number | null; passed: number; failed: number; total: number };

interface DashData {
  totalCases: number; activeCases: number;
  totalRuns: number; openRuns: number;
  globalPassRate: number | null;
  allDefects: Defect[]; openDefects: Defect[]; criticalDefects: number;
  resolvedDefects: number;
  defectsBySeverity: Record<string, number>;
  allImprovements: Defect[];
  improvementsTotal: number; improvementsOpen: number; improvementsDone: number;
  allPlans: TestPlan[]; activePlans: TestPlan[];
  allCards: Card[]; allSprints: Sprint[]; allMilestones: Milestone[];
  allRuns: EnrichedRun[];
  runsMap: Map<string, TestRun>;
  originMap: Map<string, { caseTitle: string; runName: string }>;
  allSessions: ExploratorySession[];
  totalSessionBugs: number;
  reqCoverage: number | null;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgoStr(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { projects, activeId, setActiveId, reload, loading } = useActiveProject();
  const { name: userName, initials: userInitials } = useUserNames();
  const [d, setD] = useState<DashData | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewingBug, setViewingBug] = useState<Defect | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  // Filtro de data — inicializa sempre com últimos 30 dias
  const [dateFrom, setDateFrom] = useState(daysAgoStr(30));
  const [dateTo, setDateTo] = useState(todayStr());

  // Busca por painel
  const [bugSearch, setBugSearch] = useState('');
  const [improvementSearch, setImprovementSearch] = useState('');
  const [runSearch, setRunSearch] = useState('');
  const [planSearch, setPlanSearch] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');

  // Filtro de status por painel (null = sem filtro)
  const [bugStatusFilter, setBugStatusFilter] = useState<string | null>(null);
  const [improvementStatusFilter, setImprovementStatusFilter] = useState<string | null>(null);
  const [runStatusFilter, setRunStatusFilter] = useState<string | null>(null);
  const [planStatusFilter, setPlanStatusFilter] = useState<string | null>(null);
  const [sessionTypeFilter, setSessionTypeFilter] = useState<'has_bug' | 'has_blocker' | 'clean' | null>(null);

  // Modais de detalhe
  const [viewingSession, setViewingSession] = useState<ExploratorySession | null>(null);
  const [viewingPlan, setViewingPlan] = useState<TestPlan | null>(null);

  // Azure
  const [azureConfigs, setAzureConfigs] = useState<AzureConfig[]>([]);
  const [myPat, setMyPat] = useState('');
  const [viewingAzureItem, setViewingAzureItem] = useState<AzureItem | null>(null);
  const [azureSearch, setAzureSearch] = useState('');

  // Sincronização Azure (feed de novidades, persiste por usuário)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(() => {
    const uid = currentUserId();
    return uid ? loadSyncResult(uid) : null;
  });
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [showSync, setShowSync] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reloadDash = () => setReloadKey(k => k + 1);

  const runSync = async () => {
    if (!activeId || syncing) return;
    if (!myPat || azureConfigs.length === 0) { showToast('Configure seu PAT e uma conexão Azure.', 'warning'); return; }
    setSyncing(true); setSyncProgress({ done: 0, total: 0 });
    try {
      // só os itens visíveis na tela (pela busca/data) e não fechados
      const visibleIds = new Set([...filteredBugs, ...filteredImprovements].filter(x => x.status !== 'closed').map(x => x.id));
      const result = await runAzureSync(activeId, azureConfigs, myPat, {
        onlyDefectIds: visibleIds,
        onProgress: (done, total) => setSyncProgress({ done, total }),
      });
      const uid = currentUserId();
      if (uid) saveSyncResult(uid, result);
      setSyncResult(result);
      setShowSync(true);
      reloadDash();
      showToast(`Sincronização concluída: ${result.items.length} novidade(s).`, 'success');
    } catch (e) {
      showToast(`Erro na sincronização: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
    setSyncing(false);
  };

  useEffect(() => {
    listAzureConfigs().then(setAzureConfigs);
    getMyAzureSettings().then(s => { if (s?.pat) setMyPat(s.pat); });
  }, []);

  useEffect(() => {
    if (!activeId) { setD(null); return; }
    let cancel = false;
    (async () => {
      setBusy(true);
      const myId = currentUserId();
      const [allCases, allRuns, allDefectsRaw, allPlansRaw, allSessionsRaw, reqs, cards, sprints, milestones] = await Promise.all([
        listCases(activeId), listRuns(activeId), listDefects(activeId),
        listPlans(activeId), listSessions(activeId), listRequirements(activeId),
        listCards(activeId), listSprints(activeId), listMilestones(activeId),
      ]);

      // Filtra apenas dados do usuário logado
      const cases    = allCases.filter(c        => c.createdBy     === myId);
      const runs     = allRuns.filter(r         => r.assignedTo    === myId);
      const defects  = allDefectsRaw.filter(d   => d.createdBy     === myId && (d.kind ?? 'bug') === 'bug');
      const improvements = allDefectsRaw.filter(d => d.createdBy === myId && d.kind === 'improvement');
      const plans    = allPlansRaw.filter(p      => p.createdBy     === myId);
      const sessions = allSessionsRaw.filter(s  => s.createdBy     === myId);

      // Carrega todos os run results para build runsMap + originMap + pass rates
      const allRunResults = await Promise.all(runs.map(r => listRunResults(r.id)));
      const titleOf = new Map(cases.map(c => [c.id, c.title]));
      const runsMap = new Map<string, TestRun>();
      const originMap = new Map<string, { caseTitle: string; runName: string }>();
      runs.forEach((run, i) => {
        allRunResults[i].forEach(res => {
          runsMap.set(res.id, run);
          originMap.set(res.id, { caseTitle: titleOf.get(res.caseId) ?? '', runName: run.name });
        });
      });

      let allPassed = 0, allExecuted = 0;
      const allEnrichedRuns: EnrichedRun[] = runs.map((r, i) => {
        const results = allRunResults[i];
        const executed = results.filter(x => x.status !== 'untested');
        const passed = executed.filter(x => x.status === 'passed').length;
        const failed = executed.filter(x => x.status === 'failed' || x.status === 'blocked').length;
        allPassed += passed; allExecuted += executed.length;
        return { ...r, passRate: executed.length ? Math.round((passed / executed.length) * 100) : null, passed, failed, total: results.length };
      });

      let reqCoverage: number | null = null;
      if (reqs.length > 0) {
        const links = await listCaseRequirements(cases.map(c => c.id));
        const covered = new Set(links.map(l => l.requirementId));
        reqCoverage = Math.round((reqs.filter(r => covered.has(r.id)).length / reqs.length) * 100);
      }

      const openDefects = defects.filter(d => d.status === 'pending_azure' || d.status === 'open' || d.status === 'in_progress');
      const defsBySev: Record<string, number> = {};
      openDefects.forEach(d => { defsBySev[d.severity] = (defsBySev[d.severity] || 0) + 1; });
      const sevOrd = { critical: 0, high: 1, medium: 2, low: 3 };
      const statusOrd = { pending_azure: 0, open: 1, in_progress: 2, resolved: 3, closed: 4 };
      const sortDefects = (arr: Defect[]) => [...arr].sort((a, b) => {
        const so = (statusOrd[a.status] ?? 9) - (statusOrd[b.status] ?? 9);
        if (so !== 0) return so;
        return (sevOrd[a.severity as keyof typeof sevOrd] ?? 9) - (sevOrd[b.severity as keyof typeof sevOrd] ?? 9);
      });
      const sortedAllDefects = sortDefects(defects);

      const totalSessionBugs = sessions.reduce((sum, s) =>
        sum + s.notes.filter(n => n.noteType === 'bug' || n.bugId).length, 0);

      if (cancel) return;
      setD({
        totalCases: cases.length,
        activeCases: cases.filter(c => c.status === 'active').length,
        totalRuns: runs.length,
        openRuns: runs.filter(r => r.status === 'open' || r.status === 'in_progress').length,
        globalPassRate: allExecuted ? Math.round((allPassed / allExecuted) * 100) : null,
        allDefects: sortedAllDefects,
        openDefects,
        criticalDefects: openDefects.filter(d => d.severity === 'critical').length,
        resolvedDefects: defects.filter(d => d.status === 'resolved' || d.status === 'closed').length,
        defectsBySeverity: defsBySev,
        allImprovements: sortDefects(improvements),
        improvementsTotal: improvements.length,
        improvementsOpen: improvements.filter(d => d.status === 'pending_azure' || d.status === 'open' || d.status === 'in_progress').length,
        improvementsDone: improvements.filter(d => d.status === 'resolved' || d.status === 'closed').length,
        activePlans: plans.filter(p => p.status !== 'finalizado' && p.status !== 'cancelado'),
        allPlans: plans, allCards: cards, allSprints: sprints, allMilestones: milestones,
        allRuns: allEnrichedRuns, runsMap, originMap,
        allSessions: sessions,
        totalSessionBugs,
        reqCoverage,
      });
      setBusy(false);
    })();
    return () => { cancel = true; };
  }, [activeId, reloadKey]);

  const onBugUpdated = (updated: Defect) => {
    setViewingBug(updated);
    setD(prev => {
      if (!prev) return prev;
      const newAll = prev.allDefects.map(d => d.id === updated.id ? updated : d);
      const newOpen = newAll.filter(d => d.status === 'pending_azure' || d.status === 'open' || d.status === 'in_progress');
      return { ...prev, allDefects: newAll, openDefects: newOpen };
    });
    saveDefect(updated);
  };

  // ── Lookups (necessários antes dos filtros de busca) ──
  const cardById = new Map(d ? d.allCards.map(c => [c.id, c]) : []);
  const planById = new Map(d ? d.allPlans.map(p => [p.id, p]) : []);
  const azureIdForCard = (cardId: string | null) => cardId ? (cardById.get(cardId)?.azureId ?? null) : null;
  const azureIdForPlan = (planId: string | null) => {
    if (!planId) return null;
    const cardId = planById.get(planId)?.cardId ?? null;
    return azureIdForCard(cardId);
  };

  // ── Dados filtrados por data, busca, status ──
  const fromDt = new Date(dateFrom + 'T00:00:00');
  const toDt   = new Date(dateTo   + 'T23:59:59');
  const inRange = (iso: string) => { const dt = new Date(iso); return dt >= fromDt && dt <= toDt; };

  const bugSortOrd:  Record<string, number> = { pending_azure: 0, open: 1, in_progress: 2, resolved: 3, closed: 4 };
  const runSortOrd:  Record<string, number> = { open: 0, in_progress: 1, closed: 2 };
  const planSortOrd: Record<string, number> = { em_teste: 0, com_bug: 1, bloqueado: 2, pendente: 3, finalizado: 4, cancelado: 5 };

  const matchSearch = (q: string, ...fields: (string | number | null | undefined)[]) => {
    if (!q) return true;
    const lq = q.toLowerCase();
    return fields.some(f => f != null && String(f).toLowerCase().includes(lq));
  };

  // pré-status (para contagens dos chips)
  const preBugs = d ? d.allDefects.filter(b => inRange(b.createdAt) && matchSearch(bugSearch,
    b.title, b.azureWorkItemId, azureIdForCard(b.cardId))) : [];
  const preImprovements = d ? d.allImprovements.filter(b => inRange(b.createdAt) && matchSearch(improvementSearch,
    b.title, b.azureWorkItemId, azureIdForCard(b.cardId))) : [];
  const preRuns = d ? d.allRuns.filter(r => inRange(r.createdAt) && matchSearch(runSearch,
    r.name, azureIdForPlan(r.planId))) : [];
  const prePlans = d ? d.allPlans.filter(p => inRange(p.createdAt) && matchSearch(planSearch,
    p.name, azureIdForCard(p.cardId))) : [];
  const preSessions = d ? d.allSessions.filter(s => inRange(s.createdAt) && matchSearch(sessionSearch,
    s.charter, azureIdForPlan(s.planId))) : [];

  const bugStatusCounts  = preBugs.reduce((a, b)  => { a[b.status] = (a[b.status]  || 0) + 1; return a; }, {} as Record<string, number>);
  const improvementStatusCounts = preImprovements.reduce((a, b) => { a[b.status] = (a[b.status] || 0) + 1; return a; }, {} as Record<string, number>);
  const runStatusCounts  = preRuns.reduce((a, r)   => { a[r.status] = (a[r.status]  || 0) + 1; return a; }, {} as Record<string, number>);
  const planStatusCounts = prePlans.reduce((a, p)  => { a[p.status] = (a[p.status]  || 0) + 1; return a; }, {} as Record<string, number>);

  const sessionTypeCounts = {
    has_bug:     preSessions.filter(s => s.notes.some(n => n.noteType === 'bug' || n.bugId)).length,
    has_blocker: preSessions.filter(s => s.notes.some(n => n.noteType === 'blocker')).length,
    clean:       preSessions.filter(s => !s.notes.some(n => n.noteType === 'bug' || n.bugId || n.noteType === 'blocker')).length,
  };

  const filteredBugs = preBugs
    .filter(b  => !bugStatusFilter  || b.status  === bugStatusFilter)
    .sort((a, b2) => { const so = (bugSortOrd[a.status]  ?? 9) - (bugSortOrd[b2.status]  ?? 9); return so !== 0 ? so : new Date(b2.createdAt).getTime() - new Date(a.createdAt).getTime(); });

  const filteredImprovements = preImprovements
    .filter(b => !improvementStatusFilter || b.status === improvementStatusFilter)
    .sort((a, b2) => { const so = (bugSortOrd[a.status] ?? 9) - (bugSortOrd[b2.status] ?? 9); return so !== 0 ? so : new Date(b2.createdAt).getTime() - new Date(a.createdAt).getTime(); });

  const filteredRuns = preRuns
    .filter(r  => !runStatusFilter  || r.status  === runStatusFilter)
    .sort((a, b) => { const so = (runSortOrd[a.status]   ?? 9) - (runSortOrd[b.status]   ?? 9); return so !== 0 ? so : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); });

  const filteredPlans = prePlans
    .filter(p  => !planStatusFilter || p.status  === planStatusFilter)
    .sort((a, b) => { const so = (planSortOrd[a.status]  ?? 9) - (planSortOrd[b.status]  ?? 9); return so !== 0 ? so : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); });

  const filteredSessions = preSessions
    .filter(s => {
      if (sessionTypeFilter === 'has_bug')     return s.notes.some(n => n.noteType === 'bug' || n.bugId);
      if (sessionTypeFilter === 'has_blocker') return s.notes.some(n => n.noteType === 'blocker');
      if (sessionTypeFilter === 'clean')       return !s.notes.some(n => n.noteType === 'bug' || n.bugId || n.noteType === 'blocker');
      return true;
    })
    .sort((a, b) => {
      const statusOrd = (s: ExploratorySession) => s.status === 'closed' ? 1 : 0;
      const so = statusOrd(a) - statusOrd(b);
      return so !== 0 ? so : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  // Azure Work Items computed list
  const azureItems: AzureItem[] = (() => {
    if (!d) return [];
    const cById = new Map(d.allCards.map(c => [c.id, c]));
    const result: AzureItem[] = [];
    for (const def of d.allDefects) {
      if (def.azureWorkItemId == null || !def.azureConfigId) continue;
      const linked = def.cardId ? cById.get(def.cardId) : undefined;
      result.push({
        azureId: def.azureWorkItemId, title: def.title, type: 'bug',
        configId: def.azureConfigId, defect: def,
        linkedItems: linked?.azureId ? [{ azureId: linked.azureId, title: linked.title, type: 'card' }] : [],
      });
    }
    for (const card of d.allCards) {
      if (card.azureId == null) continue;
      const linkedBugs = d.allDefects
        .filter(def => def.cardId === card.id && def.azureWorkItemId != null)
        .map(def => ({ azureId: def.azureWorkItemId!, title: def.title, type: 'bug' as const }));
      result.push({
        azureId: card.azureId, title: card.title, type: 'card',
        configId: azureConfigs[0]?.id ?? '', card,
        linkedItems: linkedBugs,
      });
    }
    result.sort((a, b) => b.azureId - a.azureId);
    return result;
  })();

  const filteredAzureItems = azureItems.filter(i => {
    if (!azureSearch) return true;
    const q = azureSearch.toLowerCase();
    return String(i.azureId).includes(q) || i.title.toLowerCase().includes(q);
  });

  const apiCfgFor = (configId: string) => {
    const cfg = azureConfigs.find(c => c.id === configId);
    return cfg && myPat ? { organization: cfg.organization, project: cfg.project, pat: myPat } : null;
  };

  const actions = <ProjectBar projects={projects} activeId={activeId} onChange={setActiveId} onCreated={reload} />;

  return (
    <TestsLayout title="Dashboard" activeTest="dashboard" actions={actions} loading={loading || busy}>
      {viewingBug && d && (
        <BugDetailModal
          defect={viewingBug}
          plans={d.allPlans} cards={d.allCards} sprints={d.allSprints} milestones={d.allMilestones}
          runsMap={d.runsMap} originMap={d.originMap}
          authorName={userName(viewingBug.createdBy)} authorInitials={userInitials(viewingBug.createdBy)}
          azureConfigs={azureConfigs} myPat={myPat}
          onClose={() => setViewingBug(null)}
          onUpdated={onBugUpdated}
          onLightbox={setLightbox}
        />
      )}
      {viewingSession && d && (
        <SessionDetailModal
          session={viewingSession}
          plans={d.allPlans}
          onClose={() => setViewingSession(null)}
          onUpdated={updated => {
            setViewingSession(updated);
            setD(prev => prev ? { ...prev, allSessions: prev.allSessions.map(s => s.id === updated.id ? updated : s) } : prev);
          }}
        />
      )}
      {viewingPlan && d && (
        <PlanDetailModal
          plan={viewingPlan}
          cards={d.allCards} sprints={d.allSprints} milestones={d.allMilestones}
          runs={d.allRuns}
          onClose={() => setViewingPlan(null)}
          onUpdated={updated => {
            setViewingPlan(updated);
            setD(prev => prev ? { ...prev, allPlans: prev.allPlans.map(p => p.id === updated.id ? updated : p) } : prev);
          }}
        />
      )}
      {viewingAzureItem && (
        <WorkItemModal
          item={viewingAzureItem}
          apiCfg={apiCfgFor(viewingAzureItem.configId)}
          onClose={() => setViewingAzureItem(null)}
          onUpdated={(updated: AzureItem) => setViewingAzureItem(updated)}
        />
      )}
      {/* Drawer de novidades do Azure */}
      {showSync && syncResult && Array.isArray(syncResult.items) && (
        <div style={{ position: 'fixed', top: 0, right: 0, height: '100vh', width: 'min(420px, 92vw)', background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', boxShadow: '-8px 0 32px rgba(0,0,0,0.25)', zIndex: 1500, display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.15s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}>
                <IconLightbulb width={15} height={15} style={{ color: '#8b5cf6' } as React.CSSProperties} /> Novidades do Azure
              </h3>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {formatDate(syncResult.at)} · {syncResult.scanned} item(ns) verificado(s)
              </span>
            </div>
            <button className="btn-icon" onClick={() => setShowSync(false)} title="Fechar" aria-label="Fechar">
              <IconX width={18} height={18} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {syncResult.items.length === 0 ? (
              <p className="tests-muted" style={{ textAlign: 'center', padding: '32px 0' }}>Nenhuma novidade desde a última sincronização.</p>
            ) : (() => {
              /* Agrupa as novidades pelo ID do card (System.Parent). */
              const groups = new Map<string, SyncItem[]>();
              for (const it of syncResult.items) {
                const k = it.cardId != null ? String(it.cardId) : 'none';
                const arr = groups.get(k); if (arr) arr.push(it); else groups.set(k, [it]);
              }
              return [...groups.entries()].map(([k, list]) => (
                <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'sticky', top: 0, background: 'var(--bg-card)', padding: '2px 0', zIndex: 1 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: k === 'none' ? 'var(--text-muted)' : '#fff', background: k === 'none' ? 'var(--bg-input)' : '#3b82f6', border: k === 'none' ? '1px solid var(--border)' : '1px solid #3b82f6', borderRadius: 6, padding: '2px 9px', whiteSpace: 'nowrap' }}>
                      {k === 'none' ? 'Sem card' : `Card #${k}`}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>· {list.length} item{list.length > 1 ? 's' : ''}</span>
                    <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>
                  {list.map(it => {
                    const col = it.kind === 'improvement' ? '#8b5cf6' : '#ef4444';
                    return (
                    <div key={it.defectId} style={{ border: `1px solid ${col}40`, borderLeft: `3px solid ${col}`, borderRadius: 9, padding: '10px 12px', background: `${col}12` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <span style={{ fontSize: 13, fontWeight: 900, color: '#fff', background: it.kind === 'improvement' ? '#8b5cf6' : '#ef4444', borderRadius: 6, padding: '3px 10px', letterSpacing: 0.3, whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
                          {it.kind === 'improvement' ? 'MELHORIA' : 'BUG'} #{it.azureId}
                        </span>
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{it.title}</div>

                      {/* Histórico de mudanças de status — destacado */}
                      {it.statusChanges && it.statusChanges.length > 0 && (
                        <div style={{ marginTop: 7, padding: '7px 9px', background: '#3b82f614', border: '1px solid #3b82f640', borderRadius: 7 }}>
                          <div style={{ fontSize: 9, fontWeight: 800, color: '#3b82f6', marginBottom: 4 }}>
                            STATUS{it.statusChanges.length > 1 ? ` · ${it.statusChanges.length} mudanças` : ''}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {it.statusChanges.map((sc, i) => (
                              <div key={i} style={{ borderLeft: '2px solid #3b82f655', paddingLeft: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>{sc.from ?? '—'}</span>
                                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>→</span>
                                  <span style={{ fontSize: 11.5, fontWeight: 800, color: '#3b82f6' }}>{sc.to}</span>
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                                  por <strong style={{ color: 'var(--text-secondary)' }}>{sc.by}</strong>{sc.at ? ` · ${formatDate(sc.at)}` : ''}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Comentários novos — destacado */}
                      {it.comments && it.comments.length > 0 && (
                        <div style={{ marginTop: 7 }}>
                          <span style={{ fontSize: 9, fontWeight: 800, color: '#8b5cf6' }}>NOVO{it.comments.length > 1 ? 'S' : ''} COMENTÁRIO{it.comments.length > 1 ? 'S' : ''}</span>
                          {it.comments.map((cm, i) => (
                            <div key={i} style={{ marginTop: 4, padding: '6px 9px', background: '#8b5cf60f', border: '1px solid #8b5cf633', borderRadius: 7, fontSize: 11.5, color: 'var(--text-primary)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                                <strong style={{ color: '#8b5cf6' }}>{cm.author}</strong>
                                {cm.date && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatDate(cm.date)}</span>}
                              </div>
                              {cm.text}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ); })}
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={lightbox.url} alt={lightbox.name} style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10, objectFit: 'contain' }} />
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.7 }}>
            <IconX width={22} height={22} />
          </button>
        </div>
      )}
      {!loading && projects.length === 0 ? (
        <div className="tests-empty">
          <h2>Nenhum projeto de teste ainda</h2>
          <p>Crie um projeto no seletor acima para começar.</p>
        </div>
      ) : !activeId ? (
        <div className="tests-empty"><h2>Selecione um projeto</h2><p>Escolha ou crie um projeto no seletor acima.</p></div>
      ) : busy || !d ? (
        <p className="tests-muted">Carregando…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Sincronizar com Azure ── */}
          {azureConfigs.length > 0 && myPat && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {syncResult && !showSync && (
                <button className="btn btn-ghost btn-sm" onClick={() => setShowSync(true)}>
                  Ver novidades{syncResult.items?.length ? ` (${syncResult.items.length})` : ''}
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={runSync} disabled={syncing} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {syncing ? `Sincronizando… ${syncProgress.done}/${syncProgress.total}` : '↻ Sincronizar com Azure'}
              </button>
            </div>
          )}

          {/* ── Filtro de data ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '14px 20px', background: 'var(--bg-input)', borderRadius: 14, border: '1px solid var(--border)' }}>
            {/* Linha 1: atalhos + calendário */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              {([7, 14, 30, 60, 90] as const).map(n => {
                const active = dateFrom === daysAgoStr(n) && dateTo === todayStr();
                return (
                  <button key={n} onClick={() => { setDateFrom(daysAgoStr(n)); setDateTo(todayStr()); }}
                    style={{ fontSize: 13, fontWeight: active ? 700 : 500, padding: '6px 18px', borderRadius: 99, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent)' : 'var(--bg-surface)', color: active ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                    {n}d
                  </button>
                );
              })}
              <span style={{ width: 1, height: 22, background: 'var(--border)', flexShrink: 0 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '4px 12px' }}>
                <input type="date" value={dateFrom} max={dateTo}
                  onChange={e => { if (!e.target.value || e.target.value <= dateTo) setDateFrom(e.target.value); }}
                  style={{ border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer', outline: 'none', minWidth: 110 }} />
                <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 300 }}>–</span>
                <input type="date" value={dateTo} min={dateFrom}
                  onChange={e => { if (!e.target.value || e.target.value >= dateFrom) setDateTo(e.target.value); }}
                  style={{ border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer', outline: 'none', minWidth: 110 }} />
              </div>
            </div>
          </div>

          {/* ── KPIs ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <KpiCard label="Execuções abertas" value={d.openRuns} sub={`${d.totalRuns} total`} icon={<IconPlay width={20} height={20} />} color="var(--info)" />
            <KpiCard label="Taxa de aprovação" value={d.globalPassRate === null ? '—' : `${d.globalPassRate}%`}
              sub="nas minhas execuções" icon={<IconCheck width={20} height={20} />}
              color={d.globalPassRate === null ? 'var(--text-muted)' : d.globalPassRate >= 80 ? 'var(--success)' : d.globalPassRate >= 50 ? 'var(--warning)' : 'var(--error)'} />
            <KpiCard label="Bugs abertos" value={d.openDefects.length} sub={`${d.criticalDefects} críticos`}
              icon={<IconBug width={20} height={20} />}
              color={d.openDefects.length === 0 ? 'var(--success)' : 'var(--error)'} />
            <KpiCard label="Bugs resolvidos" value={d.resolvedDefects} sub="resolvidos/fechados" icon={<IconCheck width={20} height={20} />} color="var(--success)" />
            <KpiCard label="Melhorias abertas" value={d.improvementsOpen} sub={`${d.improvementsTotal} no total`}
              icon={<IconLightbulb width={20} height={20} />} color="#8b5cf6" />
            <KpiCard label="Melhorias feitas" value={d.improvementsDone} sub="resolvidas/fechadas"
              icon={<IconCheck width={20} height={20} />} color="var(--success)" />
            <KpiCard label="Planos ativos" value={d.activePlans.length} sub="em andamento" icon={<IconNote width={20} height={20} />} color="#6366f1" />
            <KpiCard label="Sessões exploratórias" value={d.allSessions.length > 0 ? d.allSessions.length : '—'}
              sub={`${d.totalSessionBugs} bugs encontrados`} icon={<IconLightbulb width={20} height={20} />} color="#f59e0b" />
          </div>

          {/* ── Linha principal: Bugs + Execuções (altura igual via flex) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

            {/* Bugs */}
            <section className="tests-panel" style={{ display: 'flex', flexDirection: 'column', height: 452, boxSizing: 'border-box', overflow: 'hidden' }}>
              <div className="tests-panel-header" style={{ flexShrink: 0 }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <IconBug width={14} height={14} style={{ color: 'var(--error)' } as React.CSSProperties} />
                  Bugs
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  {(Object.entries(DEFECT_STATUS_LABEL) as [string, string][])
                    .filter(([s]) => (bugStatusCounts[s] || 0) > 0)
                    .map(([s, label], i, arr) => {
                      const active = bugStatusFilter === s;
                      const c = DEFECT_STATUS_COLOR[s] ?? '#94a3b8';
                      return (
                        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <button onClick={() => setBugStatusFilter(active ? null : s)}
                            style={{ fontSize: 11, padding: '1px 7px', borderRadius: 99, border: `1px solid ${active ? c : c + '55'}`, background: active ? c : c + '18', color: active ? '#fff' : c, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {label} {bugStatusCounts[s]}
                          </button>
                          {i < arr.length - 1 && <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>}
                        </span>
                      );
                    })}
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4 }} onClick={() => navigate('/testes/defeitos')}>Ver todos</button>
                </div>
              </div>
              {/* busca */}
              <div style={{ flexShrink: 0, marginBottom: 8 }}>
                <input type="text" value={bugSearch} onChange={e => setBugSearch(e.target.value)}
                  placeholder="Buscar bug…"
                  style={{ width: '100%', padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
                {filteredBugs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--success)', fontSize: 13 }}>
                    {bugSearch ? 'Nenhum bug encontrado.' : 'Nenhum bug no período.'}
                  </div>
                ) : filteredBugs.map(bug => {
                  const isOpen = bug.status === 'pending_azure' || bug.status === 'open' || bug.status === 'in_progress';
                  const borderCol = bug.status === 'closed' ? '#10b981' : '#ef4444';
                  const cardNum = azureIdForCard(bug.cardId);
                  return (
                    <div key={bug.id} onClick={() => setViewingBug(bug)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg-input)', borderRadius: 8, border: `1px solid var(--border)`, borderLeft: `3px solid ${borderCol}`, cursor: 'pointer', opacity: isOpen ? 1 : 0.6, transition: 'background 0.12s', flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-input)')}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 }}>
                          {bug.azureWorkItemId != null
                            ? <span style={{ fontSize: 10, fontWeight: 900, color: '#ef4444', background: '#ef444418', border: '1px solid #ef444440', borderRadius: 5, padding: '1px 5px', flexShrink: 0 }}>{bug.azureWorkItemId}</span>
                            : <span style={{ fontSize: 10, fontWeight: 900, color: '#ef4444', background: '#ef444418', border: '1px solid #ef444440', borderRadius: 5, padding: '1px 5px', flexShrink: 0 }}>—</span>
                          }
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bug.title}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                          {cardNum && <span className="casos-tag" style={{ fontSize: 10, padding: '0 5px', color: 'var(--info)', borderColor: 'var(--info)' }}>#{cardNum}</span>}
                          <span>{formatDate(bug.createdAt)}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {bug.status && (
                          <span className={`tests-badge def-${bug.status}`} style={{ fontSize: 10, flexShrink: 0 }}>{DEFECT_STATUS_LABEL[bug.status as keyof typeof DEFECT_STATUS_LABEL] ?? bug.status}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Melhorias */}
            <section className="tests-panel" style={{ display: 'flex', flexDirection: 'column', height: 452, boxSizing: 'border-box', overflow: 'hidden' }}>
              <div className="tests-panel-header" style={{ flexShrink: 0 }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <IconLightbulb width={14} height={14} style={{ color: '#8b5cf6' } as React.CSSProperties} />
                  Melhorias
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  {(Object.entries(DEFECT_STATUS_LABEL) as [string, string][])
                    .filter(([s]) => (improvementStatusCounts[s] || 0) > 0)
                    .map(([s, label], i, arr) => {
                      const active = improvementStatusFilter === s;
                      const c = DEFECT_STATUS_COLOR[s] ?? '#94a3b8';
                      return (
                        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <button onClick={() => setImprovementStatusFilter(active ? null : s)}
                            style={{ fontSize: 11, padding: '1px 7px', borderRadius: 99, border: `1px solid ${active ? c : c + '55'}`, background: active ? c : c + '18', color: active ? '#fff' : c, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {label} {improvementStatusCounts[s]}
                          </button>
                          {i < arr.length - 1 && <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>}
                        </span>
                      );
                    })}
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4 }} onClick={() => navigate('/testes/melhorias')}>Ver todas</button>
                </div>
              </div>
              {/* busca */}
              <div style={{ flexShrink: 0, marginBottom: 8 }}>
                <input type="text" value={improvementSearch} onChange={e => setImprovementSearch(e.target.value)}
                  placeholder="Buscar melhoria…"
                  style={{ width: '100%', padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
                {filteredImprovements.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                    {improvementSearch ? 'Nenhuma melhoria encontrada.' : 'Nenhuma melhoria no período.'}
                  </div>
                ) : filteredImprovements.map(imp => {
                  const isOpen = imp.status === 'pending_azure' || imp.status === 'open' || imp.status === 'in_progress';
                  const borderCol = imp.status === 'closed' || imp.status === 'resolved' ? '#10b981' : '#8b5cf6';
                  const cardNum = azureIdForCard(imp.cardId);
                  return (
                    <div key={imp.id} onClick={() => setViewingBug(imp)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg-input)', borderRadius: 8, border: `1px solid var(--border)`, borderLeft: `3px solid ${borderCol}`, cursor: 'pointer', opacity: isOpen ? 1 : 0.6, transition: 'background 0.12s', flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-input)')}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 10, fontWeight: 900, color: '#8b5cf6', background: '#8b5cf618', border: '1px solid #8b5cf640', borderRadius: 5, padding: '1px 5px', flexShrink: 0 }}>{imp.azureWorkItemId ?? '—'}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{imp.title}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                          {cardNum && <span className="casos-tag" style={{ fontSize: 10, padding: '0 5px', color: 'var(--info)', borderColor: 'var(--info)' }}>#{cardNum}</span>}
                          <span>{formatDate(imp.createdAt)}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {imp.status && (
                          <span className={`tests-badge def-${imp.status}`} style={{ fontSize: 10, flexShrink: 0 }}>{DEFECT_STATUS_LABEL[imp.status as keyof typeof DEFECT_STATUS_LABEL] ?? imp.status}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* ── Execuções recentes + Planos + Sessões ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

            {/* Execuções recentes */}
            <section className="tests-panel" style={{ display: 'flex', flexDirection: 'column', height: 452, boxSizing: 'border-box', overflow: 'hidden' }}>
              <div className="tests-panel-header" style={{ flexShrink: 0 }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <IconPlay width={14} height={14} style={{ color: 'var(--info)' } as React.CSSProperties} />
                  Execuções recentes
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  {(Object.entries(RUN_STATUS_LABEL) as [string, string][])
                    .filter(([s]) => (runStatusCounts[s] || 0) > 0)
                    .map(([s, label], i, arr) => {
                      const active = runStatusFilter === s;
                      const c = RUN_STATUS_COLOR[s] ?? '#94a3b8';
                      return (
                        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <button onClick={() => setRunStatusFilter(active ? null : s)}
                            style={{ fontSize: 11, padding: '1px 7px', borderRadius: 99, border: `1px solid ${active ? c : c + '55'}`, background: active ? c : c + '18', color: active ? '#fff' : c, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {label} {runStatusCounts[s]}
                          </button>
                          {i < arr.length - 1 && <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>}
                        </span>
                      );
                    })}
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4 }} onClick={() => navigate('/testes/runs')}>Ver todas</button>
                </div>
              </div>
              {/* busca */}
              <div style={{ flexShrink: 0, marginBottom: 6 }}>
                <input type="text" value={runSearch} onChange={e => setRunSearch(e.target.value)}
                  placeholder="Buscar execução…"
                  style={{ width: '100%', padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
                {filteredRuns.length === 0 ? (
                  <p className="tests-muted">{runSearch ? 'Nenhuma execução encontrada.' : 'Nenhuma execução no período.'}</p>
                ) : filteredRuns.map(r => {
                  const isClosed = r.status === 'closed';
                  const runBorderCol = r.status === 'closed' ? '#10b981' : r.status === 'in_progress' ? '#f59e0b' : '#60a5fa';
                  const cardNum = azureIdForPlan(r.planId);
                  return (
                    <div key={r.id} onClick={() => navigate(`/testes/runs?series=${r.seriesId}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', background: 'var(--bg-input)', borderRadius: 9, border: '1px solid var(--border)', borderLeft: `3px solid ${runBorderCol}`, cursor: 'pointer', flexShrink: 0, opacity: isClosed ? 0.55 : 1, transition: 'background 0.12s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-input)')}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          {cardNum && <span className="casos-tag" style={{ fontSize: 10, padding: '0 5px', color: 'var(--info)', borderColor: 'var(--info)' }}>#{cardNum}</span>}
                          {r.ambiente && <span>{r.ambiente}</span>}
                          {r.company && <span>{r.company}</span>}
                          <span>{formatDate(r.createdAt)}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {r.total > 0 && (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11 }}>
                            <span style={{ color: 'var(--success)', fontWeight: 700 }}>{r.passed}✓</span>
                            <span style={{ color: 'var(--error)', fontWeight: 700 }}>{r.failed}✗</span>
                          </div>
                        )}
                        {r.passRate !== null && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: r.passRate >= 80 ? 'var(--success)' : r.passRate >= 50 ? 'var(--warning)' : 'var(--error)', minWidth: 36, textAlign: 'right' }}>{r.passRate}%</span>
                        )}
                        <span className={`tests-badge status-${r.status}`}>{RUN_STATUS_LABEL[r.status]}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Planos de teste */}
            <section className="tests-panel" style={{ display: 'flex', flexDirection: 'column', height: 452, boxSizing: 'border-box', overflow: 'hidden' }}>
              <div className="tests-panel-header" style={{ flexShrink: 0 }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <IconNote width={14} height={14} style={{ color: '#6366f1' } as React.CSSProperties} />
                  Planos de teste
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  {(Object.entries(PLAN_LABEL) as [string, string][])
                    .filter(([s]) => (planStatusCounts[s] || 0) > 0)
                    .map(([s, label], i, arr) => {
                      const active = planStatusFilter === s;
                      const c = PLAN_COLOR[s] ?? '#94a3b8';
                      return (
                        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <button onClick={() => setPlanStatusFilter(active ? null : s)}
                            style={{ fontSize: 11, padding: '1px 7px', borderRadius: 99, border: `1px solid ${active ? c : c + '55'}`, background: active ? c : c + '18', color: active ? '#fff' : c, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {label} {planStatusCounts[s]}
                          </button>
                          {i < arr.length - 1 && <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>}
                        </span>
                      );
                    })}
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4 }} onClick={() => navigate('/testes/planos')}>Ver todos</button>
                </div>
              </div>
              {/* busca */}
              <div style={{ flexShrink: 0, marginBottom: 6 }}>
                <input type="text" value={planSearch} onChange={e => setPlanSearch(e.target.value)}
                  placeholder="Buscar plano…"
                  style={{ width: '100%', padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              {filteredPlans.length === 0 ? (
                <p className="tests-muted">{planSearch ? 'Nenhum plano encontrado.' : 'Nenhum plano no período.'}</p>
              ) : (
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
                  {filteredPlans.map(p => {
                    const col = PLAN_COLOR[p.status] ?? 'var(--text-muted)';
                    const isDone = p.status === 'finalizado' || p.status === 'cancelado';
                    const cardNum = azureIdForCard(p.cardId);
                    return (
                      <div key={p.id} onClick={() => setViewingPlan(p)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg-input)', borderRadius: 8, border: '1px solid var(--border)', borderLeft: `3px solid ${col}`, cursor: 'pointer', opacity: isDone ? 0.55 : 1, transition: 'background 0.12s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-input)')}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                            {cardNum && <span className="casos-tag" style={{ fontSize: 10, padding: '0 5px', color: 'var(--info)', borderColor: 'var(--info)' }}>#{cardNum}</span>}
                            <span>{formatDate(p.createdAt)}</span>
                          </div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: col, background: `${col}18`, border: `1px solid ${col}40`, borderRadius: 5, padding: '2px 7px', flexShrink: 0 }}>{PLAN_LABEL[p.status]}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Sessões exploratórias */}
            <section className="tests-panel" style={{ display: 'flex', flexDirection: 'column', height: 452, boxSizing: 'border-box', overflow: 'hidden' }}>
              <div className="tests-panel-header" style={{ flexShrink: 0 }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <IconLightbulb width={14} height={14} style={{ color: '#f59e0b' } as React.CSSProperties} />
                  Sessões exploratórias
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  {([
                    ['has_bug',     `Com bug`,     sessionTypeCounts.has_bug]     as const,
                    ['has_blocker', `Com bloqueio`, sessionTypeCounts.has_blocker] as const,
                    ['clean',       `Sem ocorr.`,  sessionTypeCounts.clean]       as const,
                  ] as const).filter(([,, cnt]) => cnt > 0).map(([key, label, cnt], i, arr) => {
                    const active = sessionTypeFilter === key;
                    const c = SESSION_TYPE_COLOR[key] ?? '#94a3b8';
                    return (
                      <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => setSessionTypeFilter(active ? null : key)}
                          style={{ fontSize: 11, padding: '1px 7px', borderRadius: 99, border: `1px solid ${active ? c : c + '55'}`, background: active ? c : c + '18', color: active ? '#fff' : c, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {label} {cnt}
                        </button>
                        {i < arr.length - 1 && <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>}
                      </span>
                    );
                  })}
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4 }} onClick={() => navigate('/testes/exploratorio')}>Ver todas</button>
                </div>
              </div>
              {/* busca */}
              <div style={{ flexShrink: 0, marginBottom: 8 }}>
                <input type="text" value={sessionSearch} onChange={e => setSessionSearch(e.target.value)}
                  placeholder="Buscar sessão…"
                  style={{ width: '100%', padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              {filteredSessions.length === 0 ? (
                <p className="tests-muted">{sessionSearch ? 'Nenhuma sessão encontrada.' : 'Nenhuma sessão no período.'}</p>
              ) : (
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
                  {filteredSessions.map(s => {
                    const bugs = s.notes.filter(n => n.noteType === 'bug' || n.bugId).length;
                    const blockers = s.notes.filter(n => n.noteType === 'blocker').length;
                    const ideas = s.notes.filter(n => n.noteType === 'idea' || n.noteType === 'improvement').length;
                    const mins = Math.round(s.durationSeconds / 60);
                    const isClosed = s.status === 'closed';
                    const borderCol = isClosed ? '#94a3b8' : '#10b981';
                    const cardNum = azureIdForPlan(s.planId);
                    return (
                      <div key={s.id} onClick={() => setViewingSession(s)}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', background: 'var(--bg-input)', borderRadius: 8, border: '1px solid var(--border)', borderLeft: `3px solid ${borderCol}`, cursor: 'pointer', opacity: isClosed ? 0.55 : 1, transition: 'background 0.12s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-input)')}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.charter || 'Sem charter'}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                            {cardNum && <span className="casos-tag" style={{ fontSize: 10, padding: '0 5px', color: 'var(--info)', borderColor: 'var(--info)' }}>#{cardNum}</span>}
                            <span>{formatDate(s.createdAt)}</span>
                            <span>· {mins > 0 ? `${mins}min` : '—'}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                          {bugs > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--error)', background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 5, padding: '1px 6px' }}>{bugs} bug{bugs > 1 ? 's' : ''}</span>}
                          {blockers > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#f97316', background: '#f9731618', border: '1px solid #f9731630', borderRadius: 5, padding: '1px 6px' }}>{blockers} bloq.</span>}
                          {ideas > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', background: '#f59e0b18', border: '1px solid #f59e0b30', borderRadius: 5, padding: '1px 6px' }}>{ideas} ideia{ideas > 1 ? 's' : ''}</span>}
                          {bugs === 0 && blockers === 0 && ideas === 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.notes.length} nota{s.notes.length !== 1 ? 's' : ''}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* ── Azure Work Items ── */}
          {azureItems.length > 0 && (() => {
            const azBugs = filteredAzureItems.filter(i => i.type === 'bug')
              .sort((a, b) => {
                const so = (bugSortOrd[a.defect?.status ?? ''] ?? 9) - (bugSortOrd[b.defect?.status ?? ''] ?? 9);
                return so !== 0 ? so : b.azureId - a.azureId;
              });
            const azCards = filteredAzureItems.filter(i => i.type === 'card')
              .sort((a, b) => {
                const closedA = a.card?.status === 'concluida' ? 1 : 0;
                const closedB = b.card?.status === 'concluida' ? 1 : 0;
                const so = closedA - closedB;
                return so !== 0 ? so : b.azureId - a.azureId;
              });
            return (
              <section className="tests-panel" style={{ display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden' }}>
                <div className="tests-panel-header" style={{ flexShrink: 0 }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <IconExternal width={14} height={14} style={{ color: '#0078d4' } as React.CSSProperties} />
                    Comentários Azure
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <input type="text" value={azureSearch} onChange={e => setAzureSearch(e.target.value)}
                      placeholder="Buscar por ID ou título…"
                      style={{ flex: 1, minWidth: 0, padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate('/testes/azure-cards')}>Ver todos</button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, height: 400, minHeight: 0 }}>

                  {/* Bugs */}
                  <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--border)', paddingRight: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexShrink: 0 }}>
                      <IconBug width={12} height={12} style={{ color: '#ef4444' } as React.CSSProperties} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Bugs</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', background: '#ef444418', border: '1px solid #ef444440', borderRadius: 99, padding: '0 7px', marginLeft: 'auto' }}>{azBugs.length}</span>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
                      {azBugs.length === 0 ? (
                        <p className="tests-muted">{azureSearch ? 'Nenhum resultado.' : 'Nenhum bug Azure.'}</p>
                      ) : azBugs.map(item => {
                        const isClosed = item.defect?.status === 'closed';
                        return (
                          <div key={`bug-${item.azureId}`} onClick={() => setViewingAzureItem(item)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg-input)', borderRadius: 8, border: '1px solid var(--border)', borderLeft: '3px solid #ef4444', cursor: 'pointer', opacity: isClosed ? 0.55 : 1, transition: 'background 0.12s', flexShrink: 0 }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-input)')}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', flexShrink: 0 }}>#{item.azureId}</span>
                            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                            {item.linkedItems.slice(0, 1).map(l => (
                              <span key={l.azureId} style={{ fontSize: 10, fontWeight: 600, color: AZ_TYPE_COLOR[l.type], background: `${AZ_TYPE_COLOR[l.type]}18`, border: `1px solid ${AZ_TYPE_COLOR[l.type]}40`, borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                                #{l.azureId}
                              </span>
                            ))}
                            {item.defect && (
                              <span className={`tests-badge def-${item.defect.status}`} style={{ fontSize: 10, flexShrink: 0 }}>
                                {DEFECT_STATUS_LABEL[item.defect.status]}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* User Stories */}
                  <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexShrink: 0 }}>
                      <IconNote width={12} height={12} style={{ color: '#6366f1' } as React.CSSProperties} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>User Stories</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#6366f1', background: '#6366f118', border: '1px solid #6366f140', borderRadius: 99, padding: '0 7px', marginLeft: 'auto' }}>{azCards.length}</span>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
                      {azCards.length === 0 ? (
                        <p className="tests-muted">{azureSearch ? 'Nenhum resultado.' : 'Nenhuma User Story Azure.'}</p>
                      ) : azCards.map(item => {
                        const isClosed = item.card?.status === 'concluida';
                        return (
                          <div key={`card-${item.azureId}`} onClick={() => setViewingAzureItem(item)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg-input)', borderRadius: 8, border: '1px solid var(--border)', borderLeft: '3px solid #6366f1', cursor: 'pointer', opacity: isClosed ? 0.55 : 1, transition: 'background 0.12s', flexShrink: 0 }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-input)')}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', flexShrink: 0 }}>#{item.azureId}</span>
                            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                            {item.linkedItems.slice(0, 1).map(l => (
                              <span key={l.azureId} style={{ fontSize: 10, fontWeight: 600, color: AZ_TYPE_COLOR[l.type], background: `${AZ_TYPE_COLOR[l.type]}18`, border: `1px solid ${AZ_TYPE_COLOR[l.type]}40`, borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                                #{l.azureId}
                              </span>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </section>
            );
          })()}

          {/* ── Alerta crítico se há bugs críticos ── */}
          {d.criticalDefects > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 10 }}>
              <IconAlertTriangle width={16} height={16} style={{ color: 'var(--error)', flexShrink: 0 } as React.CSSProperties} />
              <span style={{ fontSize: 13, color: 'var(--error)', fontWeight: 600 }}>
                {d.criticalDefects} bug{d.criticalDefects > 1 ? 's' : ''} crítico{d.criticalDefects > 1 ? 's' : ''} em aberto — requer atenção imediata.
              </span>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', color: 'var(--error)', borderColor: 'var(--error-border)' }} onClick={() => navigate('/testes/defeitos')}>Ver bugs</button>
            </div>
          )}
        </div>
      )}
    </TestsLayout>
  );
}

function KpiCard({ label, value, sub, icon, color }: { label: string; value: number | string; sub?: string; icon?: React.ReactNode; color?: string }) {
  return (
    <div className="tests-card" style={{ position: 'relative', overflow: 'hidden' }}>
      {icon && (
        <div style={{ position: 'absolute', top: 8, right: 10, width: 34, height: 34, borderRadius: 10, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          {icon}
        </div>
      )}
      <span className="tests-card-label">{label}</span>
      <span className="tests-card-value" style={{ color }}>{value}</span>
      {sub && <span className="tests-card-hint">{sub}</span>}
    </div>
  );
}

/* ── Modal de detalhe da sessão exploratória ── */
function SessionDetailModal({ session, plans, onClose, onUpdated }: {
  session: ExploratorySession;
  plans: TestPlan[];
  onClose: () => void;
  onUpdated: (s: ExploratorySession) => void;
}) {
  const [editingStatus, setEditingStatus] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const linkedPlan = session.planId ? plans.find(p => p.id === session.planId) : null;
  const mins = Math.round(session.durationSeconds / 60);

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === session.status) return;
    setSavingStatus(true);
    const updated = { ...session, status: newStatus as ExploratorySession['status'] };
    const ok = await saveSession(updated);
    setSavingStatus(false);
    if (ok) { onUpdated(updated); setEditingStatus(false); showToast('Status atualizado.', 'success'); }
    else showToast('Erro ao salvar status.', 'error');
  };
  const bugsCount     = session.notes.filter(n => n.noteType === 'bug'     || n.bugId).length;
  const blockersCount = session.notes.filter(n => n.noteType === 'blocker').length;
  const ideasCount    = session.notes.filter(n => n.noteType === 'idea'    || n.noteType === 'improvement').length;

  return (
    <Modal large title={
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <IconLightbulb width={16} height={16} style={{ color: '#f59e0b', flexShrink: 0 } as React.CSSProperties} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.charter || 'Sessão exploratória'}</span>
      </div>
    } onClose={onClose} footer={<><span style={{ flex: 1 }} /><button className="btn btn-ghost" onClick={onClose}>Fechar</button></>}>
      <div className="case-detail">
        <header className="case-detail-header">
          <div className="case-detail-facts">
            <div className="fact">
              <span className="fact-label">Status</span>
              <span className="fact-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {editingStatus ? (
                  <>
                    <select value={session.status} disabled={savingStatus} autoFocus onChange={e => void handleStatusChange(e.target.value)}
                      style={{ fontSize: 12, fontWeight: 700, color: SESSION_STATUS_COLOR[session.status], background: `${SESSION_STATUS_COLOR[session.status]}18`, border: `1px solid ${SESSION_STATUS_COLOR[session.status]}`, borderRadius: 5, padding: '2px 8px', cursor: 'pointer', outline: 'none' }}>
                      {Object.entries(SESSION_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <button onClick={() => setEditingStatus(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}>
                      <IconX width={13} height={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 12, fontWeight: 700, color: SESSION_STATUS_COLOR[session.status], background: `${SESSION_STATUS_COLOR[session.status]}18`, border: `1px solid ${SESSION_STATUS_COLOR[session.status]}40`, borderRadius: 5, padding: '2px 8px' }}>{SESSION_STATUS_LABEL[session.status]}</span>
                    <button onClick={() => setEditingStatus(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 1 }} title="Editar status">
                      <IconPencil width={13} height={13} />
                    </button>
                  </>
                )}
              </span>
            </div>
            <div className="fact"><span className="fact-label">Data</span><span className="fact-value">{formatDate(session.createdAt)}</span></div>
            <div className="fact"><span className="fact-label">Duração</span><span className="fact-value">{mins > 0 ? `${mins}min` : '—'}</span></div>
            {linkedPlan && <div className="fact"><span className="fact-label">Plano</span><span className="fact-value">{linkedPlan.name}</span></div>}
            {session.ambiente && <div className="fact"><span className="fact-label">Ambiente</span><span className="fact-value"><span className="run-ambiente">{session.ambiente}</span></span></div>}
            {session.company && <div className="fact"><span className="fact-label">Company</span><span className="fact-value"><span className="run-company">{COMPANY_LABEL[session.company] ?? session.company}</span></span></div>}
            {session.versaoBackoffice && <div className="fact"><span className="fact-label">Backoffice</span><span className="fact-value">{session.versaoBackoffice}</span></div>}
            {session.versaoB2b && <div className="fact"><span className="fact-label">Portal B2B</span><span className="fact-value">{session.versaoB2b}</span></div>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {bugsCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--error)', background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 6, padding: '2px 8px' }}>{bugsCount} bug{bugsCount > 1 ? 's' : ''}</span>}
            {blockersCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316', background: '#f9731618', border: '1px solid #f9731630', borderRadius: 6, padding: '2px 8px' }}>{blockersCount} bloqueio{blockersCount > 1 ? 's' : ''}</span>}
            {ideasCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', background: '#f59e0b18', border: '1px solid #f59e0b30', borderRadius: 6, padding: '2px 8px' }}>{ideasCount} ideia{ideasCount > 1 ? 's' : ''}</span>}
          </div>
        </header>

        <section className="case-detail-block">
          <h4>Notas ({session.notes.length})</h4>
          {session.notes.length === 0 ? (
            <p className="tests-muted">Nenhuma nota registrada.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {session.notes.map((note, i) => {
                const nType = note.noteType ?? 'note';
                const col = NOTE_COLOR[nType] ?? 'var(--text-secondary)';
                return (
                  <div key={i} style={{ borderRadius: 8, padding: '9px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderLeft: `3px solid ${col}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: col, background: `${col}18`, borderRadius: 4, padding: '1px 6px' }}>{NOTE_LABEL[nType] ?? nType}</span>
                      {note.at && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{note.at}</span>}
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{note.text}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

/* ── Modal de detalhe do plano de teste ── */
function PlanDetailModal({ plan, cards, sprints, milestones, runs, onClose, onUpdated }: {
  plan: TestPlan;
  cards: Card[]; sprints: Sprint[]; milestones: Milestone[];
  runs: EnrichedRun[];
  onClose: () => void;
  onUpdated: (p: TestPlan) => void;
}) {
  const [cardOpen, setCardOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const linkedCard      = plan.cardId      ? cards.find(c  => c.id === plan.cardId)        : null;
  const linkedSprint    = plan.sprintId    ? sprints.find(s => s.id === plan.sprintId)      : null;
  const linkedMilestone = plan.milestoneId ? milestones.find(m => m.id === plan.milestoneId) : null;
  const planRuns = runs.filter(r => r.planId === plan.id);
  const col = PLAN_COLOR[plan.status] ?? 'var(--text-muted)';

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === plan.status) return;
    setSavingStatus(true);
    const updated = { ...plan, status: newStatus as TestPlan['status'] };
    const ok = await savePlan(updated);
    setSavingStatus(false);
    if (ok) { onUpdated(updated); setEditingStatus(false); showToast('Status atualizado.', 'success'); }
    else showToast('Erro ao salvar status.', 'error');
  };

  const cardFields = linkedCard
    ? [
        { label: 'Objetivo e Valor',                value: linkedCard.objetivo },
        { label: 'Resumo da Demanda',               value: linkedCard.resumo   },
        { label: 'Checklist / Critérios de Aceite', value: linkedCard.checklist },
      ].filter(f => f.value?.trim())
    : [];

  return (
    <Modal large title={
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <IconNote width={16} height={16} style={{ color: '#6366f1', flexShrink: 0 } as React.CSSProperties} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plan.name}</span>
      </div>
    } onClose={onClose} footer={<><span style={{ flex: 1 }} /><button className="btn btn-ghost" onClick={onClose}>Fechar</button></>}>
      <div className="case-detail">
        <header className="case-detail-header">
          <div className="case-detail-facts">
            <div className="fact">
              <span className="fact-label">Status</span>
              <span className="fact-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {editingStatus ? (
                  <>
                    <select
                      value={plan.status}
                      disabled={savingStatus}
                      onChange={e => void handleStatusChange(e.target.value)}
                      autoFocus
                      style={{ fontSize: 12, fontWeight: 700, color: col, background: `${col}18`, border: `1px solid ${col}`, borderRadius: 5, padding: '2px 8px', cursor: 'pointer', outline: 'none' }}
                    >
                      {Object.entries(PLAN_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <button onClick={() => setEditingStatus(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}>
                      <IconX width={13} height={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 12, fontWeight: 700, color: col, background: `${col}18`, border: `1px solid ${col}40`, borderRadius: 5, padding: '2px 8px' }}>{PLAN_LABEL[plan.status]}</span>
                    <button onClick={() => setEditingStatus(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 1 }} title="Editar status">
                      <IconPencil width={13} height={13} />
                    </button>
                  </>
                )}
              </span>
            </div>
            <div className="fact"><span className="fact-label">Criado em</span><span className="fact-value">{formatDate(plan.createdAt)}</span></div>
            <div className="fact"><span className="fact-label">Execuções</span><span className="fact-value">{planRuns.length}</span></div>
          </div>

          {(linkedCard || linkedSprint || linkedMilestone) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12, padding: '10px 14px', background: 'var(--surface-alt, var(--bg-input))', borderRadius: 8, border: '1px solid var(--border)' }}>
              {linkedCard && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ fontWeight: 600, minWidth: 100, color: 'var(--text-secondary)', fontSize: 12 }}>Card</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {linkedCard.azureId && <span className="casos-tag">#{linkedCard.azureId}</span>}
                    <span>{linkedCard.title}</span>
                  </span>
                </div>
              )}
              {linkedSprint && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ fontWeight: 600, minWidth: 100, color: 'var(--text-secondary)', fontSize: 12 }}>Sprint</span>
                  <span>{linkedSprint.name}</span>
                </div>
              )}
              {linkedMilestone && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ fontWeight: 600, minWidth: 100, color: 'var(--text-secondary)', fontSize: 12 }}>Marco</span>
                  <span>{linkedMilestone.name}</span>
                </div>
              )}
            </div>
          )}
        </header>

        {/* ── Conteúdo do card (accordion, fechado por padrão) ── */}
        {cardFields.length > 0 && (
          <section className="case-detail-block" style={{ padding: 0, border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
            <button
              onClick={() => setCardOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-input)', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Conteúdo do Card</span>
              <IconChevron width={14} height={14} style={{ transform: cardOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--text-muted)', flexShrink: 0 } as React.CSSProperties} />
            </button>
            {cardOpen && (
              <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
                {cardFields.map(f => (
                  <div key={f.label}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>{f.label}</div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{f.value}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Execuções ── */}
        {planRuns.length > 0 && (
          <section className="case-detail-block">
            <h4>Execuções ({planRuns.length})</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {planRuns.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-input)', borderRadius: 8, border: '1px solid var(--border)', borderLeft: `3px solid ${r.status === 'closed' ? 'var(--border)' : 'var(--info)'}`, opacity: r.status === 'closed' ? 0.6 : 1 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8 }}>
                      {r.ambiente && <span>{r.ambiente}</span>}
                      {r.company && <span>{COMPANY_LABEL[r.company] ?? r.company}</span>}
                      <span>{formatDate(r.createdAt)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {r.total > 0 && (
                      <div style={{ display: 'flex', gap: 4, fontSize: 11 }}>
                        <span style={{ color: 'var(--success)', fontWeight: 700 }}>{r.passed}✓</span>
                        <span style={{ color: 'var(--error)', fontWeight: 700 }}>{r.failed}✗</span>
                      </div>
                    )}
                    {r.passRate !== null && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: r.passRate >= 80 ? 'var(--success)' : r.passRate >= 50 ? 'var(--warning)' : 'var(--error)', minWidth: 36, textAlign: 'right' }}>{r.passRate}%</span>
                    )}
                    <span className={`tests-badge status-${r.status}`}>{RUN_STATUS_LABEL[r.status]}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}

/* ── Modal de detalhe do bug ── */
function BugDetailModal({ defect, plans, cards, sprints, milestones, runsMap, originMap, authorName, authorInitials, azureConfigs, myPat, onClose, onUpdated, onLightbox }: {
  defect: Defect;
  plans: TestPlan[]; cards: Card[]; sprints: Sprint[]; milestones: Milestone[];
  runsMap: Map<string, TestRun>; originMap: Map<string, { caseTitle: string; runName: string }>;
  authorName: string; authorInitials: string;
  azureConfigs: AzureConfig[]; myPat: string;
  onClose: () => void;
  onUpdated: (d: Defect) => void;
  onLightbox: (ev: { url: string; name: string }) => void;
}) {
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [azureComments, setAzureComments] = useState<AzureComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [myAzureId, setMyAzureId] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const azureCfg = azureConfigs.find(c => c.id === defect.azureConfigId);
  const apiCfg = azureCfg && myPat ? { organization: azureCfg.organization, project: azureCfg.project, pat: myPat } : null;
  const hasAzure = defect.azureWorkItemId != null && apiCfg != null;
  const isClosed = defect.status === 'closed';

  const objectUrls = useRef<string[]>([]);
  useEffect(() => () => { objectUrls.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  /* Troca imagens de anexos Azure (protegidas por PAT) por blob URLs p/ exibir no comentário. */
  const inlineComments = async (cms: AzureComment[]): Promise<AzureComment[]> => {
    if (!apiCfg) return cms;
    return Promise.all(cms.map(async (cm) => {
      const tags = extractImgTags(cm.text ?? '').filter(t => /_apis\/wit\/attachments/i.test(t.url));
      if (tags.length === 0) return cm;
      let text = cm.text;
      for (const { raw, url } of tags) {
        try {
          const blob = await downloadAttachment(apiCfg, url);
          const obj = URL.createObjectURL(blob);
          objectUrls.current.push(obj);
          text = text.split(raw).join(obj);
        } catch { /* mantém original */ }
      }
      return { ...cm, text };
    }));
  };

  /* Clique em imagem (descrição/comentário) abre o lightbox do dashboard. */
  const onImgClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'IMG') { e.preventDefault(); const img = t as HTMLImageElement; onLightbox({ url: img.src, name: img.alt || 'Imagem' }); }
  };

  useEffect(() => {
    if (!hasAzure) return;
    setLoadingComments(true);
    Promise.all([
      getComments(apiCfg!, defect.azureWorkItemId!),
      getMyAzureId(apiCfg!),
    ])
      .then(async ([cms, azId]) => { setAzureComments(await inlineComments(cms)); setMyAzureId(azId); })
      .catch(() => {})
      .finally(() => setLoadingComments(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defect.azureWorkItemId, defect.azureConfigId]);

  const scf = defect.azureCustomFields as Record<string, string | undefined>;

  const linkedRun = defect.runResultId ? runsMap.get(defect.runResultId) ?? null : null;
  const origin = defect.runResultId ? originMap.get(defect.runResultId) ?? null : null;

  const linkedCard = defect.cardId ? cards.find(c => c.id === defect.cardId) : null;
  const linkedPlan = defect.planId ? plans.find(p => p.id === defect.planId) : null;
  const linkedSprint = linkedPlan?.sprintId ? sprints.find(s => s.id === linkedPlan.sprintId)
    : (linkedCard?.sprintId ? sprints.find(s => s.id === linkedCard.sprintId) : null);
  const linkedMilestone = linkedPlan?.milestoneId ? milestones.find(m => m.id === linkedPlan.milestoneId)
    : (linkedSprint?.milestoneId ? milestones.find(m => m.id === linkedSprint.milestoneId) : null);

  const sAmb = linkedRun?.ambiente ?? scf._s_amb ?? null;
  const sCo  = linkedRun?.company  ?? scf._s_co  ?? null;
  const sBo  = linkedRun?.versaoBackoffice ?? scf._s_bo  ?? null;
  const sB2b = linkedRun?.versaoB2b        ?? scf._s_b2b ?? null;
  const sCharter = scf._s_charter ?? null;
  const hasContext = !!(linkedCard || linkedPlan || linkedSprint || linkedMilestone || sAmb || sCo || sBo || sB2b);

  const handleStatusChange = (status: DefectStatus) => {
    onUpdated({ ...defect, status });
    showToast('Status atualizado.', 'success');
  };

  const handleAddComment = async () => {
    if (!comment.trim() || !apiCfg || defect.azureWorkItemId == null) return;
    setSaving(true);
    try {
      const c = await addComment(apiCfg, defect.azureWorkItemId, comment.trim());
      setAzureComments(prev => [...prev, c]);
      setComment('');
      showToast('Comentário enviado para o Azure.', 'success');
    } catch {
      showToast('Erro ao enviar comentário.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const sevColor = SEV_COLOR[defect.severity] ?? 'var(--text-muted)';

  return (
    <Modal large title={
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <IconBug width={16} height={16} style={{ color: sevColor, flexShrink: 0 } as React.CSSProperties} />
        <span style={{ wordBreak: 'break-word' }}>{defect.title}</span>
      </div>
    } onClose={onClose} footer={
      <><span style={{ flex: 1 }} /><button className="btn btn-ghost" onClick={onClose}>Fechar</button></>
    }>
      <div className="case-detail">

        {/* ── Header: fatos + contexto + autor ── */}
        <header className="case-detail-header">
          <div className="case-detail-facts">
            <div className="fact">
              <span className="fact-label">Severidade</span>
              <span className="fact-value"><span className={`tests-chip prio-${defect.severity}`}>{DEFECT_SEVERITY_LABEL[defect.severity]}</span></span>
            </div>
            <div className="fact">
              <span className="fact-label">Status</span>
              <span className="fact-value">
                <select value={defect.status} onChange={e => handleStatusChange(e.target.value as DefectStatus)}
                  style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <option value="pending_azure">Ag. Azure</option>
                  <option value="open">Aberto</option>
                  <option value="in_progress">Em andamento</option>
                  <option value="resolved">Resolvido</option>
                  <option value="closed">Fechado</option>
                </select>
              </span>
            </div>
            <div className="fact">
              <span className="fact-label">Origem</span>
              <span className="fact-value">
                {origin
                  ? `${origin.caseTitle} · ${origin.runName}`
                  : sCharter
                    ? <><span className="casos-tag" style={{ fontSize: 11 }}>Exploratório</span> {sCharter}</>
                    : <span className="tests-muted">Manual</span>}
              </span>
            </div>
            <div className="fact">
              <span className="fact-label">Criado em</span>
              <span className="fact-value">{formatDate(defect.createdAt)}</span>
            </div>
          </div>

          {/* Contexto: card, plano, sprint, marco, ambiente, company, versões */}
          {hasContext && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12, padding: '10px 14px', background: 'var(--surface-alt, var(--bg-input))', borderRadius: 8, border: '1px solid var(--border)' }}>
              {linkedCard && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ fontWeight: 600, minWidth: 110, color: 'var(--text-secondary)', fontSize: 12 }}>Card</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {linkedCard.azureId && <span className="casos-tag">#{linkedCard.azureId}</span>}
                    <span>{linkedCard.title}</span>
                  </span>
                </div>
              )}
              {linkedPlan && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ fontWeight: 600, minWidth: 110, color: 'var(--text-secondary)', fontSize: 12 }}>Plano de Teste</span>
                  <span>{linkedPlan.name}</span>
                </div>
              )}
              {linkedSprint && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ fontWeight: 600, minWidth: 110, color: 'var(--text-secondary)', fontSize: 12 }}>Sprint</span>
                  <span>{linkedSprint.name}</span>
                </div>
              )}
              {linkedMilestone && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ fontWeight: 600, minWidth: 110, color: 'var(--text-secondary)', fontSize: 12 }}>Marco</span>
                  <span>{linkedMilestone.name}</span>
                </div>
              )}
              {sAmb && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ fontWeight: 600, minWidth: 110, color: 'var(--text-secondary)', fontSize: 12 }}>Ambiente</span>
                  <span className="run-ambiente">{sAmb}</span>
                </div>
              )}
              {sCo && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ fontWeight: 600, minWidth: 110, color: 'var(--text-secondary)', fontSize: 12 }}>Company</span>
                  <span className="run-company">{COMPANY_LABEL[sCo] ?? sCo}</span>
                </div>
              )}
              {sBo && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ fontWeight: 600, minWidth: 110, color: 'var(--text-secondary)', fontSize: 12 }}>Backoffice</span>
                  <span>{sBo}</span>
                </div>
              )}
              {sB2b && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ fontWeight: 600, minWidth: 110, color: 'var(--text-secondary)', fontSize: 12 }}>Portal B2B</span>
                  <span>{sB2b}</span>
                </div>
              )}
            </div>
          )}

          {/* Autor */}
          <div className="case-detail-meta">
            <span className="case-detail-avatar" aria-hidden>{authorInitials}</span>
            <div className="case-detail-author">
              <span className="case-detail-author-name">{authorName}</span>
              <span className="case-detail-author-date">Criado em {formatDate(defect.createdAt)}</span>
            </div>
          </div>
        </header>

        {/* ── Azure Work Item ── */}
        {defect.azureWorkItemId && (
          <section className="case-detail-block">
            <h4>Azure Work Item</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="casos-tag" style={{ fontSize: 13 }}>#{defect.azureWorkItemId}</span>
              {defect.azureState && (
                <span className={`tests-badge azure-state-${/done|closed|resolved/i.test(defect.azureState) ? 'done' : /active|progress/i.test(defect.azureState) ? 'active' : 'new'}`} style={{ fontSize: 12 }}>
                  {defect.azureState}
                </span>
              )}
              {defect.azureSyncedAt && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Sincronizado em {formatDate(defect.azureSyncedAt)}</span>}
            </div>
          </section>
        )}

        {/* ── Descrição ── */}
        {defect.description && (
          <section className="case-detail-block">
            <h4>Descrição</h4>
            {/<[a-z!/][\s\S]*>/i.test(defect.description)
              ? <div className="defect-desc-html" onClick={onImgClick} dangerouslySetInnerHTML={{ __html: defect.description }} />
              : <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{defect.description}</p>}
          </section>
        )}

        {/* ── Evidências ── */}
        {defect.evidence && defect.evidence.length > 0 && (
          <section className="case-detail-block">
            <h4>Evidências ({defect.evidence.length})</h4>
            <div className="runner-evidence-list">
              {defect.evidence.map((ev, i) => (
                <div className={`evi${isImage(ev.url) ? ' evi--img' : ''}`} key={i}>
                  {isImage(ev.url) ? (
                    <>
                      <button type="button" className="evi-thumb" onClick={() => onLightbox(ev)} title={ev.name}>
                        <img src={ev.url} alt={ev.name} />
                      </button>
                      <span className="evi-cap" title={ev.name}>{ev.name}</span>
                    </>
                  ) : (
                    <a className="evi-link" href={ev.url} target="_blank" rel="noreferrer" title={ev.name}>
                      <IconExternal /> {ev.name}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Comentários Azure ── */}
        {hasAzure && (
          <section className="case-detail-block">
            <h4>Comentários Azure ({loadingComments ? '…' : azureComments.length})</h4>
            {loadingComments ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Carregando comentários…</p>
            ) : azureComments.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Nenhum comentário.</p>
            ) : (
              <div onClick={onImgClick} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {azureComments.map(cm => {
                  const isMe = !!myAzureId && cm.createdBy?.id === myAzureId;
                  const name = cm.createdBy?.displayName ?? 'Azure';
                  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
                  return (
                    <div key={cm.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexDirection: isMe ? 'row-reverse' : 'row', maxWidth: '85%' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: isMe ? 'var(--accent)' : '#6c757d', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                          {initials}
                        </div>
                        <div style={{ background: isMe ? 'var(--accent)' : 'var(--bg-secondary)', color: isMe ? '#fff' : 'var(--text-primary)', borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '10px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
                          {!isMe && <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, opacity: 0.7 }}>{name}</div>}
                          <p className="azure-comment-text" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: cm.text }} />
                          <div style={{ fontSize: 11, marginTop: 5, opacity: 0.6, textAlign: isMe ? 'right' : 'left' }}>
                            <span style={{ fontWeight: 600 }}>{name}</span> · {formatDate(cm.createdDate)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!isClosed ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" value={comment} onChange={e => setComment(e.target.value)}
                  placeholder="Adicionar comentário…"
                  onKeyDown={e => { if (e.key === 'Enter' && !saving) void handleAddComment(); }}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary btn-sm" onClick={() => void handleAddComment()} disabled={saving || !comment.trim()}>
                  {saving ? '…' : 'Enviar'}
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>Bug fechado — não é possível adicionar comentários.</p>
            )}
          </section>
        )}

      </div>
    </Modal>
  );
}
