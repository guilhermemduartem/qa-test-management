import { useEffect, useMemo, useState } from 'react';
import { TestsLayout } from './TestsLayout';
import { ProjectBar } from '../../components/tests/ProjectBar';
import { useActiveProject } from '../../hooks/useActiveProject';
import { showToast } from '../../lib/toast';
import {
  listCards, listPlans, listRuns, listDefects, listCases, listSprints, listMilestones,
} from '../../lib/testManagement';
import type { Card, TestPlan, TestRun, Defect, TestCase, Sprint, Milestone } from '../../types/tests';
import { formatDate } from '../../lib/utils';
import { IconNote, IconBug, IconPlay, IconCheck, IconAlertTriangle, IconLightbulb } from '../../components/tests/icons';

type CoverageStatus = 'uncovered' | 'planned' | 'in_progress' | 'tested' | 'has_bug';

const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  uncovered:   'Sem cobertura',
  planned:     'Planejado',
  in_progress: 'Em execução',
  tested:      'Testado',
  has_bug:     'Com bug',
};
const COVERAGE_COLOR: Record<CoverageStatus, string> = {
  uncovered:   '#94a3b8',
  planned:     '#6366f1',
  in_progress: '#f59e0b',
  tested:      '#10b981',
  has_bug:     '#ef4444',
};
const COVERAGE_ORDER: Record<CoverageStatus, number> = {
  has_bug: 0, uncovered: 1, in_progress: 2, planned: 3, tested: 4,
};

interface CardRow {
  card: Card;
  sprint: Sprint | undefined;
  milestone: Milestone | undefined;
  plans: TestPlan[];
  cases: TestCase[];
  runs: TestRun[];
  openDefects: Defect[];
  allDefects: Defect[];
  status: CoverageStatus;
}

