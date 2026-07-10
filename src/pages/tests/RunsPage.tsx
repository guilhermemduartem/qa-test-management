/* ═══════════════════════════════════════════════════════════
   RunsPage — Execuções (test runs).
   Lista de execuções + criação a partir de casos selecionados +
   runner: marcação rápida (passou/falhou/bloqueado/pulado),
   cronômetro por caso, evidências (upload real), comentário e
   vínculo de defeito.

   Segue o padrão das telas de Testes (ver CasosPage): tooltip de
   ajuda, ícones SVG, coluna de responsável, exclusão só do dono
   (assignedTo) ou admin.
   ═══════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams, useNavigate as useRRNavigate } from 'react-router-dom';
import { saveCurrentReport, setCachedImageDataUrl } from '../../lib/storage';
import { createEmptyReport } from '../../lib/utils';
import type { Report } from '../../types';
import { listAzureConfigs, getMyAzureSettings } from '../../lib/azureManagement';
import { getComments, getWorkItem, getMyAzureId, AZURE_CLOSED_STATES, inlineCommentImages } from '../../lib/azureDevOps';
import type { AzureConfig, AzureComment } from '../../types/azure';
import { TestsLayout } from './TestsLayout';
import { ProjectBar } from '../../components/tests/ProjectBar';
import { Modal } from '../../components/Modal';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useUserNames } from '../../hooks/useUserNames';
import {
  IconPlus, IconTrash, IconSearch, IconArrowLeft, IconPlay, IconPause,
  IconUpload, IconExternal, IconBug, IconX, IconChevron, IconFolder, IconPencil, IconHistory, IconGrip, IconCopy, IconCheck,
} from '../../components/tests/icons';
import { PhotoUploader } from '../../components/tests/PhotoUploader';
import { copyText } from '../../components/tools/CopyButton';
import { can } from '../../lib/auth';
import { showToast } from '../../lib/toast';
import { formatDate } from '../../lib/utils';
import {
  genId, currentUserId,
  listCases, listSuites, listRuns, saveRun, deleteRun,
  listRunResults, saveRunResult, bulkInsertRunResults, deleteRunResult,
  listPlans, listCards, listSprints, listMilestones, listDefects, saveDefect, uploadEvidence,
} from '../../lib/testManagement';
import {
  RUN_STATUS_LABEL, RESULT_STATUS_LABEL,
  type TestCase, type TestSuite, type TestRun, type TestRunResult, type TestPlan,
  type ResultStatus, type Evidence, type Defect, type DefectSeverity, type StepResult, type TestStep,
  type Card, type Sprint, type Milestone, DEFECT_STATUS_LABEL,
} from '../../types/tests';

const AMBIENTES = [
  { label: 'DEV ORION', value: 'DEV ORION' },
  { label: 'DEV POLARIS', value: 'DEV POLARIS' },
  { label: 'TST', value: 'TST' },
  { label: 'QA', value: 'QA' },
  { label: 'STG', value: 'STG' },
  { label: 'PROD', value: 'PROD' },
];

const COMPANIES = [
  { label: 'Bedsonline', value: '7' },
  { label: 'Cativa', value: '8' },
  { label: 'Flot', value: '10' },
  { label: 'Smiles', value: '12' },
  { label: 'Azul', value: '17' },
];

const QUICK: { status: ResultStatus; label: string }[] = [
  { status: 'passed', label: 'Passou' },
  { status: 'failed', label: 'Falhou' },
  { status: 'blocked', label: 'Bloqueado' },
  { status: 'skipped', label: 'Pulado' },
];

/** Garante um array de stepResults alinhado (1:1) aos passos do caso. */
function ensureStepResults(r: TestRunResult, count: number): StepResult[] {
  const base = r.stepResults ?? [];
  if (base.length === count) return base;
  const out = base.slice(0, count);
  while (out.length < count) out.push({ status: 'untested', comment: '', evidence: [] });
  return out;
}

const HELP_LIST = (
  <>
    <strong>Como usar esta tela</strong>
    <ul>
      <li>Uma <b>execução</b> roda um conjunto de casos. Clique numa execução para abrir o <b>runner</b>.</li>
      <li>No runner você marca <b>Passou / Falhou / Bloqueado / Pulado</b>, cronometra, anexa evidências e registra defeitos.</li>
      <li>Só quem <b>criou</b> a execução (ou um admin) pode <b>excluí-la</b>.</li>
    </ul>
  </>
);
const HELP_RUNNER = (
  <>
    <strong>Como executar</strong>
    <ul>
      <li>Marque o resultado de cada caso nos botões coloridos.</li>
      <li>Use o botão de <b>play</b> para cronometrar o tempo gasto no caso.</li>
      <li><b>Anexar evidência</b> envia prints/arquivos; em casos que falharam, <b>Registrar defeito</b>.</li>
      <li>Ao terminar, clique em <b>Fechar execução</b>.</li>
    </ul>
  </>
);