export function RastreabilidadePage() {
  const { projects, activeId, setActiveId, reload, loading } = useActiveProject();
  const [rows, setRows]     = useState<CardRow[]>([]);
  const [busy, setBusy]     = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CoverageStatus | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async (pid: string) => {
    setBusy(true);
    try {
      const [cards, plans, runs, defects, cases, sprints, milestones] = await Promise.all([
        listCards(pid), listPlans(pid), listRuns(pid), listDefects(pid),
        listCases(pid), listSprints(pid), listMilestones(pid),
      ]);

      const sprintById    = new Map(sprints.map(s => [s.id, s]));
      const milestoneById = new Map(milestones.map(m => [m.id, m]));
      const plansByCard   = new Map<string, TestPlan[]>();
      const runsByPlan    = new Map<string, TestRun[]>();
      const casesByPlan   = new Map<string, TestCase[]>();
      const defectsByCard = new Map<string, Defect[]>();
      const defectsByPlan = new Map<string, Defect[]>();

      for (const p of plans) {
        if (p.cardId) { if (!plansByCard.has(p.cardId)) plansByCard.set(p.cardId, []); plansByCard.get(p.cardId)!.push(p); }
      }
      for (const r of runs) {
        if (r.planId) { if (!runsByPlan.has(r.planId)) runsByPlan.set(r.planId, []); runsByPlan.get(r.planId)!.push(r); }
      }
      for (const c of cases) {
        if (c.planId) { if (!casesByPlan.has(c.planId)) casesByPlan.set(c.planId, []); casesByPlan.get(c.planId)!.push(c); }
      }
      for (const d of defects) {
        if (d.cardId) { if (!defectsByCard.has(d.cardId)) defectsByCard.set(d.cardId, []); defectsByCard.get(d.cardId)!.push(d); }
        if (d.planId) { if (!defectsByPlan.has(d.planId)) defectsByPlan.set(d.planId, []); defectsByPlan.get(d.planId)!.push(d); }
      }

      const built: CardRow[] = cards.map(card => {
        const cardPlans = plansByCard.get(card.id) ?? [];
        const cardRuns  = cardPlans.flatMap(p => runsByPlan.get(p.id) ?? []);
        const cardCases = cardPlans.flatMap(p => casesByPlan.get(p.id) ?? []);
        const cardDefs  = [
          ...(defectsByCard.get(card.id) ?? []),
          ...cardPlans.flatMap(p => defectsByPlan.get(p.id) ?? []),
        ];
        // dedupe defects by id
        const deduped = [...new Map(cardDefs.map(d => [d.id, d])).values()];
        const openDefs = deduped.filter(d => d.status !== 'closed' && d.status !== 'resolved');

        let status: CoverageStatus;
        if (openDefs.length > 0)                     status = 'has_bug';
        else if (cardPlans.length === 0)             status = 'uncovered';
        else if (cardRuns.length === 0)              status = 'planned';
        else if (cardRuns.some(r => r.status !== 'closed')) status = 'in_progress';
        else                                          status = 'tested';

        return {
          card,
          sprint:    card.sprintId    ? sprintById.get(card.sprintId)       : undefined,
          milestone: card.milestoneId ? milestoneById.get(card.milestoneId) : undefined,
          plans: cardPlans, cases: cardCases, runs: cardRuns,
          openDefects: openDefs, allDefects: deduped, status,
        };
      });

      built.sort((a, b) => (COVERAGE_ORDER[a.status] ?? 9) - (COVERAGE_ORDER[b.status] ?? 9));
      setRows(built);
    } catch {
      showToast('Erro ao carregar dados.', 'error');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (activeId) load(activeId);
    else setRows([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const statusCounts = useMemo(() => {
    const c: Partial<Record<CoverageStatus, number>> = {};
    rows.forEach(r => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [rows]);

  const filtered = rows.filter(row => {
    if (statusFilter !== 'all' && row.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        row.card.title.toLowerCase().includes(q) ||
        String(row.card.azureId ?? '').includes(q) ||
        (row.sprint?.name ?? '').toLowerCase().includes(q) ||
        (row.milestone?.name ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalCovered   = rows.filter(r => r.status === 'tested' || r.status === 'in_progress').length;
  const coveragePct    = rows.length ? Math.round((totalCovered / rows.length) * 100) : 0;
  const totalBugCards  = rows.filter(r => r.status === 'has_bug').length;
  const totalUncovered = rows.filter(r => r.status === 'uncovered').length;

  const actions = <ProjectBar projects={projects} activeId={activeId} onChange={setActiveId} onCreated={reload} />;

  return (
    <TestsLayout title="Rastreabilidade" activeTest="rastreabilidade" actions={actions} loading={loading || busy}>
      {!activeId ? (
        <div className="tests-empty"><h2>Selecione um projeto</h2><p>Escolha ou crie um projeto no seletor acima.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <KpiTile label="User Stories" value={rows.length} color="#6366f1" icon={<IconNote width={20} height={20} />} />
            <KpiTile label="Sem cobertura" value={totalUncovered} color={totalUncovered > 0 ? '#94a3b8' : '#10b981'} icon={<IconLightbulb width={20} height={20} />} />
            <KpiTile label="Com bug aberto" value={totalBugCards} color={totalBugCards > 0 ? '#ef4444' : '#10b981'} icon={<IconBug width={20} height={20} />} />
            <KpiTile label="Cobertura" value={`${coveragePct}%`}
              color={coveragePct >= 80 ? '#10b981' : coveragePct >= 50 ? '#f59e0b' : '#ef4444'}
              icon={<IconCheck width={20} height={20} />}
              hint={`${totalCovered} de ${rows.length} executados`} />
          </div>

          {/* Painel */}
          <section className="tests-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="tests-panel-header" style={{ flexShrink: 0 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <IconNote width={14} height={14} style={{ color: '#6366f1' } as React.CSSProperties} />
                User Stories × Cobertura
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <button onClick={() => setStatusFilter('all')}
                  style={{ fontSize: 11, padding: '2px 10px', borderRadius: 99, border: `1px solid ${statusFilter === 'all' ? 'var(--accent)' : 'var(--border)'}`, background: statusFilter === 'all' ? 'var(--accent)' : 'transparent', color: statusFilter === 'all' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: statusFilter === 'all' ? 700 : 500 }}>
                  Todos {rows.length}
                </button>
                {(Object.keys(COVERAGE_LABEL) as CoverageStatus[]).map(s => {
                  const cnt = statusCounts[s] ?? 0;
                  if (!cnt) return null;
                  const active = statusFilter === s;
                  const col = COVERAGE_COLOR[s];
                  return (
                    <button key={s} onClick={() => setStatusFilter(active ? 'all' : s)}
                      style={{ fontSize: 11, padding: '2px 10px', borderRadius: 99, border: `1px solid ${active ? col : col + '55'}`, background: active ? col : col + '18', color: active ? '#fff' : col, cursor: 'pointer', fontWeight: 600 }}>
                      {COVERAGE_LABEL[s]} {cnt}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Busca */}
            <div style={{ flexShrink: 0, marginBottom: 12 }}>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por título, ID Azure, sprint ou milestone…"
                style={{ width: '100%', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {rows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 14 }}>
                Nenhuma User Story cadastrada neste projeto.
              </div>
            ) : filtered.length === 0 ? (
              <p className="tests-muted">Nenhuma User Story encontrada.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filtered.map(row => {
                  const col = COVERAGE_COLOR[row.status];
                  const isOpen = expanded === row.card.id;
                  return (
                    <div key={row.card.id} style={{ borderRadius: 10, border: '1px solid var(--border)', borderLeft: `4px solid ${col}`, background: 'var(--bg-input)', overflow: 'hidden' }}>

                      {/* Linha principal */}
                      <div
                        onClick={() => setExpanded(isOpen ? null : row.card.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', transition: 'background 0.12s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                        {/* ID Azure */}
                        {row.card.azureId != null && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', background: '#6366f118', border: '1px solid #6366f140', borderRadius: 5, padding: '1px 7px', flexShrink: 0 }}>
                            #{row.card.azureId}
                          </span>
                        )}

                        {/* Título */}
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.card.title}
                        </span>

                        {/* Sprint / Milestone */}
                        {(row.sprint || row.milestone) && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                            {row.sprint?.name ?? row.milestone?.name}
                          </span>
                        )}

                        {/* Contadores */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                          {row.plans.length > 0 && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-muted)' }}>
                              <IconNote width={11} height={11} /> {row.plans.length}
                            </span>
                          )}
                          {row.cases.length > 0 && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-muted)' }}>
                              <IconCheck width={11} height={11} /> {row.cases.length}
                            </span>
                          )}
                          {row.runs.length > 0 && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-muted)' }}>
                              <IconPlay width={11} height={11} /> {row.runs.length}
                            </span>
                          )}
                          {row.openDefects.length > 0 && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
                              <IconBug width={11} height={11} /> {row.openDefects.length}
                            </span>
                          )}
                        </div>

                        {/* Status */}
                        <span style={{ fontSize: 10, fontWeight: 700, color: col, background: `${col}18`, border: `1px solid ${col}40`, borderRadius: 5, padding: '2px 8px', flexShrink: 0 }}>
                          {COVERAGE_LABEL[row.status]}
                        </span>

                        {/* Chevron */}
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                          style={{ color: 'var(--text-muted)', flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>

                      {/* Detalhe expandido */}
                      {isOpen && (
                        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-surface)' }}>

                          {/* Planos */}
                          {row.plans.length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <IconAlertTriangle width={13} height={13} style={{ color: '#94a3b8' } as React.CSSProperties} />
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhum plano de teste vinculado a esta User Story.</span>
                            </div>
                          ) : (
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Planos de Teste
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                {row.plans.map(p => {
                                  const planRuns = row.runs.filter(r => r.planId === p.id);
                                  const planColor: Record<string, string> = {
                                    pendente: '#94a3b8', em_teste: '#60a5fa', com_bug: '#ef4444',
                                    bloqueado: '#f59e0b', finalizado: '#10b981', cancelado: '#94a3b8',
                                  };
                                  const planLabel: Record<string, string> = {
                                    pendente: 'Pendente', em_teste: 'Em teste', com_bug: 'Com bug',
                                    bloqueado: 'Bloqueado', finalizado: 'Finalizado', cancelado: 'Cancelado',
                                  };
                                  const col = planColor[p.status] ?? '#94a3b8';
                                  return (
                                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-input)' }}>
                                      <span style={{ fontSize: 11, fontWeight: 700, color: col, background: `${col}18`, border: `1px solid ${col}40`, borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>
                                        {planLabel[p.status] ?? p.status}
                                      </span>
                                      <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{formatDate(p.createdAt)}</span>
                                      {planRuns.length > 0 && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                                          <IconPlay width={10} height={10} /> {planRuns.length} exec.
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Casos */}
                          {row.cases.length > 0 && (
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Casos de Teste ({row.cases.length})
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                {row.cases.map(c => (
                                  <span key={c.id} style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 8px' }}>
                                    {c.title}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Bugs */}
                          {row.allDefects.length > 0 && (
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Bugs ({row.allDefects.length})
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                {row.allDefects.map(d => {
                                  const defCol = d.status === 'closed' || d.status === 'resolved' ? '#10b981' : '#ef4444';
                                  return (
                                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-input)', borderLeft: `3px solid ${defCol}` }}>
                                      {d.azureWorkItemId != null && (
                                        <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: '#ef444418', border: '1px solid #ef444440', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                                          {d.azureWorkItemId}
                                        </span>
                                      )}
                                      <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                                      <span style={{ fontSize: 10, fontWeight: 600, color: defCol, flexShrink: 0 }}>
                                        {d.status === 'closed' ? 'Fechado' : d.status === 'resolved' ? 'Resolvido' : d.status === 'in_progress' ? 'Em andamento' : d.status === 'open' ? 'Aberto' : 'Ag. Azure'}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      )}
    </TestsLayout>
  );
}

function KpiTile({ label, value, color, icon, hint }: { label: string; value: number | string; color: string; icon: React.ReactNode; hint?: string }) {
  return (
    <div className="tests-card" style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 8, right: 10, width: 34, height: 34, borderRadius: 10, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
        {icon}
      </div>
      <span className="tests-card-label">{label}</span>
      <span className="tests-card-value" style={{ color }}>{value}</span>
      {hint && <span className="tests-card-hint">{hint}</span>}
    </div>
  );
}