interface RunStats { total: number; passed: number; failed: number; blocked: number; skipped: number; untested: number; elapsed: number }
function summarize(res: TestRunResult[]): RunStats {
  const s: RunStats = { total: res.length, passed: 0, failed: 0, blocked: 0, skipped: 0, untested: 0, elapsed: 0 };
  res.forEach((x) => {
    s.elapsed += x.elapsedSeconds || 0;
    if (x.status === 'passed') s.passed++;
    else if (x.status === 'failed') s.failed++;
    else if (x.status === 'blocked') s.blocked++;
    else if (x.status === 'skipped') s.skipped++;
    else if (x.status === 'untested') s.untested++;
  });
  return s;
}
function fmtDuration(secs: number): string {
  const h = Math.floor(secs / 3600); const m = Math.floor((secs % 3600) / 60); const s = secs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function RunsPage() {
  const { projects, activeId, setActiveId, reload, loading } = useActiveProject();
  const { name: userName, initials: userInitials } = useUserNames();
  const [searchParams, setSearchParams] = useSearchParams();
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [azureConfigs, setAzureConfigs] = useState<AzureConfig[]>([]);
  const [myPat, setMyPat] = useState('');
  const [cards, setCards] = useState<Card[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [stats, setStats] = useState<Map<string, RunStats>>(new Map());
  const [active, setActive] = useState<TestRun | null>(null);
  const [seriesView, setSeriesView] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(() => !!(searchParams.get('run') || searchParams.get('series')));
  const [newModal, setNewModal] = useState(false);
  const [search, setSearch] = useState('');
  const [confirmDel, setConfirmDel] = useState<TestRun | null>(null);
  const [editRun, setEditRun] = useState<TestRun | null>(null);

  const podeCriar = can('create');
  const canDeleteRun = (r: TestRun) => r.assignedTo ? can('delete', r.assignedTo) : can('create');
  const canEditRun = (r: TestRun) => r.status !== 'closed' && can('edit', r.assignedTo ?? undefined);

  const goToRun = (run: TestRun) => { setActive(run); setSearchParams({ run: run.id }, { replace: true }); };
  const goToSeries = (sid: string) => { setSeriesView(sid); setSearchParams({ series: sid }, { replace: true }); };
  const goBack = () => {
    if (active) { setActive(null); seriesView ? setSearchParams({ series: seriesView }, { replace: true }) : setSearchParams({}, { replace: true }); }
    else if (seriesView) { setSeriesView(null); setSearchParams({}, { replace: true }); }
  };

  const loadProject = async (pid: string, skipRestore = false) => {
    const [r, c, s, p, ca, sp, ms] = await Promise.all([listRuns(pid), listCases(pid), listSuites(pid), listPlans(pid), listCards(pid), listSprints(pid), listMilestones(pid)]);
    setRuns(r); setCases(c); setSuites(s); setPlans(p); setCards(ca); setSprints(sp); setMilestones(ms);
    const res = await Promise.all(r.map((run) => listRunResults(run.id)));
    const m = new Map<string, RunStats>();
    r.forEach((run, i) => m.set(run.id, summarize(res[i])));
    setStats(m);
    if (!skipRestore) {
      const urlRun = searchParams.get('run');
      const urlSeries = searchParams.get('series');
      if (urlRun) { const found = r.find((x) => x.id === urlRun); if (found) setActive(found); }
      else if (urlSeries) { setSeriesView(urlSeries); }
    }
    setInitializing(false);
  };
  useEffect(() => {
    if (activeId) loadProject(activeId);
    else { setRuns([]); setCases([]); setSuites([]); setPlans([]); setCards([]); setSprints([]); setMilestones([]); setStats(new Map()); }
  }, [activeId]);

  useEffect(() => {
    listAzureConfigs().then(setAzureConfigs);
    getMyAzureSettings().then((s) => { if (s?.pat) setMyPat(s.pat); });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return runs;
    return runs.filter((r) => `${r.name} ${userName(r.assignedTo)}`.toLowerCase().includes(q));
  }, [runs, search, userName]);

  const latestCycleBySeries = useMemo(() => {
    const m = new Map<string, number>();
    runs.forEach((r) => m.set(r.seriesId, Math.max(m.get(r.seriesId) ?? 0, r.cycle)));
    return m;
  }, [runs]);
  const activeSeries = useMemo(() => new Set(runs.filter((r) => r.status !== 'closed').map((r) => r.seriesId)), [runs]);
  const canReTest = (r: TestRun) => podeCriar && r.status === 'closed' && r.cycle === latestCycleBySeries.get(r.seriesId) && !activeSeries.has(r.seriesId);

  // agrupa execuções por série (um card por série na lista principal)
  const seriesGroups = useMemo(() => {
    const m = new Map<string, TestRun[]>();
    filtered.forEach((r) => { if (!m.has(r.seriesId)) m.set(r.seriesId, []); m.get(r.seriesId)!.push(r); });
    return [...m.values()]
      .map((cycles) => {
        const sorted = [...cycles].sort((a, b) => b.cycle - a.cycle);
        const latest = sorted[0];
        return { seriesId: latest.seriesId, latest, cycles: sorted, hasActive: cycles.some((c) => c.status !== 'closed') };
      })
      .sort((a, b) => b.latest.createdAt.localeCompare(a.latest.createdAt));
  }, [filtered]);
  const activeGroups = seriesGroups.filter((g) => g.hasActive);
  const doneGroups = seriesGroups.filter((g) => !g.hasActive);

  // ciclos da série aberta (nível 2), ativo/mais novo primeiro
  const seriesCycles = useMemo(
    () => (seriesView ? runs.filter((r) => r.seriesId === seriesView).sort((a, b) => b.cycle - a.cycle) : []),
    [runs, seriesView],
  );

  const [retestTarget, setRetestTarget] = useState<TestRun | null>(null);

  const reTest = (run: TestRun) => {
    if (activeSeries.has(run.seriesId)) { showToast('Já existe um ciclo em andamento nesta série. Feche-o antes de re-testar.', 'warning'); return; }
    setRetestTarget(run);
  };

  const doReTest = async (run: TestRun, ctx: { ambiente: string; company: string; versaoBackoffice: string; versaoB2b: string }) => {
    setRetestTarget(null);
    const src = await listRunResults(run.id);
    if (!src.length) { showToast('Execução sem casos para re-testar.', 'warning'); return; }
    const maxCycle = latestCycleBySeries.get(run.seriesId) ?? run.cycle;
    const id = genId();
    const newRun: TestRun = {
      id, projectId: run.projectId, planId: run.planId, name: run.name,
      status: 'in_progress', assignedTo: currentUserId(), createdAt: new Date().toISOString(), closedAt: null,
      seriesId: run.seriesId, cycle: maxCycle + 1,
      ambiente: ctx.ambiente || null, company: ctx.company || null,
      versaoBackoffice: ctx.versaoBackoffice || null, versaoB2b: ctx.versaoB2b || null,
    };
    if (!(await saveRun(newRun))) return;
    const rows: TestRunResult[] = src.map((s, i) => ({ id: genId(), runId: id, caseId: s.caseId, status: 'untested', executedBy: null, executedAt: null, elapsedSeconds: 0, comment: '', evidence: [], position: i, stepResults: [] }));
    await bulkInsertRunResults(rows);
    showToast(`Ciclo ${maxCycle + 1} criado com ${rows.length} caso(s).`, 'success');
    if (activeId) await loadProject(activeId);
    goToRun(newRun);
  };

  const actions = <ProjectBar projects={projects} activeId={activeId} onChange={setActiveId} onCreated={reload} />;

  if (initializing) {
    return (
      <TestsLayout title="Execuções" activeTest="runs" actions={actions} help={HELP_LIST} loading>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', fontSize: 14 }}>Carregando…</div>
      </TestsLayout>
    );
  }

  if (active) {
    return (
      <TestsLayout title={`Execução — ${active.name}`} activeTest="runs" actions={actions} help={HELP_RUNNER} fluid loading={loading}>
        <Runner
          run={active} cases={cases} plans={plans} cards={cards} sprints={sprints} milestones={milestones}
          azureConfigs={azureConfigs} myPat={myPat}
          onBack={() => { goBack(); if (activeId) loadProject(activeId, true); }}
          onChanged={() => { if (activeId) loadProject(activeId); }}
          onRunUpdated={(updated) => setActive(updated)}
        />
      </TestsLayout>
    );
  }

  return (
    <TestsLayout title={seriesView ? (seriesCycles[0]?.name ?? 'Série') : 'Execuções'} activeTest="runs" actions={actions} help={HELP_LIST} loading={loading}>
      {!activeId ? (
        <div className="tests-empty"><h2>Selecione um projeto</h2><p>Escolha ou crie um projeto no seletor acima.</p></div>
      ) : seriesView ? (
        /* Nível 2 — ciclos da série (ativo primeiro, depois histórico) */
        <div className="series-view">
          <div className="series-head">
            <button className="btn btn-ghost btn-sm" onClick={() => goBack()}><IconArrowLeft /> Voltar</button>
            <span className="tests-muted">{seriesCycles.length} ciclo{seriesCycles.length > 1 ? 's' : ''} nesta série</span>
          </div>
          {seriesCycles.length === 0 ? (
            <div className="tests-empty"><p>Esta série não tem ciclos.</p></div>
          ) : (
            <div className="run-cards">
              {seriesCycles.map((r) => (
                <RunCard
                  key={r.id} run={r} chip={`Ciclo ${r.cycle}`} stats={stats.get(r.id)}
                  author={userName(r.assignedTo)} authorInitials={userInitials(r.assignedTo)}
                  canDelete={canDeleteRun(r)} canEdit={canEditRun(r)} canReTest={canReTest(r)}
                  onOpen={() => goToRun(r)} onDelete={() => setConfirmDel(r)} onEdit={() => setEditRun(r)} onReTest={() => reTest(r)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Nível 1 — uma série por card */
        <>
          <div className="casos-searchblock">
            <div className="casos-searchblock-top">
              <div className="casos-search-wrap">
                <IconSearch className="casos-search-icon" />
                <input className="casos-search" placeholder="Buscar execução por nome ou responsável…" value={search} onChange={(e) => setSearch(e.target.value)} />
                {search && <button className="casos-search-clear" onClick={() => setSearch('')} title="Limpar busca" aria-label="Limpar busca"><IconX /></button>}
              </div>
              {podeCriar && (
                <button className="btn btn-primary btn-sm casos-new-btn" onClick={() => setNewModal(true)} disabled={cases.length === 0} title={cases.length === 0 ? 'Crie casos antes' : 'Nova execução'}>
                  <IconPlus /> Nova Execução
                </button>
              )}
            </div>
          </div>

          {seriesGroups.length === 0 ? (
            <div className="tests-empty">
              <h2>Nenhuma execução</h2>
              <p>{cases.length === 0 ? 'Crie casos de teste antes de iniciar uma execução.' : (runs.length === 0 ? 'Crie a primeira execução.' : 'Nenhuma execução corresponde à busca.')}</p>
            </div>
          ) : (
            <div className="runs-sections">
              {activeGroups.length > 0 && (
                <section className="runs-section">
                  <h3 className="runs-section-title">Em andamento <span className="runs-section-count">{activeGroups.length}</span></h3>
                  <div className="run-cards">
                    {activeGroups.map((g) => (
                      <RunCard
                        key={g.seriesId} run={g.latest} chip={`${g.cycles.length} ciclo${g.cycles.length > 1 ? 's' : ''}`} stats={stats.get(g.latest.id)}
                        author={userName(g.latest.assignedTo)} authorInitials={userInitials(g.latest.assignedTo)}
                        canDelete={false} canEdit={false} canReTest={false}
                        onOpen={() => goToSeries(g.seriesId)} onDelete={() => {}} onEdit={() => {}} onReTest={() => {}}
                      />
                    ))}
                  </div>
                </section>
              )}
              {doneGroups.length > 0 && (
                <section className="runs-section">
                  <h3 className="runs-section-title">Concluídas <span className="runs-section-count">{doneGroups.length}</span></h3>
                  <div className="run-cards">
                    {doneGroups.map((g) => (
                      <RunCard
                        key={g.seriesId} run={g.latest} chip={`${g.cycles.length} ciclo${g.cycles.length > 1 ? 's' : ''}`} stats={stats.get(g.latest.id)}
                        author={userName(g.latest.assignedTo)} authorInitials={userInitials(g.latest.assignedTo)}
                        canDelete={false} canEdit={false} canReTest={false}
                        onOpen={() => goToSeries(g.seriesId)} onDelete={() => {}} onEdit={() => {}} onReTest={() => {}}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}

      {newModal && activeId && (
        <NewRunModal
          projectId={activeId} cases={cases} suites={suites} plans={plans}
          onClose={() => setNewModal(false)}
          onCreated={(run) => { setNewModal(false); loadProject(activeId).then(() => goToRun(run)); }}
        />
      )}
      {editRun && (
        <EditRunModal
          run={editRun} plans={plans} cases={cases} suites={suites}
          onClose={() => setEditRun(null)}
          onSaved={() => { setEditRun(null); if (activeId) loadProject(activeId); }}
        />
      )}
      {retestTarget && (
        <RetestModal
          run={retestTarget}
          onClose={() => setRetestTarget(null)}
          onConfirm={(ctx) => doReTest(retestTarget, ctx)}
        />
      )}
      {confirmDel && (
        <Modal title="Excluir execução" onClose={() => setConfirmDel(null)} footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Cancelar</button>
            <button className="btn btn-danger" onClick={async () => {
              const ok = await deleteRun(confirmDel.id);
              if (ok) { showToast('Execução excluída.', 'success'); if (activeId) loadProject(activeId); }
              else showToast('Não foi possível excluir a execução. Verifique sua permissão.', 'error');
              setConfirmDel(null);
            }}>Excluir</button>
          </>
        }>
          <p style={{ color: 'var(--text-secondary)' }}>Excluir <strong style={{ color: 'var(--text-primary)' }}>{confirmDel.name}</strong>? Os resultados e evidências desta execução serão perdidos.</p>
        </Modal>
      )}
    </TestsLayout>
  );
}

/* ── Modal de confirmação de Re-teste com seleção de ambiente ── */
function RetestModal({ run, onClose, onConfirm }: {
  run: TestRun;
  onClose: () => void;
  onConfirm: (ctx: { ambiente: string; company: string; versaoBackoffice: string; versaoB2b: string }) => void;
}) {
  const [versaoBackoffice, setVersaoBackoffice] = useState(run.versaoBackoffice ?? '');
  const [versaoB2b, setVersaoB2b] = useState(run.versaoB2b ?? '');
  const [amb, setAmb] = useState(run.ambiente ?? '');
  const [company, setCompany] = useState(run.company ?? '');

  return (
    <Modal title="Re-testar — Novo Ciclo" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => onConfirm({ ambiente: amb, company, versaoBackoffice, versaoB2b })}>Criar novo ciclo</button>
      </>
    }>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Será criado um novo ciclo de <strong style={{ color: 'var(--text-primary)' }}>{run.name}</strong> com todos os casos para re-teste.
      </p>
      <div className="form-row">
        <div className="form-group">
          <label>Ambiente</label>
          <select value={amb} onChange={(e) => setAmb(e.target.value)}>
            <option value="">— Selecione —</option>
            {AMBIENTES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Company</label>
          <select value={company} onChange={(e) => setCompany(e.target.value)}>
            <option value="">— Selecione —</option>
            {COMPANIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Versão Backoffice <span className="form-label-opt">(opcional)</span></label>
          <input type="text" value={versaoBackoffice} onChange={(e) => setVersaoBackoffice(e.target.value)} placeholder="Ex.: 2.3.1" />
        </div>
        <div className="form-group">
          <label>Versão B2B <span className="form-label-opt">(opcional)</span></label>
          <input type="text" value={versaoB2b} onChange={(e) => setVersaoB2b(e.target.value)} placeholder="Ex.: 1.4.0" />
        </div>
      </div>
    </Modal>
  );
}

/* ── Card de execução (lista) ── */
function RunCard({ run, chip, stats, author, authorInitials, canDelete, canEdit, canReTest, onOpen, onDelete, onEdit, onReTest }: {
  run: TestRun; chip: string; stats?: RunStats; author: string; authorInitials: string;
  canDelete: boolean; canEdit: boolean; canReTest: boolean;
  onOpen: () => void; onDelete: () => void; onEdit: () => void; onReTest: () => void;
}) {
  const s = stats ?? { total: 0, passed: 0, failed: 0, blocked: 0, skipped: 0, untested: 0, elapsed: 0 };
  const done = s.total - s.untested;
  const pct = s.total ? Math.round((done / s.total) * 100) : 0;
  const seg = (n: number) => (s.total ? `${(n / s.total) * 100}%` : '0%');
  return (
    <div className="run-card" role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}>
      <div className="run-card-top">
        <span className="run-card-title">{run.name}</span>
        <span className="run-card-badges">
          <span className="run-cycle">{chip}</span>
          <span className={`tests-badge status-${run.status}`}>{RUN_STATUS_LABEL[run.status]}</span>
          <span className="run-cases">{s.total} {s.total === 1 ? 'caso' : 'casos'}</span>
        </span>
      </div>
      {(run.ambiente || run.company) && (
        <div className="run-ctx-tags">
          {run.ambiente && <span className="run-ambiente">{run.ambiente}</span>}
          {run.company && <span className="run-company">{COMPANIES.find((c) => c.value === run.company)?.label ?? run.company}</span>}
        </div>
      )}
      <button
        type="button"
        className="run-card-id"
        title="ID da execução (pai/série) — use na automação de testes. Clique para copiar."
        onClick={(e) => { e.stopPropagation(); copyText(run.seriesId); showToast(`ID copiado: ${run.seriesId}`, 'success'); }}
      >
        <span className="run-card-id-label">ID</span>
        <code>{run.seriesId}</code>
        <IconCopy />
      </button>
      <div className="run-card-bar" title={`${done}/${s.total} executados`}>
        <span className="seg-passed" style={{ width: seg(s.passed) }} />
        <span className="seg-failed" style={{ width: seg(s.failed) }} />
        <span className="seg-blocked" style={{ width: seg(s.blocked) }} />
        <span className="seg-skipped" style={{ width: seg(s.skipped) }} />
      </div>
      <div className="run-card-stats">
        <div className="run-stats-top">
          <span className="run-pct">{pct}%</span>
          <span className="tests-muted">{done}/{s.total} executados</span>
          {s.elapsed > 0 && <span className="run-time" title="Tempo total gasto"><IconHistory /> {fmtDuration(s.elapsed)}</span>}
        </div>
        {(s.passed > 0 || s.failed > 0 || s.blocked > 0) && (
          <div className="run-stats-counts">
            {s.passed > 0 && <span className="stat ok">{s.passed} passou</span>}
            {s.failed > 0 && <span className="stat bad">{s.failed} falhou</span>}
            {s.blocked > 0 && <span className="stat warn">{s.blocked} bloq.</span>}
          </div>
        )}
      </div>
      <div className="run-card-foot">
        <span className="run-author">
          <span className="run-avatar" aria-hidden>{authorInitials}</span>
          <span className="run-author-info">
            <span className="run-author-name">{author}</span>
            <span className="run-card-date">{formatDate(run.createdAt)}</span>
            {run.versaoBackoffice && <span className="run-versao">BO {run.versaoBackoffice}</span>}
            {run.versaoB2b && <span className="run-versao">B2B {run.versaoB2b}</span>}
          </span>
        </span>
        <span className="run-card-foot-right">
          {canEdit && <button className="tests-iconbtn" onClick={(e) => { e.stopPropagation(); onEdit(); }} title="Editar execução" aria-label="Editar execução"><IconPencil /></button>}
          {canDelete && <button className="tests-iconbtn danger" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Excluir execução" aria-label="Excluir execução"><IconTrash /></button>}
        </span>
      </div>
      {canReTest && <button className="run-retest" onClick={(e) => { e.stopPropagation(); onReTest(); }} title="Re-testar (novo ciclo)"><IconHistory /> Re-testar (novo ciclo)</button>}
    </div>
  );
}

/* ── Editar execução (nome, plano, status e casos incluídos) ── */
function EditRunModal({ run, plans, cases, suites, onClose, onSaved }: {
  run: TestRun; plans: TestPlan[]; cases: TestCase[]; suites: TestSuite[];
  onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(run.name);
  const [planId, setPlanId] = useState(run.planId || '');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<string[]>([]);
  const [origResults, setOrigResults] = useState<TestRunResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listRunResults(run.id).then((res) => {
      setOrigResults(res);
      const ids = res.map((r) => r.caseId); // já vem ordenado por position
      setSel(new Set(ids));
      setOrder(ids);
      setLoading(false);
    });
  }, [run.id]);

  // mantém a ordem em sincronia com a seleção (novos vão para o fim)
  useEffect(() => {
    setOrder((prev) => {
      const kept = prev.filter((id) => sel.has(id));
      const added = [...sel].filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [sel]);

  const salvar = async () => {
    if (!name.trim()) { showToast('Informe o nome da execução.', 'warning'); return; }
    if (order.length === 0) { showToast('Selecione ao menos um caso.', 'warning'); return; }
    setSaving(true);
    const updated: TestRun = { ...run, name: name.trim(), planId: planId || null };
    if (!(await saveRun(updated))) { setSaving(false); return; }
    const origByCase = new Map(origResults.map((r) => [r.caseId, r]));
    const newRows: TestRunResult[] = [];
    for (let i = 0; i < order.length; i++) {
      const caseId = order[i];
      const ex = origByCase.get(caseId);
      if (ex) { if (ex.position !== i) await saveRunResult({ ...ex, position: i }); } // reordenou
      else { newRows.push({ id: genId(), runId: run.id, caseId, status: 'untested', executedBy: null, executedAt: null, elapsedSeconds: 0, comment: '', evidence: [], position: i, stepResults: [] }); }
    }
    if (newRows.length) await bulkInsertRunResults(newRows);
    const removed = [...origByCase.keys()].filter((id) => !sel.has(id));
    for (const caseId of removed) { const r = origByCase.get(caseId); if (r) await deleteRunResult(r.id); }
    setSaving(false);
    showToast('Execução atualizada.', 'success');
    onSaved();
  };

  const ambLabel = AMBIENTES.find((a) => a.value === run.ambiente)?.label ?? run.ambiente ?? '—';
  const companyLabel = COMPANIES.find((c) => c.value === run.company)?.label ?? run.company ?? '—';

  return (
    <Modal large title="Editar Execução" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : `Salvar (${order.length})`}</button>
      </>
    }>
      <div className="form-row">
        <div className="form-group"><label>Nome *</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Regressão Release 2.0" /></div>
        <div className="form-group"><label>Plano <span className="form-label-opt">(opcional)</span></label>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">— Nenhum —</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Ambiente <span className="form-label-opt">(definido na criação ou re-teste)</span></label>
          <div className="form-locked">{run.ambiente ? <span className="run-ambiente">{ambLabel}</span> : <span className="tests-muted">Não definido</span>}</div>
        </div>
        <div className="form-group">
          <label>Company <span className="form-label-opt">(definido na criação ou re-teste)</span></label>
          <div className="form-locked">{run.company ? <span className="run-company">{companyLabel}</span> : <span className="tests-muted">Não definido</span>}</div>
        </div>
      </div>
      <div style={{ opacity: loading ? 0.4 : 1, pointerEvents: loading ? 'none' : undefined, transition: 'opacity 0.15s' }}>
        <CasePicker cases={cases} suites={suites} sel={sel} setSel={setSel} />
        <p className="form-hint">Marque para adicionar casos; desmarque para remover. Remover um caso apaga o resultado e as evidências dele nesta execução.</p>
        <div className="form-group runner-pick-section">
          <label>Ordem de execução <span className="form-label-opt">(arraste ou use as setas)</span></label>
          <OrderPanel order={order} cases={cases} onReorder={setOrder} />
        </div>
      </div>
    </Modal>
  );
}

/* ── Seletor de casos reutilizável (árvore de suítes + busca) ── */
interface PickNode { suite: TestSuite; children: PickNode[]; cases: TestCase[] }

function CasePicker({ cases, suites, sel, setSel }: {
  cases: TestCase[]; suites: TestSuite[];
  sel: Set<string>; setSel: Dispatch<SetStateAction<Set<string>>>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const casesOf = useMemo(() => {
    const m = new Map<string | null, TestCase[]>();
    cases.forEach((c) => { const k = c.suiteId; if (!m.has(k)) m.set(k, []); m.get(k)!.push(c); });
    return m;
  }, [cases]);
  const tree = useMemo(() => {
    const childrenOf = new Map<string | null, TestSuite[]>();
    suites.forEach((s) => { const k = s.parentId; if (!childrenOf.has(k)) childrenOf.set(k, []); childrenOf.get(k)!.push(s); });
    const build = (pid: string | null): PickNode[] =>
      (childrenOf.get(pid) || []).map((suite) => ({ suite, children: build(suite.id), cases: casesOf.get(suite.id) || [] }));
    return build(null);
  }, [suites, casesOf]);
  const noSuite = casesOf.get(null) || [];

  const idsUnder = (node: PickNode): string[] => [
    ...node.cases.map((c) => c.id),
    ...node.children.flatMap(idsUnder),
  ];

  const toggleCase = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleExpand = (id: string) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSuite = (node: PickNode) => {
    const ids = idsUnder(node);
    const allOn = ids.length > 0 && ids.every((id) => sel.has(id));
    setSel((p) => { const n = new Set(p); ids.forEach((id) => allOn ? n.delete(id) : n.add(id)); return n; });
  };
  const selectAll = () => setSel(new Set(cases.map((c) => c.id)));
  const clearAll = () => setSel(new Set());

  const q = query.trim().toLowerCase();
  const filteredTree = useMemo(() => {
    if (!q) return tree;
    const f = (node: PickNode): PickNode | null => {
      const nameMatch = node.suite.name.toLowerCase().includes(q);
      const cs = nameMatch ? node.cases : node.cases.filter((c) => c.title.toLowerCase().includes(q));
      const ch = node.children.map(f).filter((n): n is PickNode => n !== null);
      if (cs.length === 0 && ch.length === 0) return null;
      return { suite: node.suite, children: ch, cases: cs };
    };
    return tree.map(f).filter((n): n is PickNode => n !== null);
  }, [tree, q]);
  const filteredNoSuite = useMemo(() => !q ? noSuite : noSuite.filter((c) => c.title.toLowerCase().includes(q)), [noSuite, q]);
  const noResults = q !== '' && filteredTree.length === 0 && filteredNoSuite.length === 0;

  return (
    <div className="form-group runner-pick-section">
      <div className="runner-caselist-head">
        <label style={{ margin: 0 }}>Casos incluídos <span className="form-label-opt">({sel.size} de {cases.length})</span></label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-add" onClick={selectAll}>Marcar todos</button>
          {sel.size > 0 && <button className="btn-add" onClick={clearAll}>Limpar</button>}
        </div>
      </div>
      <div className="pick-search-wrap">
        <IconSearch className="pick-search-icon" />
        <input className="pick-search" type="text" placeholder="Buscar caso ou suíte…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && <button className="casos-search-clear" onClick={() => setQuery('')} title="Limpar" aria-label="Limpar busca"><IconX /></button>}
      </div>
      <div className="pick-tree">
        {cases.length === 0 ? <p className="field-empty">Nenhum caso no projeto.</p>
          : noResults ? <p className="field-empty">Nenhum caso encontrado para “{query}”.</p> : (
          <>
            {filteredTree.map((node) => (
              <PickSuite key={node.suite.id} node={node} depth={0} sel={sel} expanded={expanded} forceOpen={q !== ''}
                onToggleCase={toggleCase} onToggleExpand={toggleExpand} onToggleSuite={toggleSuite} idsUnder={idsUnder} />
            ))}
            {filteredNoSuite.length > 0 && (() => {
              const noIds = filteredNoSuite.map((c) => c.id);
              const noSel = noIds.filter((id) => sel.has(id)).length;
              const noAll = noSel === noIds.length;
              const noSome = noSel > 0 && !noAll;
              const toggleNo = () => setSel((p) => { const n = new Set(p); noIds.forEach((id) => noAll ? n.delete(id) : n.add(id)); return n; });
              return (
                <div className="pick-group">
                  <div className={`pick-row${noAll ? ' on' : noSome ? ' some' : ''}`} style={{ paddingLeft: 8 }}>
                    <span className="casos-tree-toggle-spacer" />
                    <input type="checkbox" checked={noAll} ref={(el) => { if (el) el.indeterminate = noSome; }} onChange={toggleNo} title="Selecionar todos sem suíte" />
                    <span className="pick-folder pick-folder--static">
                      <IconFolder />
                      <span className="pick-folder-name">Sem suíte</span>
                      <span className={`pick-count${noAll ? ' on' : ''}`}>{noSel}/{filteredNoSuite.length}</span>
                    </span>
                  </div>
                  {filteredNoSuite.map((c) => (
                    <label key={c.id} className="pick-case" style={{ paddingLeft: 46 }}>
                      <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggleCase(c.id)} />
                      <span>{c.title}</span>
                    </label>
                  ))}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Painel de ordem de execução (arrastar e soltar / setas) ── */
function OrderPanel({ order, cases, onReorder }: { order: string[]; cases: TestCase[]; onReorder: (next: string[]) => void }) {
  const dragId = useRef<string | null>(null);
  const titleOf = useMemo(() => {
    const m = new Map(cases.map((c) => [c.id, c.title]));
    return (id: string) => m.get(id) ?? id;
  }, [cases]);
  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id); const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const n = [...order]; [n[i], n[j]] = [n[j], n[i]]; onReorder(n);
  };
  const drop = (targetId: string) => {
    const from = dragId.current; dragId.current = null;
    if (!from || from === targetId) return;
    const n = order.filter((x) => x !== from);
    n.splice(n.indexOf(targetId), 0, from);
    onReorder(n);
  };
  if (order.length === 0) return <p className="field-empty">Selecione casos acima para definir a ordem.</p>;
  return (
    <div className="order-list">
      {order.map((id, i) => (
        <div key={id} className="order-item" draggable
          onDragStart={() => { dragId.current = id; }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => drop(id)}>
          <span className="order-grip" title="Arraste para reordenar"><IconGrip /></span>
          <span className="order-num">{i + 1}</span>
          <span className="order-title">{titleOf(id)}</span>
          <span className="order-arrows">
            <button type="button" className="order-arrow up" onClick={() => move(id, -1)} disabled={i === 0} aria-label="Mover para cima"><IconChevron /></button>
            <button type="button" className="order-arrow down" onClick={() => move(id, 1)} disabled={i === order.length - 1} aria-label="Mover para baixo"><IconChevron /></button>
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Criar nova execução ── */
function NewRunModal({ projectId, cases, suites, plans, onClose, onCreated }: {
  projectId: string; cases: TestCase[]; suites: TestSuite[]; plans: TestPlan[];
  onClose: () => void; onCreated: (run: TestRun) => void;
}) {
  const [name, setName] = useState('');
  const [planId, setPlanId] = useState('');
  const [ambiente, setAmbiente] = useState('');
  const [company, setCompany] = useState('');
  const [versaoBackoffice, setVersaoBackoffice] = useState('');
  const [versaoB2b, setVersaoB2b] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set()); // nada pré-selecionado
  const [order, setOrder] = useState<string[]>([]);

  // mantém a ordem de execução em sincronia com a seleção (novos vão para o fim)
  useEffect(() => {
    setOrder((prev) => {
      const kept = prev.filter((id) => sel.has(id));
      const added = [...sel].filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [sel]);

  const criar = async () => {
    if (!name.trim()) { showToast('Informe o nome da execução.', 'warning'); return; }
    if (order.length === 0) { showToast('Selecione ao menos um caso.', 'warning'); return; }
    const id = genId();
    const run: TestRun = {
      id, projectId, planId: planId || null, name: name.trim(),
      status: 'in_progress', assignedTo: currentUserId(), createdAt: new Date().toISOString(), closedAt: null,
      seriesId: id, cycle: 1, ambiente: ambiente || null, company: company || null, versaoBackoffice: versaoBackoffice || null, versaoB2b: versaoB2b || null,
    };
    if (!(await saveRun(run))) return;
    const results: TestRunResult[] = order.map((caseId, i) => ({
      id: genId(), runId: run.id, caseId, status: 'untested', executedBy: null,
      executedAt: null, elapsedSeconds: 0, comment: '', evidence: [], position: i, stepResults: [],
    }));
    await bulkInsertRunResults(results);
    showToast('Execução criada.', 'success');
    onCreated(run);
  };

  return (
    <Modal large title="Nova Execução" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={criar}>Criar execução ({sel.size})</button>
      </>
    }>
      <div className="form-row">
        <div className="form-group"><label>Nome *</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Regressão Release 2.0" /></div>
        <div className="form-group"><label>Plano <span className="form-label-opt">(opcional)</span></label>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">— Nenhum —</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Ambiente</label>
          <select value={ambiente} onChange={(e) => setAmbiente(e.target.value)}>
            <option value="">— Nenhum —</option>
            {AMBIENTES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Company</label>
          <select value={company} onChange={(e) => setCompany(e.target.value)}>
            <option value="">— Nenhuma —</option>
            {COMPANIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Versão Backoffice <span className="form-label-opt">(opcional)</span></label>
          <input type="text" value={versaoBackoffice} onChange={(e) => setVersaoBackoffice(e.target.value)} placeholder="Ex.: 2.3.1" />
        </div>
        <div className="form-group"><label>Versão B2B <span className="form-label-opt">(opcional)</span></label>
          <input type="text" value={versaoB2b} onChange={(e) => setVersaoB2b(e.target.value)} placeholder="Ex.: 1.4.0" />
        </div>
      </div>
      <CasePicker cases={cases} suites={suites} sel={sel} setSel={setSel} />
      <div className="form-group runner-pick-section">
        <label>Ordem de execução <span className="form-label-opt">(arraste ou use as setas)</span></label>
        <OrderPanel order={order} cases={cases} onReorder={setOrder} />
      </div>
    </Modal>
  );
}

function PickSuite({ node, depth, sel, expanded, forceOpen, onToggleCase, onToggleExpand, onToggleSuite, idsUnder }: {
  node: PickNode; depth: number; sel: Set<string>; expanded: Set<string>; forceOpen: boolean;
  onToggleCase: (id: string) => void; onToggleExpand: (id: string) => void;
  onToggleSuite: (n: PickNode) => void; idsUnder: (n: PickNode) => string[];
}) {
  const ids = idsUnder(node);
  const selCount = ids.filter((id) => sel.has(id)).length;
  const allOn = ids.length > 0 && selCount === ids.length;
  const some = selCount > 0 && !allOn;
  const isOpen = forceOpen || expanded.has(node.suite.id);
  const hasContent = node.children.length > 0 || node.cases.length > 0;

  return (
    <div className="pick-group">
      <div className={`pick-row${allOn ? ' on' : some ? ' some' : ''}`} style={{ paddingLeft: 8 + depth * 16 }}>
        {hasContent ? (
          <button className={`casos-tree-toggle${isOpen ? ' open' : ''}`} onClick={() => onToggleExpand(node.suite.id)} aria-label={isOpen ? 'Recolher' : 'Expandir'}><IconChevron /></button>
        ) : <span className="casos-tree-toggle-spacer" />}
        <input type="checkbox" checked={allOn} ref={(el) => { if (el) el.indeterminate = some; }} onChange={() => onToggleSuite(node)} title="Selecionar toda a suíte" />
        <button className="pick-folder" onClick={() => onToggleExpand(node.suite.id)}>
          <IconFolder />
          <span className="pick-folder-name">{node.suite.name}</span>
          <span className={`pick-count${allOn ? ' on' : ''}`}>{selCount}/{ids.length}</span>
        </button>
      </div>
      {isOpen && (
        <>
          {node.children.map((ch) => (
            <PickSuite key={ch.suite.id} node={ch} depth={depth + 1} sel={sel} expanded={expanded} forceOpen={forceOpen}
              onToggleCase={onToggleCase} onToggleExpand={onToggleExpand} onToggleSuite={onToggleSuite} idsUnder={idsUnder} />
          ))}
          {node.cases.map((c) => (
            <label key={c.id} className="pick-case" style={{ paddingLeft: 8 + (depth + 1) * 16 + 22 }}>
              <input type="checkbox" checked={sel.has(c.id)} onChange={() => onToggleCase(c.id)} />
              <span>{c.title}</span>
            </label>
          ))}
        </>
      )}
    </div>
  );
}

/* ── SidebarBugRow: bug expansível com comentários Azure e sync ── */
function SidebarBugRow({ bug, azureApiCfg, onUpdated, onLightbox }: {
  bug: Defect;
  azureApiCfg: { organization: string; project: string; pat: string } | null;
  onUpdated: (updated: Defect) => void;
  onLightbox: (ev: Evidence) => void;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<AzureComment[]>([]);
  const [loadingCmts, setLoadingCmts] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [myAzureId, setMyAzureId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const objectUrls = useRef<string[]>([]);
  useEffect(() => () => { objectUrls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);
  const trackUrl = (u: string) => objectUrls.current.push(u);
  const onImgClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'IMG') { e.preventDefault(); const img = t as HTMLImageElement; onLightbox({ name: img.alt || 'Imagem', url: img.src }); }
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded && bug.azureWorkItemId && azureApiCfg) {
      setLoadingCmts(true);
      try {
        const [cms, azId] = await Promise.all([getComments(azureApiCfg, bug.azureWorkItemId), getMyAzureId(azureApiCfg)]);
        setComments(await inlineCommentImages(azureApiCfg, cms, trackUrl)); setMyAzureId(azId);
      } catch { /* ignore */ }
      setLoaded(true); setLoadingCmts(false);
    }
  };

  const sync = async () => {
    if (!azureApiCfg || !bug.azureWorkItemId) return;
    setSyncing(true);
    try {
      const wi = await getWorkItem(azureApiCfg, bug.azureWorkItemId);
      const isClosed = AZURE_CLOSED_STATES.has(wi.state);
      const updated: Defect = { ...bug, azureState: wi.state, azureSyncedAt: new Date().toISOString(), status: isClosed ? 'closed' : bug.status };
      await saveDefect(updated);
      onUpdated(updated);
      const fresh = await getComments(azureApiCfg, bug.azureWorkItemId);
      setComments(await inlineCommentImages(azureApiCfg, fresh, trackUrl));
      showToast('Bug sincronizado.', 'success');
    } catch { showToast('Erro ao sincronizar.', 'error'); }
    setSyncing(false);
  };

  const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const title = bug.title || '(sem título)';

  return (
    <div style={{ border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, overflow: 'hidden' }}>
      <button onClick={toggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'rgba(239,68,68,0.08)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#c0392b', flexShrink: 0 }}>
          {bug.azureWorkItemId ? `#${bug.azureWorkItemId}` : '—'}
        </span>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <span className={`tests-badge def-${bug.status}`} style={{ flexShrink: 0, fontSize: 11 }}>{DEFECT_STATUS_LABEL[bug.status]}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', transition: 'transform 0.15s', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.03)', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`tests-chip prio-${bug.severity}`} style={{ fontSize: 11 }}>{bug.severity}</span>
            {bug.azureState && <span className="casos-tag" style={{ fontSize: 11 }}>Azure: {bug.azureState}</span>}
            {bug.azureWorkItemId && azureApiCfg && (
              <button className="btn btn-ghost btn-sm" onClick={sync} disabled={syncing} style={{ fontSize: 11, padding: '2px 8px', marginLeft: 'auto' }}>
                {syncing ? '…' : '↻ Sincronizar'}
              </button>
            )}
          </div>
          {bug.description
            ? (/<[a-z!/][\s\S]*>/i.test(bug.description)
                ? <div className="defect-desc-html" onClick={onImgClick} dangerouslySetInnerHTML={{ __html: bug.description }} />
                : <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, color: 'var(--text-primary)', margin: 0 }}>{bug.description}</p>)
            : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem descrição.</span>}
          {bug.evidence && bug.evidence.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {bug.evidence.map((ev, i) => (
                isImage(ev.url) ? (
                  <button key={i} type="button" className="evi-thumb" onClick={() => onLightbox(ev)} title={ev.name}
                    style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', padding: 0, cursor: 'zoom-in', background: 'none', flexShrink: 0 }}>
                    <img src={ev.url} alt={ev.name} style={{ display: 'block', maxHeight: 100, maxWidth: 140, objectFit: 'cover' }} />
                  </button>
                ) : (
                  <a key={i} href={ev.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'underline' }}>{ev.name}</a>
                )
              ))}
            </div>
          )}
          {bug.azureWorkItemId && azureApiCfg && (
            <div style={{ borderTop: '1px solid rgba(239,68,68,0.12)', paddingTop: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Comentários Azure</div>
              {loadingCmts ? (
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Carregando…</p>
              ) : comments.length === 0 ? (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhum comentário.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} onClick={onImgClick}>
                  {comments.map((cm) => {
                    const isMe = !!myAzureId && cm.createdBy?.id === myAzureId;
                    const authorName = cm.createdBy?.displayName ?? 'Azure';
                    return (
                      <div key={cm.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, flexDirection: isMe ? 'row-reverse' : 'row', maxWidth: '90%' }}>
                          <div style={{ width: 26, height: 26, borderRadius: '50%', background: isMe ? 'var(--accent)' : '#6c757d', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                            {initials(authorName)}
                          </div>
                          <div style={{ background: isMe ? 'var(--accent)' : 'var(--bg-card)', color: isMe ? '#fff' : 'var(--text-primary)', borderRadius: isMe ? '10px 10px 2px 10px' : '10px 10px 10px 2px', padding: '6px 10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                            {!isMe && <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 2, opacity: 0.7 }}>{authorName}</div>}
                            <p className="azure-comment-text" style={{ fontSize: 11, margin: 0, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: cm.text }} />
                            <div style={{ fontSize: 10, marginTop: 3, opacity: 0.6, textAlign: isMe ? 'right' : 'left' }}>
                              <span style={{ fontWeight: 600 }}>{authorName}</span> · {formatDate(cm.createdDate)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Deriva o status do resultado com base nos steps.
   Skipped é ignorado; untested em qualquer step não-skipped → reseta para untested.
   null = sem steps relevantes (todos skipped) → não altera o pai. */
function deriveResultStatus(stepResults: StepResult[]): ResultStatus | null {
  const relevant = stepResults.filter(s => s.status !== 'skipped');
  if (relevant.length === 0) return null;
  if (relevant.some(s => s.status === 'failed')) return 'failed';
  if (relevant.some(s => s.status === 'blocked')) return 'blocked';
  if (relevant.some(s => s.status === 'untested' || s.status === 'retest')) return 'untested';
  return 'passed';
}

/* ── Runner: executar a run ── */
function Runner({ run, cases, plans, cards, sprints, milestones, azureConfigs, myPat, onBack, onChanged, onRunUpdated }: {
  run: TestRun; cases: TestCase[]; plans: TestPlan[];
  cards: Card[]; sprints: Sprint[]; milestones: Milestone[];
  azureConfigs: AzureConfig[]; myPat: string;
  onBack: () => void; onChanged: () => void;
  onRunUpdated: (updated: TestRun) => void;
}) {
  const [results, setResults] = useState<TestRunResult[]>([]);
  const [timerId, setTimerId] = useState<string | null>(null);
  const resultsRef = useRef<TestRunResult[]>([]);
  const timerIdRef = useRef<string | null>(null);
  const pendingNavRef = useRef<string | null>(null);
  const navNavigate = useRRNavigate();
  const [defectFor, setDefectFor] = useState<{ result: TestRunResult; title?: string; description?: string; resultadoObtido?: string } | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [dropFor, setDropFor] = useState<Set<string>>(new Set());
  const [openFields, setOpenFields] = useState<Set<string>>(new Set());
  const toggleField = (label: string) => setOpenFields((p) => { const n = new Set(p); n.has(label) ? n.delete(label) : n.add(label); return n; });
  const [defects, setDefects] = useState<Defect[]>([]);

  useEffect(() => { listDefects(run.projectId).then(setDefects).catch(() => {}); }, [run.projectId]);
  const [lightbox, setLightbox] = useState<Evidence | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const toggleDrop = (id: string) => setDropFor((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const { name: userName } = useUserNames();
  const podeEscrever = can('create');
  const closed = run.status === 'closed';
  const editable = podeEscrever && !closed;
  const caseById = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases]);

  useEffect(() => { listRunResults(run.id).then(setResults); }, [run.id]);
  useEffect(() => { resultsRef.current = results; }, [results]);
  useEffect(() => { timerIdRef.current = timerId; }, [timerId]);

  // Salva o timer ao sair (troca de menu, navegação sem usar o botão Voltar)
  useEffect(() => {
    return () => {
      const tid = timerIdRef.current;
      if (!tid) return;
      const cur = resultsRef.current.find((x) => x.id === tid);
      if (cur) saveRunResult(cur).catch(() => {});
    };
  }, []);

  // cronômetro: incrementa o tempo no estado a cada segundo e grava no banco a cada 5s
  useEffect(() => {
    if (!timerId) return;
    let secs = 0;
    const i = setInterval(() => {
      secs += 1;
      setResults((prev) => prev.map((x) => (x.id === timerId ? { ...x, elapsedSeconds: x.elapsedSeconds + 1 } : x)));
      if (secs % 5 === 0) { const r = resultsRef.current.find((x) => x.id === timerId); if (r) saveRunResult(r); }
    }, 1000);
    return () => clearInterval(i);
  }, [timerId]);

  // aviso nativo ao atualizar/fechar a aba com cronômetro rodando
  useEffect(() => {
    if (!timerId) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [timerId]);

  // intercepta cliques no sidebar quando o cronômetro está rodando
  useEffect(() => {
    if (!timerId) return;
    const onCapture = (e: MouseEvent) => {
      const btn = (e.target as Element).closest('[data-navpath]');
      if (!btn) return;
      const path = btn.getAttribute('data-navpath');
      if (!path) return;
      e.stopPropagation();
      e.preventDefault();
      pendingNavRef.current = path;
      setConfirmLeave(true);
    };
    document.addEventListener('click', onCapture, true);
    return () => document.removeEventListener('click', onCapture, true);
  }, [timerId]);

  const elapsedOf = (r: TestRunResult) => r.elapsedSeconds;

  const persist = async (r: TestRunResult) => {
    setResults((prev) => prev.map((x) => (x.id === r.id ? r : x)));
    await saveRunResult(r);
  };

  const toggleTimer = (r: TestRunResult) => {
    if (timerId === r.id) {
      setTimerId(null);
      const cur = resultsRef.current.find((x) => x.id === r.id);
      if (cur) saveRunResult(cur); // salva o tempo ao pausar
    } else {
      // só um cronômetro ativo: salva o tempo do anterior antes de iniciar outro
      if (timerId) { const prev = resultsRef.current.find((x) => x.id === timerId); if (prev) saveRunResult(prev); }
      setTimerId(r.id);
    }
  };

  const commitTimer = async () => {
    if (!timerId) return;
    const r = resultsRef.current.find((x) => x.id === timerId);
    setTimerId(null);
    if (r) await saveRunResult(r);
  };
  const handleBack = () => { if (timerId) setConfirmLeave(true); else onBack(); };

  const mark = async (r: TestRunResult, status: ResultStatus) => {
    const cur = resultsRef.current.find((x) => x.id === r.id) ?? r;
    const clearing = cur.status === status; // clicar no status já ativo remove (volta a "Não testado")
    await persist({ ...cur, status: clearing ? 'untested' : status, executedBy: clearing ? null : currentUserId(), executedAt: clearing ? null : new Date().toISOString() });
  };

  const setComment = (r: TestRunResult, comment: string) => setResults((prev) => prev.map((x) => x.id === r.id ? { ...x, comment } : x));

  const onUpload = async (r: TestRunResult, files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    setUploadingId(r.id);
    const added: Evidence[] = [];
    for (const f of list) {
      const ev = await uploadEvidence(run.id, f);
      if (ev) added.push(ev);
    }
    if (added.length) { await persist({ ...r, evidence: [...r.evidence, ...added] }); showToast(`${added.length} evidência(s) anexada(s).`, 'success'); }
    setUploadingId(null);
  };
  const removeEvidence = (r: TestRunResult, idx: number) => persist({ ...r, evidence: r.evidence.filter((_, i) => i !== idx) });
  const renameEvidence = (r: TestRunResult, idx: number, name: string) => {
    const cur = resultsRef.current.find((x) => x.id === r.id) ?? r;
    persist({ ...cur, evidence: cur.evidence.map((e, i) => i === idx ? { ...e, name } : e) });
  };

  /* ── Resultado por passo do cenário ── */
  const [uploadingStep, setUploadingStep] = useState<string | null>(null);
  const setStep = (r: TestRunResult, idx: number, count: number, patch: Partial<StepResult>) => {
    const newSteps = ensureStepResults(r, count).map((s, i) => (i === idx ? { ...s, ...patch } : s));
    const derived = count > 0 ? deriveResultStatus(newSteps) : null;
    const base: TestRunResult = { ...r, stepResults: newSteps };
    const updated: TestRunResult = derived === null ? base : {
      ...base,
      status: derived,
      executedBy: derived === 'untested' ? null : (base.executedBy || currentUserId()),
      executedAt: derived === 'untested' ? null : (base.executedAt || new Date().toISOString()),
    };
    persist(updated);
  };
  const setStepComment = (r: TestRunResult, idx: number, count: number, comment: string) =>
    setResults((prev) => prev.map((x) => (x.id === r.id
      ? { ...x, stepResults: ensureStepResults(x, count).map((s, i) => (i === idx ? { ...s, comment } : s)) }
      : x)));
  const saveStep = (r: TestRunResult) => { const cur = resultsRef.current.find((x) => x.id === r.id); if (cur) saveRunResult(cur); };
  const onUploadStep = async (r: TestRunResult, idx: number, count: number, files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    setUploadingStep(`${r.id}:${idx}`);
    const added: Evidence[] = [];
    for (const f of list) { const ev = await uploadEvidence(run.id, f); if (ev) added.push(ev); }
    if (added.length) {
      const cur = resultsRef.current.find((x) => x.id === r.id) ?? r;
      await persist({ ...cur, stepResults: ensureStepResults(cur, count).map((s, i) => (i === idx ? { ...s, evidence: [...s.evidence, ...added] } : s)) });
      showToast(`${added.length} evidência(s) anexada(s) ao passo.`, 'success');
    }
    setUploadingStep(null);
  };
  const removeStepEvidence = (r: TestRunResult, idx: number, count: number, evIdx: number) => {
    const cur = resultsRef.current.find((x) => x.id === r.id) ?? r;
    return persist({ ...cur, stepResults: ensureStepResults(cur, count).map((s, i) => (i === idx ? { ...s, evidence: s.evidence.filter((_, j) => j !== evIdx) } : s)) });
  };
  const renameStepEvidence = (r: TestRunResult, stepIdx: number, count: number, evIdx: number, name: string) => {
    const cur = resultsRef.current.find((x) => x.id === r.id) ?? r;
    persist({ ...cur, stepResults: ensureStepResults(cur, count).map((s, i) => i === stepIdx ? { ...s, evidence: s.evidence.map((e, j) => j === evIdx ? { ...e, name } : e) } : s) });
  };

  const pendingFinal = results.filter((r) => r.status === 'untested' || r.status === 'retest').length;
  const closeRun = () => {
    if (pendingFinal > 0) { showToast(`Não dá para fechar: ${pendingFinal} caso(s) ainda sem status final (Não testado/Reteste).`, 'warning'); return; }
    setConfirmClose(true);
  };
  const doClose = async () => {
    await commitTimer();
    const closed: TestRun = { ...run, status: 'closed', closedAt: new Date().toISOString() };
    await saveRun(closed);
    showToast('Execução fechada.', 'success');
    setConfirmClose(false);
    onRunUpdated(closed); // mantém no runner, agora no estado fechado
    onChanged();          // atualiza a lista em background
  };

  const total = results.length;
  const done = results.filter((r) => r.status !== 'untested').length;
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  /* ── Context derivado ── */
  const azureCfg = azureConfigs.find((c) => c.id === run.id) ?? azureConfigs[0] ?? null;
  const azureApiCfg = azureCfg && myPat ? { organization: azureCfg.organization, project: azureCfg.project, pat: myPat } : null;

  const linkedPlan = run.planId ? plans.find((p) => p.id === run.planId) : null;
  const linkedCard = linkedPlan?.cardId ? cards.find((c) => c.id === linkedPlan.cardId) : null;
  const sprintId = linkedPlan?.sprintId ?? linkedCard?.sprintId ?? null;
  const linkedSprint = sprintId ? sprints.find((s) => s.id === sprintId) : null;
  const milestoneId = linkedPlan?.milestoneId ?? linkedSprint?.milestoneId ?? linkedCard?.milestoneId ?? null;
  const linkedMilestone = milestoneId ? milestones.find((m) => m.id === milestoneId) : null;
  const companyLabel = COMPANIES.find((c) => c.value === run.company)?.label ?? run.company ?? null;

  const hasContext = linkedPlan || linkedCard || linkedSprint || linkedMilestone || run.ambiente || run.company || run.versaoBackoffice || run.versaoB2b;

  const generateReport = async () => {
    const mapStatus = (s: ResultStatus): Report['finalStatus'] => {
      if (s === 'passed') return 'approved';
      if (s === 'failed') return 'rejected';
      if (s === 'blocked' || s === 'skipped') return 'partial';
      return 'pending';
    };

    // Baixa a evidência, converte para base64 e guarda no cache do IndexedDB.
    // No relatório vai apenas o `cacheKey` (leve) — assim o localStorage não
    // estoura (base64 de prints é grande) e o saveCurrentReport não falha,
    // que era o motivo de a tela abrir com dados ANTIGOS. A imagem é
    // reidratada (cacheKey → base64) ao carregar o relatório.
    const fetchImageToCache = async (ev: Evidence): Promise<{ id: string; name: string; cacheKey: string } | null> => {
      try {
        const resp = await fetch(ev.url);
        if (!resp.ok) return null;
        const blob = await resp.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const cacheKey = genId();
        await setCachedImageDataUrl(cacheKey, dataUrl);
        return { id: genId(), name: ev.name, cacheKey };
      } catch {
        return null;
      }
    };

    const criteria = await Promise.all(results.map(async (result) => {
      const c = caseById.get(result.caseId);
      const allEv = [
        ...result.evidence,
        ...((result.stepResults || []).flatMap((sr) => sr.evidence || [])),
      ];
      const images = (await Promise.all(allEv.map(fetchImageToCache))).filter(Boolean) as { id: string; name: string; cacheKey: string }[];
      return {
        id: result.id,
        title: c?.title || result.caseId,
        description: c?.preconditions || '',
        expectedResult: c?.expectedResult || '',
        steps: (c?.steps || []).map((s, i) => ({
          id: `step_${i + 1}`,
          text: s.action,
        })),
        obtainedResult: result.comment || '',
        status: mapStatus(result.status),
        images,
        collapsed: true,
      };
    }));

    const statuses = criteria.map((c) => c.status);
    let finalStatus: Report['finalStatus'] = 'pending';
    if (statuses.length > 0) {
      if (statuses.every((s) => s === 'approved')) finalStatus = 'approved';
      else if (statuses.some((s) => s === 'rejected')) finalStatus = 'rejected';
      else if (statuses.some((s) => s !== 'pending')) finalStatus = 'partial';
    }

    const report: Report = {
      ...createEmptyReport(),
      story: {
        id: linkedCard?.azureId?.toString() || linkedCard?.id || '',
        title: linkedCard?.title || run.name,
        description: linkedPlan?.scope || '',
        system: '',
        module: '',
        sprint: linkedSprint?.name || '',
        environment: run.ambiente || '',
      },
      criteria,
      additionalData: {
        responsible: userName(run.assignedTo),
        testDate: (run.closedAt || run.createdAt || '').split('T')[0],
        versionBko: run.versaoBackoffice || '',
        versionPortal: run.versaoB2b || '',
        notes: '',
      },
      finalStatus,
    };

    const saved = saveCurrentReport(report);
    if (!saved) {
      showToast('Não foi possível preparar o relatório (armazenamento cheio). Limpe relatórios antigos e tente de novo.', 'error');
      return;
    }
    // App usa hash router: abre a tela de RELATÓRIO (gera o PDF), não a raiz
    // (que cairia no dashboard de Gestão de Testes).
    window.open(`${location.pathname}${location.search}#/relatorio`, '_blank');
  };

  return (
    <div className="runner">
      <div className="runner-bar">
        <button className="btn btn-ghost btn-sm" onClick={handleBack}><IconArrowLeft /> Voltar</button>
        <div className="runner-progress">
          <div className="runner-progressbar"><span style={{ width: `${pct}%` }} /></div>
          <span className="tests-muted">{done}/{total} executados</span>
          <span className="tests-badge status-passed">{passed} passou</span>
          {failed > 0 && <span className="tests-badge status-failed">{failed} falhou</span>}
        </div>
        {editable && <button className="btn btn-primary btn-sm" onClick={closeRun} title="Fechar execução">Fechar execução</button>}
        {closed && <span className="tests-badge status-closed">Fechada</span>}
        {closed && <button className="btn btn-primary btn-sm" onClick={generateReport} title="Gerar relatório com os dados desta execução">Gerar Relatório</button>}
      </div>

      <div className="runner-body">
        {hasContext && (
          <div className="runner-sidebar">
            {linkedCard && (
              <div className="runner-sidebar-field">
                <span className="runner-sidebar-label">Card</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {linkedCard.azureId && <span className="casos-tag" style={{ fontSize: 13, fontWeight: 700 }}>#{linkedCard.azureId}</span>}
                  <span className="runner-sidebar-value">{linkedCard.title}</span>
                </div>
              </div>
            )}
            {linkedPlan && (
              <div className="runner-sidebar-field">
                <span className="runner-sidebar-label">Plano de Teste</span>
                <span className="runner-sidebar-value" style={{ color: 'var(--text-secondary)' }}>{linkedPlan.name}</span>
              </div>
            )}
            {(linkedSprint || linkedMilestone) && (
              <div style={{ display: 'flex', gap: 12 }}>
                {linkedSprint && (
                  <div className="runner-sidebar-field" style={{ flex: 1, minWidth: 0 }}>
                    <span className="runner-sidebar-label">Sprint</span>
                    <span className="runner-sidebar-value" style={{ color: 'var(--accent)' }}>{linkedSprint.name}</span>
                  </div>
                )}
                {linkedMilestone && (
                  <div className="runner-sidebar-field" style={{ flex: 1, minWidth: 0 }}>
                    <span className="runner-sidebar-label">Marco</span>
                    <span className="runner-sidebar-value">{linkedMilestone.name}</span>
                  </div>
                )}
              </div>
            )}
            {(run.ambiente || companyLabel) && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {run.ambiente && (
                  <div className="runner-sidebar-field" style={{ flex: 1, minWidth: 80 }}>
                    <span className="runner-sidebar-label">Ambiente</span>
                    <span className="run-ambiente" style={{ alignSelf: 'flex-start' }}>{run.ambiente}</span>
                  </div>
                )}
                {companyLabel && (
                  <div className="runner-sidebar-field" style={{ flex: 1, minWidth: 80 }}>
                    <span className="runner-sidebar-label">Company</span>
                    <span className="run-company" style={{ alignSelf: 'flex-start' }}>{companyLabel}</span>
                  </div>
                )}
              </div>
            )}
            {run.versaoBackoffice && (
              <div className="runner-sidebar-field">
                <span className="runner-sidebar-label">Backoffice</span>
                <span className="runner-sidebar-value">{run.versaoBackoffice}</span>
              </div>
            )}
            {run.versaoB2b && (
              <div className="runner-sidebar-field">
                <span className="runner-sidebar-label">Portal B2B</span>
                <span className="runner-sidebar-value">{run.versaoB2b}</span>
              </div>
            )}

            {linkedCard && (linkedCard.objetivo || linkedCard.resumo || linkedCard.checklist) && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="runner-sidebar-label" style={{ marginBottom: 6 }}>Plano de Teste</span>
                {[
                  { label: 'Objetivo e Valor', value: linkedCard.objetivo },
                  { label: 'Resumo da Demanda', value: linkedCard.resumo },
                  { label: 'Checklist com critérios de aceite', value: linkedCard.checklist },
                ].map(({ label, value }) => {
                  const open = openFields.has(label);
                  return (
                    <div key={label} style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                      <button
                        onClick={() => toggleField(label)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--surface-alt)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, textAlign: 'left', color: 'var(--text-primary)' }}
                      >
                        {label}
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', transition: 'transform 0.15s', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0, marginLeft: 6 }}>▼</span>
                      </button>
                      {open && (
                        <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6, padding: '10px 12px', color: value ? 'inherit' : 'var(--text-muted)', fontStyle: value ? 'normal' : 'italic' }}>
                          {value || 'Não informado'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {linkedCard && (() => {
              const cardBugs = defects.filter((d) =>
                d.cardId === linkedCard.id ||
                (d.planId != null && plans.find((p) => p.id === d.planId)?.cardId === linkedCard.id)
              );
              if (!cardBugs.length) return null;
              return (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="runner-sidebar-label" style={{ marginBottom: 2 }}>Bugs criados</span>
                  {cardBugs.map((bug) => (
                    <SidebarBugRow
                      key={bug.id}
                      bug={bug}
                      azureApiCfg={azureApiCfg}
                      onUpdated={(updated) => setDefects((prev) => prev.map((d) => d.id === updated.id ? updated : d))}
                      onLightbox={setLightbox}
                    />
                  ))}
                </div>
              );
            })()}
          </div>
        )}

      <div className="runner-list">
        {results.length === 0 ? (
          <p className="tests-muted" style={{ padding: 16 }}>Nenhum caso nesta execução.</p>
        ) : results.map((r, ri) => {
          const c = caseById.get(r.caseId);
          return (
            <div className={`runner-item status-${r.status}${timerId === r.id ? ' timing' : ''}`} key={r.id}
              onPaste={editable ? (e) => { const files = Array.from(e.clipboardData?.files || []); if (files.length) { e.preventDefault(); onUpload(r, files); } } : undefined}>

              <div className="runner-item-head">
                <span className="runner-item-title">{c?.title ?? r.caseId}</span>
                <span className="runner-item-right">
                  <span className={`runner-timer${timerId === r.id ? ' on' : ''}`}>{fmtElapsed(elapsedOf(r))}</span>
                  <span className={`tests-badge status-${r.status}`}>{RESULT_STATUS_LABEL[r.status]}</span>
                  {editable && <button className={`tests-iconbtn${timerId === r.id ? ' rec' : ''}`} onClick={() => toggleTimer(r)} title={timerId === r.id ? 'Pausar cronômetro' : 'Iniciar cronômetro'} aria-label="Cronômetro">{timerId === r.id ? <IconPause /> : <IconPlay />}</button>}
                </span>
              </div>
              {editable && (
                <>
                  <div className="runner-actions">
                    {QUICK.map((q) => (
                      <button key={q.status} className={`runner-mark mark-${q.status}${r.status === q.status ? ' on' : ''}`} title={r.status === q.status ? 'Clique para remover o status' : undefined} onClick={() => mark(r, q.status)}>{q.label}</button>
                    ))}
                    <button className={`btn btn-ghost btn-xs runner-evi-btn${dropFor.has(r.id) ? ' on' : ''}`} onClick={() => toggleDrop(r.id)} title="Anexar evidência"><IconUpload /> Adicionar evidência</button>
                    {r.status === 'failed' && <button className="btn btn-danger btn-xs" onClick={() => setDefectFor({
                      result: r,
                      title: c ? `- ${c.title}` : '- Falha na execução',
                      description: c ? buildDefectDescription({
                        caseTitle: c.title, preconditions: c.preconditions, steps: c.steps,
                        stepResults: ensureStepResults(r, c.steps.length),
                        expectedResult: c.expectedResult,
                      }) : r.comment,
                    })}><IconBug /> Registrar defeito</button>}
                  </div>
                  {dropFor.has(r.id) && <EvidenceDrop uploading={uploadingId === r.id} onFiles={(f) => onUpload(r, f)} />}
                </>
              )}
              {c && c.steps.length > 0 && (
                <StepList
                  steps={c.steps} preconditions={c.preconditions} expectedResult={c.expectedResult} caseTitle={c.title}
                  result={r} editable={editable} uploadingStep={uploadingStep} defaultSectionOpen={ri === 0}
                  onSetStep={setStep} onSetStepComment={setStepComment} onSaveStep={saveStep}
                  onUploadStep={onUploadStep} onRemoveStepEvidence={removeStepEvidence} onRenameStepEvidence={renameStepEvidence} onLightbox={setLightbox}
                  onDefect={(result, prefill) => setDefectFor({ result, title: prefill.title, description: prefill.description, resultadoObtido: prefill.resultadoObtido })}
                />
              )}
              {r.evidence.length > 0 && (
                <div className="runner-evidence">
                  <span className="runner-evidence-label">Evidências ({r.evidence.length})</span>
                  <div className="runner-evidence-list">
                    {r.evidence.map((e, i) => (
                      <div className={`evi${isImage(e.url) ? ' evi--img' : ''}`} key={i}>
                        {isImage(e.url) ? (
                          <>
                            <button type="button" className="evi-thumb" onClick={() => setLightbox(e)} title={`Ver ${e.name}`}><img src={e.url} alt={e.name} /></button>
                            {editable
                              ? <EviCapInput name={e.name} onSave={(n) => renameEvidence(r, i, n)} />
                              : <span className="evi-cap" title={e.name}>{e.name}</span>}
                          </>
                        ) : (
                          <a className="evi-link" href={e.url} target="_blank" rel="noreferrer" title={e.name}><IconExternal /> {e.name}</a>
                        )}
                        {editable && <button className="evi-del" onClick={() => removeEvidence(r, i)} title="Remover evidência" aria-label="Remover evidência"><IconX /></button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {editable ? (
                <textarea className="runner-comment" placeholder="Comentário…" value={r.comment}
                  onChange={(e) => setComment(r, e.target.value)} onBlur={() => persist(r)} />
              ) : r.comment ? <p className="runner-note">{r.comment}</p> : null}
            </div>
          );
        })}
      </div>
      </div>{/* runner-body */}

      {defectFor && (
        <DefectModal projectId={run.projectId} result={defectFor.result}
          prefillTitle={`[${run.name}] ${defectFor.title ?? ''}`.trim()}
          prefillDescription={defectFor.description} prefillResultado={defectFor.resultadoObtido}
          prefillCompany={run.company ?? ''} prefillAmbiente={run.ambiente ?? ''}
          prefillVersaoBackoffice={run.versaoBackoffice ?? ''} prefillVersaoB2b={run.versaoB2b ?? ''}
          runPlanId={run.planId ?? null}
          runCardId={plans.find((p) => p.id === run.planId)?.cardId ?? null}
          onClose={() => setDefectFor(null)} />
      )}
      {lightbox && <Lightbox ev={lightbox} onClose={() => setLightbox(null)} />}

      {confirmLeave && (
        <Modal title="Sair da execução?" onClose={() => { setConfirmLeave(false); pendingNavRef.current = null; }} footer={
          <>
            <button className="btn btn-ghost" onClick={() => { setConfirmLeave(false); pendingNavRef.current = null; }}>Continuar testando</button>
            <button className="btn btn-primary" onClick={async () => {
              await commitTimer();
              setConfirmLeave(false);
              const nav = pendingNavRef.current;
              pendingNavRef.current = null;
              if (nav) navNavigate(nav);
              else onBack();
            }}>Salvar e sair</button>
          </>
        }>
          <p style={{ color: 'var(--text-secondary)' }}>
            O cenário <strong style={{ color: 'var(--text-primary)' }}>{caseById.get(results.find((x) => x.id === timerId)?.caseId ?? '')?.title ?? 'atual'}</strong> está em teste e o <strong style={{ color: 'var(--text-primary)' }}>cronômetro está correndo</strong>. Ao sair, o tempo e as alterações são salvos.
          </p>
        </Modal>
      )}

      {confirmClose && (
        <Modal title="Fechar execução?" onClose={() => setConfirmClose(false)} footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmClose(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={doClose}>Fechar execução</button>
          </>
        }>
          <p style={{ color: 'var(--text-secondary)' }}>
            Depois de fechada, esta execução <strong style={{ color: 'var(--text-primary)' }}>não pode ser reaberta</strong>. Para testar novamente será preciso criar um novo ciclo (<strong style={{ color: 'var(--text-primary)' }}>Re-testar</strong>).
          </p>
        </Modal>
      )}
    </div>
  );
}

/* ── Monta a descrição completa do defeito com o cenário de teste ── */
function buildDefectDescription(opts: {
  caseTitle: string;
  preconditions: string;
  steps: TestStep[];
  stepResults: StepResult[];
  expectedResult: string;
  failedStepIdx?: number;
  stepComment?: string;
}): string {
  const STATUS_ICON: Record<string, string> = { passed: '✓', failed: '✗', blocked: '⊘', skipped: '→', untested: '○' };
  const parts: string[] = [];
  parts.push(`Cenário: ${opts.caseTitle}`);
  if (opts.preconditions?.trim()) {
    parts.push(`\nPré-condições:\n${opts.preconditions.trim()}`);
  }
  if (opts.steps.length > 0) {
    const lines: string[] = [];
    opts.steps.forEach((step, i) => {
      const sr = opts.stepResults[i];
      const icon = STATUS_ICON[sr?.status ?? 'untested'] ?? '○';
      const marker = i === opts.failedStepIdx ? ' ← FALHOU' : '';
      lines.push(`${icon} ${i + 1}. ${step.action}${marker}`);
      if (step.expected?.trim()) {
        lines.push(`   Resultado esperado: ${step.expected.trim()}`);
      }
    });
    parts.push(`\nPassos do cenário:\n${lines.join('\n')}`);
  }
  if (opts.expectedResult?.trim()) {
    parts.push(`\nResultado esperado (geral):\n${opts.expectedResult.trim()}`);
  }
  parts.push(`\nResultado obtido:\n${opts.stepComment?.trim() ?? ''}`);
  return parts.join('\n');
}

/* ── Passos do cenário (resultado por passo) ── */
function StepList({ steps, preconditions, expectedResult, caseTitle, result, editable, uploadingStep, defaultSectionOpen, onSetStep, onSetStepComment, onSaveStep, onUploadStep, onRemoveStepEvidence, onRenameStepEvidence, onLightbox, onDefect }: {
  steps: TestStep[]; preconditions: string; expectedResult: string; caseTitle: string; result: TestRunResult; editable: boolean; uploadingStep: string | null; defaultSectionOpen: boolean;
  onSetStep: (r: TestRunResult, idx: number, count: number, patch: Partial<StepResult>) => void;
  onSetStepComment: (r: TestRunResult, idx: number, count: number, comment: string) => void;
  onSaveStep: (r: TestRunResult) => void;
  onUploadStep: (r: TestRunResult, idx: number, count: number, files: FileList | File[] | null) => void;
  onRemoveStepEvidence: (r: TestRunResult, idx: number, count: number, evIdx: number) => void;
  onRenameStepEvidence: (r: TestRunResult, stepIdx: number, count: number, evIdx: number, name: string) => void;
  onLightbox: (e: Evidence) => void;
  onDefect: (r: TestRunResult, prefill: { title: string; description: string; resultadoObtido?: string }) => void;
}) {
  const count = steps.length;
  const sr = ensureStepResults(result, count);
  const doneCount = sr.filter((s) => s.status !== 'untested').length;
  const [dropOpen, setDropOpen] = useState<Set<number>>(new Set());
  const toggleDrop = (i: number) => setDropOpen((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const [sectionOpen, setSectionOpen] = useState(defaultSectionOpen);
  const [openSteps, setOpenSteps] = useState<Set<number>>(new Set()); // passos começam todos fechados
  const toggleStep = (i: number, open: boolean) => setOpenSteps((p) => { const n = new Set(p); open ? n.add(i) : n.delete(i); return n; });
  const [preOpen, setPreOpen] = useState(false);
  const [expOpen, setExpOpen] = useState(false);
  return (
    <div className="step-section">
      <button type="button" className={`step-section-head${sectionOpen ? ' open' : ''}`} onClick={() => setSectionOpen((o) => !o)}>
        <span className="step-section-chevron"><IconChevron /></span>
        Passos do Cenário ({count})
        <span className="step-section-progress">{doneCount}/{count}</span>
      </button>
      {sectionOpen && preconditions && (
        <div className={`custom-step custom-step--info${preOpen ? ' open' : ''}`}>
          <div className="custom-step-summary" onClick={() => setPreOpen((o) => !o)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPreOpen((o) => !o); } }}>
            <span className="custom-step-marker" aria-hidden>▸</span>
            <span className="step-summary-text">Pré-condições</span>
          </div>
          {preOpen && <div className="custom-step-content"><p className="step-info-text">{preconditions}</p></div>}
        </div>
      )}
      {sectionOpen && steps.map((step, i) => {
        const st = sr[i] ?? { status: 'untested', comment: '', evidence: [] };
        const checked = st.status !== 'untested';
        const open = openSteps.has(i);
        return (
          <div className={`custom-step status-${st.status}${open ? ' open' : ''}`} key={i}>
            <div className="custom-step-summary" onClick={() => toggleStep(i, !open)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleStep(i, !open); } }}>
              <span className="custom-step-marker" aria-hidden>▸</span>
              <input className="step-check" type="checkbox" checked={checked} disabled={!editable}
                onClick={(e) => e.stopPropagation()}
                onChange={() => editable && onSetStep(result, i, count, { status: checked ? 'untested' : 'passed' })}
                title={checked ? 'Marcar passo como não testado' : 'Marcar passo como passou'} />
              <span className="step-summary-text">{i + 1}. {step.action}</span>
              {st.status !== 'untested' && <span className={`tests-badge status-${st.status}`}>{RESULT_STATUS_LABEL[st.status]}</span>}
            </div>
            {open && (
            <div className="custom-step-content">
              {step.expected && (
                <div className="expected-box">
                  <strong>Resultado Esperado:</strong><br />
                  ✓ {step.expected}
                </div>
              )}
              {editable && (
                <div className="runner-actions step-actions">
                  {QUICK.map((q) => (
                    <button key={q.status} type="button"
                      className={`runner-mark mark-${q.status}${st.status === q.status ? ' on' : ''}`}
                      title={st.status === q.status ? 'Clique para remover o status' : undefined}
                      onClick={() => onSetStep(result, i, count, { status: st.status === q.status ? 'untested' : q.status })}>{q.label}</button>
                  ))}
                  <button type="button" className={`btn btn-ghost btn-xs runner-evi-btn${dropOpen.has(i) ? ' on' : ''}`} onClick={() => toggleDrop(i)} title="Anexar evidência"><IconUpload /> Adicionar evidência</button>
                  {st.status === 'failed' && (
                    <button type="button" className="btn btn-danger btn-xs" onClick={() => onDefect(result, {
                      title: `- Passo ${i + 1}: ${step.action}`,
                      description: buildDefectDescription({
                        caseTitle, preconditions, steps, stepResults: sr,
                        expectedResult, failedStepIdx: i, stepComment: st.comment,
                      }),
                      resultadoObtido: st.comment,
                    })}><IconBug /> Registrar defeito</button>
                  )}
                </div>
              )}
              {editable && dropOpen.has(i) && <EvidenceDrop uploading={uploadingStep === `${result.id}:${i}`} onFiles={(f) => onUploadStep(result, i, count, f)} />}
              {editable ? (
                <textarea className="runner-comment step-comment" placeholder="Comentário do passo…" value={st.comment}
                  onChange={(e) => onSetStepComment(result, i, count, e.target.value)} onBlur={() => onSaveStep(result)} />
              ) : st.comment ? <p className="runner-note">{st.comment}</p> : null}
              {st.evidence.length > 0 && (
                <div className="runner-evidence">
                  <span className="runner-evidence-label">Evidências ({st.evidence.length})</span>
                  <div className="runner-evidence-list">
                    {st.evidence.map((e, j) => (
                      <div className={`evi${isImage(e.url) ? ' evi--img' : ''}`} key={j}>
                        {isImage(e.url) ? (
                          <>
                            <button type="button" className="evi-thumb" onClick={() => onLightbox(e)} title={`Ver ${e.name}`}><img src={e.url} alt={e.name} /></button>
                            {editable
                              ? <EviCapInput name={e.name} onSave={(n) => onRenameStepEvidence(result, i, count, j, n)} />
                              : <span className="evi-cap" title={e.name}>{e.name}</span>}
                          </>
                        ) : (
                          <a className="evi-link" href={e.url} target="_blank" rel="noreferrer" title={e.name}><IconExternal /> {e.name}</a>
                        )}
                        {editable && <button className="evi-del" onClick={() => onRemoveStepEvidence(result, i, count, j)} title="Remover evidência" aria-label="Remover evidência"><IconX /></button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        );
      })}
      {sectionOpen && expectedResult && (
        <div className={`custom-step custom-step--info${expOpen ? ' open' : ''}`}>
          <div className="custom-step-summary" onClick={() => setExpOpen((o) => !o)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpOpen((o) => !o); } }}>
            <span className="custom-step-marker" aria-hidden>▸</span>
            <span className="step-summary-text">Resultado esperado</span>
          </div>
          {expOpen && <div className="custom-step-content"><p className="step-info-text">{expectedResult}</p></div>}
        </div>
      )}
    </div>
  );
}

/* ── Campo inline para renomear evidência ── */
function EviCapInput({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const [val, setVal] = useState(name);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const actionRef = useRef<'save' | 'cancel' | null>(null);
  useEffect(() => { setVal(name); }, [name]);
  const doSave = () => {
    const n = val.trim() || name;
    setVal(n);
    if (n !== name) onSave(n);
  };
  return (
    <div className="evi-cap-row" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        className="evi-cap--edit"
        value={val}
        placeholder={name}
        style={{ paddingRight: focused ? 28 : undefined }}
        onChange={(e) => setVal(e.target.value)}
        onFocus={() => { setFocused(true); actionRef.current = null; }}
        onBlur={() => { setFocused(false); if (actionRef.current !== 'cancel') doSave(); actionRef.current = null; }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); actionRef.current = 'save'; e.currentTarget.blur(); }
          if (e.key === 'Escape') { actionRef.current = 'cancel'; setVal(name); e.currentTarget.blur(); }
        }}
        title="Clique para renomear a imagem"
      />
      {focused && (
        <button
          type="button"
          className="evi-cap-ok"
          onMouseDown={(e) => { e.preventDefault(); actionRef.current = 'save'; inputRef.current?.blur(); }}
          title="Confirmar nome"
        ><IconCheck /></button>
      )}
    </div>
  );
}

/* ── Área de anexar evidência: colar (Ctrl+V), arrastar ou procurar ── */
function EvidenceDrop({ uploading, onFiles }: { uploading: boolean; onFiles: (f: FileList | File[]) => void }) {
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []); // foca ao abrir → Ctrl+V já funciona
  return (
    <div
      ref={ref}
      className={`evi-drop${over ? ' over' : ''}`}
      tabIndex={0}
      onClick={() => ref.current?.focus()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); }}
    >
      <IconUpload />
      <span>{uploading ? 'Enviando…' : 'Cole um print (Ctrl+V), arraste a imagem ou'}</span>
      <label className="evi-drop-browse" onClick={(e) => e.stopPropagation()}>
        Procurar Arquivo
        <input type="file" multiple hidden disabled={uploading} onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.target.value = ''; }} />
      </label>
    </div>
  );
}

/* ── Lightbox de evidência (imagem em tela cheia) ── */
function Lightbox({ ev, onClose }: { ev: Evidence; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="lightbox" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button className="lightbox-close" onClick={onClose} aria-label="Fechar"><IconX /></button>
      <figure className="lightbox-fig">
        <img src={ev.url} alt={ev.name} />
        <figcaption>{ev.name} · <a href={ev.url} target="_blank" rel="noreferrer">abrir original</a></figcaption>
      </figure>
    </div>
  );
}

/* ── Registrar defeito ── */
function DefectModal({ projectId, result, prefillTitle, prefillDescription, prefillResultado, prefillCompany, prefillAmbiente, prefillVersaoBackoffice, prefillVersaoB2b, runPlanId, runCardId, onClose }: {
  projectId: string; result: TestRunResult; prefillTitle?: string;
  prefillDescription?: string; prefillResultado?: string; prefillCompany?: string; prefillAmbiente?: string;
  prefillVersaoBackoffice?: string; prefillVersaoB2b?: string;
  runPlanId?: string | null; runCardId?: string | null;
  onClose: () => void;
}) {
  const [d, setD] = useState<Defect>(() => {
    const companyLabel = prefillCompany ? (COMPANIES.find((c) => c.value === prefillCompany)?.label ?? prefillCompany) : '';
    const now = new Date();
    const dateFmt = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    const line1 = [prefillAmbiente && `Ambiente: ${prefillAmbiente}`, companyLabel && `Company: ${companyLabel}`, `Data: ${dateFmt}`].filter(Boolean).join(' | ');
    const line2 = prefillVersaoBackoffice ? `Backoffice: ${prefillVersaoBackoffice}` : '';
    const line3 = prefillVersaoB2b ? `Portal B2B: ${prefillVersaoB2b}` : '';
    const ctxHeader = [line1, line2, line3].filter(Boolean).join('\n') + '\n\n';
    const baseDesc = prefillDescription ?? result.comment ?? '';
    return {
      id: genId(), projectId, kind: 'bug', runResultId: result.id, cardId: runCardId ?? null, planId: runPlanId ?? null, title: prefillTitle || '',
      description: ctxHeader + baseDesc,
      severity: 'medium', status: 'pending_azure', externalKey: null, createdBy: currentUserId(),
      createdAt: new Date().toISOString(), evidence: [],
      azureWorkItemId: null, azureConfigId: null, azureTemplateId: null,
      azureState: null, azureSyncedAt: null,
      azureCustomFields: {},
    };
  });
  const [resultadoObtido, setResultadoObtido] = useState(prefillResultado ?? '');
  const set = <K extends keyof Defect>(k: K, v: Defect[K]) => setD((p) => ({ ...p, [k]: v }));

  const salvar = async () => {
    if (!d.title.trim()) { showToast('Informe o título do defeito.', 'warning'); return; }
    /* Substitui a seção "Resultado obtido:" no description pelo valor do campo separado */
    const base = d.description.replace(/\nResultado obtido:[\s\S]*$/, '').trimEnd();
    const fullDesc = base + `\n\nResultado obtido:\n${resultadoObtido.trim()}`;
    if (!(await saveDefect({ ...d, title: d.title.trim(), description: fullDesc, externalKey: d.externalKey?.trim() || null }))) return;
    showToast('Defeito registrado.', 'success');
    onClose();
  };

  return (
    <Modal large title="Registrar Defeito" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-danger" onClick={salvar}>Registrar</button>
      </>
    }>
      <div className="form-group">
        <label>Título *</label>
        <input type="text" value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="Resumo do defeito" />
      </div>
      <div className="form-row">
        <div className="form-group"><label>Severidade</label>
          <select value={d.severity} onChange={(e) => set('severity', e.target.value as DefectSeverity)}>
            <option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="critical">Crítica</option>
          </select>
        </div>
      </div>

      {/* Contexto do cenário */}
      {d.description && (
        <div className="form-group">
          <label>Cenário / Passos</label>
          <textarea
            rows={10}
            value={d.description}
            onChange={(e) => set('description', e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>
      )}

      {/* Resultado obtido */}
      <div className="form-group">
        <label>Resultado obtido</label>
        <textarea
          rows={4}
          value={resultadoObtido}
          onChange={(e) => setResultadoObtido(e.target.value)}
          placeholder="Descreva o que aconteceu de fato…"
          autoFocus
        />
      </div>

      <div className="form-group">
        <label>Evidências <span className="form-label-opt">(prints/arquivos)</span></label>
        <PhotoUploader folderId={d.id} evidence={d.evidence} onChange={(ev) => set('evidence', ev)} />
      </div>
    </Modal>
  );
}

function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60); const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
function isImage(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url);
}
