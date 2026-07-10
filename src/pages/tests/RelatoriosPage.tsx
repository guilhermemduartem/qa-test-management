import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TestsLayout } from './TestsLayout';
import { ProjectBar } from '../../components/tests/ProjectBar';
import { useActiveProject } from '../../hooks/useActiveProject';
import {
  listCases, listRuns, listRunResults, listRequirements, listCaseRequirements,
  listDefects, listPlans, listSessions,
} from '../../lib/testManagement';
import {
  TYPE_LABEL, PRIORITY_LABEL, CASE_STATUS_LABEL, RESULT_STATUS_LABEL, DEFECT_STATUS_LABEL,
  type TestType, type TestPriority, type TestCaseStatus, type ResultStatus,
  type TestRun, type Defect, type ExploratorySession,
} from '../../types/tests';
import { cachedProfiles } from '../../lib/auth';
import { formatDate } from '../../lib/utils';

const COMPANY_MAP: Record<string, string> = {
  '7': 'Bedsonline', '8': 'Cativa', '10': 'Flot', '12': 'Smiles', '17': 'Azul',
};
import { IconBug, IconNote, IconLightbulb, IconAlertTriangle } from '../../components/tests/icons';

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--error)', high: 'var(--warning)', medium: '#f59e0b', low: 'var(--text-muted)',
};
const SEV_LABEL: Record<string, string> = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' };


interface RunStat {
  run: TestRun;
  passRate: number | null;
  passed: number; failed: number; blocked: number; skipped: number;
  totalExecuted: number; totalCases: number; elapsedSeconds: number;
}

interface Analytics {
  totalCases: number;
  byType: Record<string, number>; byPriority: Record<string, number>; byStatus: Record<string, number>;
  resultDist: Record<string, number>;
  passRate: number | null; coverage: number | null;
  defects: Defect[];
  defectsBySeverity: Record<string, number>; defectsByStatus: Record<string, number>;
  openDefects: Defect[]; criticalDefects: number;
  byUser: Record<string, number>;
  runStats: RunStat[];
  byAmbiente: Record<string, number>; byCompany: Record<string, number>;
  sessions: ExploratorySession[];
  sessionNotesByType: Record<string, number>;
  totalSessionDuration: number;
  byPlan: Array<{ name: string; runs: number; passRate: number | null; assignedTo: string | null }>;
  totalElapsedSeconds: number;
}

type RunSortKey = 'name' | 'ambiente' | 'company' | 'cycle' | 'total' | 'passed' | 'failed' | 'blocked' | 'skipped' | 'passRate' | 'elapsed' | 'date';
type SessSortKey = 'charter' | 'ambiente' | 'company' | 'duration' | 'notes' | 'bugs' | 'blockers' | 'ideas' | 'improvements' | 'date';

type RawData = {
  cases: Awaited<ReturnType<typeof listCases>>;
  runs: Awaited<ReturnType<typeof listRuns>>;
  allResults: Awaited<ReturnType<typeof listRunResults>>[];
  reqs: Awaited<ReturnType<typeof listRequirements>>;
  links: Awaited<ReturnType<typeof listCaseRequirements>>;
  defects: Awaited<ReturnType<typeof listDefects>>;
  plans: Awaited<ReturnType<typeof listPlans>>;
  sessions: Awaited<ReturnType<typeof listSessions>>;
};

export function RelatoriosPage() {
  const navigate = useNavigate();
  const { projects, activeId, setActiveId, reload, loading } = useActiveProject();
  const [raw, setRaw] = useState<RawData | null>(null);
  const [busy, setBusy] = useState(false);
  const [runSort, setRunSort] = useState<{ key: RunSortKey; dir: 1 | -1 }>({ key: 'passRate', dir: 1 });
  const [sessSort, setSessSort] = useState<{ key: SessSortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });

  const today = new Date(); today.setHours(23, 59, 59, 999);
  const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0,0,0,0); return d; };
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState<string>(fmt(daysAgo(30)));
  const [dateTo,   setDateTo]   = useState<string>(fmt(today));
  const [preset,   setPreset]   = useState<number>(30);
  const [personId, setPersonId] = useState<string>('');
  const applyPreset = (days: number) => { setPreset(days); setDateFrom(fmt(daysAgo(days))); setDateTo(fmt(today)); };

  const personOptions = useMemo(() => {
    if (!raw) return [];
    const nameMap = new Map(cachedProfiles().map(p => [p.id, p.nome]));
    const ids = new Set<string>();
    raw.allResults.flat().forEach(r => { if (r.executedBy) ids.add(r.executedBy); });
    raw.sessions.forEach(s => { if (s.createdBy) ids.add(s.createdBy); });
    raw.runs.forEach(r => { if (r.assignedTo) ids.add(r.assignedTo); });
    return [...ids].map(id => ({ id, name: nameMap.get(id) ?? id.slice(0, 8) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [raw]);

  useEffect(() => {
    if (!activeId) { setRaw(null); return; }
    setPersonId('');
    let cancel = false;
    (async () => {
      setBusy(true);
      const [cases, runs, reqs, defects, plans, sessions] = await Promise.all([
        listCases(activeId), listRuns(activeId), listRequirements(activeId),
        listDefects(activeId), listPlans(activeId), listSessions(activeId),
      ]);

      const allResults = (await Promise.all(runs.map(r => listRunResults(r.id))));
      const links = reqs.length ? await listCaseRequirements(cases.map(c => c.id)) : [];

      if (cancel) return;
      setRaw({ cases, runs, allResults, reqs, links, defects, plans, sessions });
      setBusy(false);
    })();
    return () => { cancel = true; };
  }, [activeId]);

  const a = useMemo<Analytics | null>(() => {
    if (!raw) return null;
    const { cases: allCases, runs: allRuns, allResults: allResultsRaw, reqs, links, defects: allDefects, plans, sessions: allSessions } = raw;

    const defects = allDefects.filter(d => { const dt = d.createdAt.slice(0, 10); return dt >= dateFrom && dt <= dateTo; });

    const cases = allCases.filter(c => {
      const d = c.createdAt.slice(0, 10);
      return d >= dateFrom && d <= dateTo;
    });
    const allRunsIdxMap = new Map(allRuns.map((r, i) => [r.id, i]));
    const runs = allRuns.filter(r => {
      const d = r.createdAt.slice(0, 10);
      if (d < dateFrom || d > dateTo) return false;
      if (personId) {
        const res = allResultsRaw[allRunsIdxMap.get(r.id)!] ?? [];
        const hasExec = res.some(x => x.executedBy === personId);
        if (!hasExec && r.assignedTo !== personId) return false;
      }
      return true;
    });
    const sessions = allSessions.filter(s => {
      const d = s.createdAt.slice(0, 10);
      if (d < dateFrom || d > dateTo) return false;
      if (personId && s.createdBy !== personId) return false;
      return true;
    });
    const allResults = runs.map(r => allResultsRaw[allRunsIdxMap.get(r.id)!] ?? []);

    const count = <T extends string>(arr: T[]): Record<string, number> =>
      arr.reduce((m, k) => { m[k] = (m[k] || 0) + 1; return m; }, {} as Record<string, number>);

    const flat = allResults.flat();
    const executed = flat.filter(r => r.status !== 'untested');
    const passed = executed.filter(r => r.status === 'passed').length;
    const reqsCovered = new Set(links.map(l => l.requirementId));

    const runStats: RunStat[] = runs.map((run, i) => {
      const res = allResults[i];
      const exec = res.filter(r => r.status !== 'untested');
      const p = exec.filter(r => r.status === 'passed').length;
      const f = exec.filter(r => r.status === 'failed').length;
      const bl = exec.filter(r => r.status === 'blocked').length;
      const sk = exec.filter(r => r.status === 'skipped').length;
      const elapsed = res.reduce((s, r) => s + (r.elapsedSeconds || 0), 0);
      return { run, passRate: exec.length ? Math.round((p / exec.length) * 100) : null, passed: p, failed: f, blocked: bl, skipped: sk, totalExecuted: exec.length, totalCases: res.length, elapsedSeconds: elapsed };
    });

    const byAmbiente = count(runs.filter(r => r.ambiente).map(r => r.ambiente as string));
    const byCompany = count(runs.filter(r => r.company).map(r => COMPANY_MAP[r.company as string] ?? r.company as string));

    const planMap: Record<string, { name: string; passArr: (number | null)[]; assignedTo: string | null }> = {};
    runs.forEach((run, i) => {
      if (!run.planId) return;
      const plan = plans.find(p => p.id === run.planId);
      if (!plan) return;
      if (!planMap[run.planId]) planMap[run.planId] = { name: plan.name, passArr: [], assignedTo: run.assignedTo };
      planMap[run.planId].passArr.push(runStats[i].passRate);
      if (run.assignedTo) planMap[run.planId].assignedTo = run.assignedTo;
    });
    const byPlan = Object.values(planMap).map(p => {
      const rates = p.passArr.filter(r => r !== null) as number[];
      return { name: p.name, runs: p.passArr.length, passRate: rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null, assignedTo: p.assignedTo };
    });

    const sessionNotesByType: Record<string, number> = {};
    sessions.forEach(s => s.notes.forEach(n => { const key = n.noteType ?? 'note'; sessionNotesByType[key] = (sessionNotesByType[key] || 0) + 1; }));

    const nameMap = new Map(cachedProfiles().map(p => [p.id, p.nome]));
    const rawByUser = count(flat.filter(r => r.executedBy).map(r => r.executedBy as string));
    const byUser: Record<string, number> = {};
    for (const [id, n] of Object.entries(rawByUser)) { const name = nameMap.get(id) ?? id.slice(0, 8); byUser[name] = (byUser[name] || 0) + n; }

    return {
      totalCases: cases.length,
      byType: count(cases.map(c => c.type)), byPriority: count(cases.map(c => c.priority)), byStatus: count(cases.map(c => c.status)),
      resultDist: count(flat.map(r => r.status)),
      passRate: executed.length ? Math.round((passed / executed.length) * 100) : null,
      coverage: reqs.length ? Math.round((reqs.filter(r => reqsCovered.has(r.id)).length / reqs.length) * 100) : null,
      defects, defectsBySeverity: count(defects.map(d => d.severity)), defectsByStatus: count(defects.map(d => d.status)),
      openDefects: defects.filter(d => ['pending_azure','open','in_progress'].includes(d.status)).sort((a, b) => { const ord: Record<string,number> = { critical:0,high:1,medium:2,low:3 }; return (ord[a.severity]??9)-(ord[b.severity]??9); }),
      criticalDefects: defects.filter(d => d.severity === 'critical' && ['open','in_progress','pending_azure'].includes(d.status)).length,
      byUser, runStats, byAmbiente, byCompany, sessions, sessionNotesByType,
      totalSessionDuration: sessions.reduce((s, x) => s + x.durationSeconds, 0),
      byPlan, totalElapsedSeconds: flat.reduce((s, r) => s + (r.elapsedSeconds || 0), 0),
    };
  }, [raw, dateFrom, dateTo, personId]);

  const filteredRunStats = a?.runStats ?? [];
  const filteredSessions = a?.sessions ?? [];

  const actions = <ProjectBar projects={projects} activeId={activeId} onChange={setActiveId} onCreated={reload} />;

  return (
    <TestsLayout title="Relatórios & Analytics" activeTest="relatorios" actions={actions} loading={loading || busy}>
      {!activeId ? (
        <div className="tests-empty"><h2>Selecione um projeto</h2><p>Escolha ou crie um projeto no seletor acima.</p></div>
      ) : busy || !a ? (
        <p className="tests-muted">Carregando analytics…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── Filtro de período ── */}
          <div className="rel-date-bar">
            {[7, 14, 30, 60, 90].map(d => (
              <button key={d} className={`btn btn-xs ${preset === d ? 'btn-primary' : 'btn-ghost'}`} onClick={() => applyPreset(d)}>{d}d</button>
            ))}
            <div className="rel-date-sep" />
            <div className="rel-date-range">
              <input type="date" className="rel-date-input" value={dateFrom} max={dateTo} onChange={e => { setDateFrom(e.target.value); setPreset(0); }} />
              <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 300 }}>–</span>
              <input type="date" className="rel-date-input" value={dateTo} min={dateFrom} onChange={e => { setDateTo(e.target.value); setPreset(0); }} />
            </div>
            {personOptions.length > 0 && (
              <>
                <div className="rel-date-sep" />
                <div className="rel-date-range" style={personId ? { borderColor: 'var(--accent)', background: 'var(--accent)' } : undefined}>
                  <select
                    className="rel-date-input"
                    value={personId}
                    onChange={e => setPersonId(e.target.value)}
                    style={{ minWidth: 130, color: personId ? '#fff' : undefined, fontWeight: personId ? 700 : undefined, background: 'transparent' }}
                  >
                    <option value="">Todas as pessoas</option>
                    {personOptions.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* ── KPIs globais ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <StatCard label="Casos de teste" value={a.totalCases} hint={`${a.byStatus['active'] ?? 0} ativos`} />
            <StatCard label="Taxa de aprovação" value={a.passRate === null ? '—' : `${a.passRate}%`}
              hint={`${a.resultDist['passed'] ?? 0} passaram`}
              tone={a.passRate === null ? undefined : a.passRate >= 80 ? 'ok' : a.passRate >= 50 ? 'warn' : 'bad'} />
            <StatCard label="Execuções" value={a.runStats.length} hint="no projeto" />
            <StatCard label="Tempo total" value={fmtDur(a.totalElapsedSeconds)} hint="em execuções" />
            <StatCard label="Defeitos totais" value={a.defects.length} hint={`${a.openDefects.length} abertos`} />
            <StatCard label="Defeitos críticos" value={a.criticalDefects}
              hint="abertos" tone={a.criticalDefects > 0 ? 'bad' : 'ok'} />
            <StatCard label="Cobertura req." value={a.coverage === null ? '—' : `${a.coverage}%`}
              hint="requisitos cobertos"
              tone={a.coverage === null ? undefined : a.coverage >= 80 ? 'ok' : a.coverage >= 50 ? 'warn' : 'bad'} />
            <StatCard label="Sessões explorat." value={a.sessions.length}
              hint={`${fmtDur(a.totalSessionDuration)} total`} />
          </div>

          {/* ── Seção: Casos de Teste ── */}
          <SectionHeader title="Casos de Teste" icon={<IconNote width={14} height={14} />} color="var(--accent)" />
          <div className="rel-grid">
            <BarPanel title="Por tipo" data={a.byType} labels={TYPE_LABEL as Record<string, string>} keys={['manual', 'automated', 'api', 'exploratory'] as TestType[]} />
            <BarPanel title="Por prioridade" data={a.byPriority} labels={PRIORITY_LABEL as Record<string, string>} keys={['critical', 'high', 'medium', 'low'] as TestPriority[]} />
            <BarPanel title="Por status" data={a.byStatus} labels={CASE_STATUS_LABEL as Record<string, string>} keys={['draft', 'active', 'deprecated'] as TestCaseStatus[]} />
          </div>

          {/* ── Seção: Execuções ── */}
          <SectionHeader title="Execuções" icon={<IconLightbulb width={14} height={14} />} color="var(--info)" />
          <div className="rel-grid">
            <BarPanel title="Distribuição de resultados" data={a.resultDist} labels={RESULT_STATUS_LABEL as Record<string, string>} keys={['passed', 'failed', 'blocked', 'skipped', 'retest', 'untested'] as ResultStatus[]} />
            <BarPanel title="Por ambiente" data={a.byAmbiente} labels={{}} keys={Object.keys(a.byAmbiente)} useKeyAsLabel />
            <BarPanel title="Por empresa/produto" data={a.byCompany} labels={{}} keys={Object.keys(a.byCompany)} useKeyAsLabel />
            <BarPanel title="Produtividade (execuções por usuário)" data={a.byUser} labels={{}} keys={Object.keys(a.byUser)} useKeyAsLabel />
          </div>

          {/* Tabela de runs */}
          {filteredRunStats.length > 0 && (
            <section className="tests-panel">
              <div className="tests-panel-header">
                <h3>Histórico de execuções</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/testes/runs')}>Ver execuções</button>
              </div>
              {(() => {
                const th = (label: string, key: RunSortKey, center?: boolean) => {
                  const active = runSort.key === key;
                  return (
                    <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: center ? 'center' : undefined, whiteSpace: 'nowrap' }}
                      onClick={() => setRunSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) as 1 | -1 : -1 }))}>
                      {label} <span style={{ opacity: active ? 1 : 0.3 }}>{active ? (runSort.dir === -1 ? '↑' : '↓') : '↕'}</span>
                    </th>
                  );
                };
                const sortVal = (s: RunStat): string | number => {
                  switch (runSort.key) {
                    case 'name':     return s.run.name.toLowerCase();
                    case 'ambiente': return s.run.ambiente ?? '';
                    case 'company':  return s.run.company ? (COMPANY_MAP[s.run.company] ?? s.run.company) : '';
                    case 'cycle':    return s.run.cycle ?? 0;
                    case 'total':    return s.totalCases;
                    case 'passed':   return s.passed;
                    case 'failed':   return s.failed;
                    case 'blocked':  return s.blocked;
                    case 'skipped':  return s.skipped;
                    case 'passRate': return s.passRate ?? -1;
                    case 'elapsed':  return s.elapsedSeconds;
                    case 'date':     return s.run.createdAt;
                  }
                };
                const sorted = [...filteredRunStats].sort((a, b) => {
                  const av = sortVal(a), bv = sortVal(b);
                  const cmp = av < bv ? -1 : av > bv ? 1 : 0;
                  return cmp * runSort.dir;
                });
                return (
                  <table className="tests-table">
                    <thead>
                      <tr>
                        {th('Execução', 'name')}
                        {th('Ambiente', 'ambiente')}
                        {th('Empresa', 'company')}
                        {th('Ciclo', 'cycle', true)}
                        {th('Total', 'total', true)}
                        {th('Passou', 'passed', true)}
                        {th('Falhou', 'failed', true)}
                        {th('Bloqueado', 'blocked', true)}
                        {th('Pulado', 'skipped', true)}
                        {th('Aprovação', 'passRate', true)}
                        {th('Tempo', 'elapsed')}
                        {th('Data', 'date')}
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(s => (
                        <tr key={s.run.id} style={s.passRate === 100 ? { opacity: 0.4 } : undefined}>
                          <td style={{ maxWidth: 220 }}>
                            {(() => {
                              const uid = s.run.assignedTo;
                              const prof = uid ? cachedProfiles().find(x => x.id === uid) : null;
                              const avatarUrl = uid ? (localStorage.getItem(`prof-avatar-${uid}`) ?? '') : '';
                              const ini = prof ? prof.nome.trim().split(/\s+/).slice(0,2).map(w => w[0]?.toUpperCase() ?? '').join('') : '?';
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {uid && (
                                    <span className="rel-plan-avatar-wrap" data-tooltip={prof?.nome ?? ''}>
                                      {avatarUrl
                                        ? <img src={avatarUrl} alt="" className="rel-plan-avatar" />
                                        : <span className="rel-plan-avatar rel-plan-avatar-ini">{ini}</span>
                                      }
                                    </span>
                                  )}
                                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.run.name}</span>
                                </div>
                              );
                            })()}
                          </td>
                          <td><span className="tests-muted-cell">{s.run.ambiente ?? '—'}</span></td>
                          <td><span className="tests-muted-cell">{s.run.company ? (COMPANY_MAP[s.run.company] ?? s.run.company) : '—'}</span></td>
                          <td style={{ textAlign: 'center' }}><span className="tests-muted-cell">#{s.run.cycle}</span></td>
                          <td style={{ textAlign: 'center' }}>{s.totalCases}</td>
                          <td style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 700 }}>{s.passed}</td>
                          <td style={{ textAlign: 'center', color: 'var(--error)', fontWeight: 700 }}>{s.failed}</td>
                          <td style={{ textAlign: 'center', color: 'var(--warning)', fontWeight: 700 }}>{s.blocked}</td>
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{s.skipped}</td>
                          <td style={{ textAlign: 'center' }}>
                            {s.passRate === null ? <span className="tests-muted-cell">—</span> : (
                              <span style={{ fontWeight: 700, color: s.passRate >= 80 ? 'var(--success)' : s.passRate >= 50 ? 'var(--warning)' : 'var(--error)' }}>{s.passRate}%</span>
                            )}
                          </td>
                          <td><span className="tests-muted-cell">{fmtDur(s.elapsedSeconds)}</span></td>
                          <td><span className="tests-muted-cell">{formatDate(s.run.createdAt)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </section>
          )}

          {/* Por plano */}
          {a.byPlan.length > 0 && (
            <section className="tests-panel">
              <div className="tests-panel-header"><h3>Aprovação por plano de teste</h3></div>
              <div className="rel-bars">
                {[...a.byPlan].sort((a, b) => {
                  const aDone = a.passRate === 100;
                  const bDone = b.passRate === 100;
                  if (aDone !== bDone) return aDone ? 1 : -1;
                  return (b.passRate ?? -1) - (a.passRate ?? -1);
                }).map(p => (
                  <div className="rel-bar-row" key={p.name} style={{ gridTemplateColumns: '340px 1fr 90px', opacity: p.passRate === 100 ? 0.4 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      {p.assignedTo && (() => {
                        const prof = cachedProfiles().find(x => x.id === p.assignedTo);
                        const avatarUrl = localStorage.getItem(`prof-avatar-${p.assignedTo}`) ?? '';
                        const ini = prof ? prof.nome.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') : '?';
                        const nome = prof?.nome ?? '';
                        return (
                          <span className="rel-plan-avatar-wrap" data-tooltip={nome}>
                            {avatarUrl
                              ? <img src={avatarUrl} alt="" className="rel-plan-avatar" />
                              : <span className="rel-plan-avatar rel-plan-avatar-ini">{ini}</span>
                            }
                          </span>
                        );
                      })()}
                      <span className="rel-bar-label rel-bar-label-truncate" title={p.name}>
                        {p.name.length > 50 ? p.name.slice(0, 50) + '…' : p.name}
                      </span>
                    </div>
                    <div className="rel-bar-track">
                      <div className="rel-bar-fill" style={{ width: `${p.passRate ?? 0}%`, background: (p.passRate ?? 0) >= 80 ? 'var(--success)' : (p.passRate ?? 0) >= 50 ? 'var(--warning)' : 'var(--error)' }} />
                    </div>
                    <span className="rel-bar-value">{p.passRate === null ? '—' : `${p.passRate}%`} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({p.runs} run{p.runs !== 1 ? 's' : ''})</span></span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Seção: Defeitos ── */}
          <SectionHeader title="Defeitos" icon={<IconBug width={14} height={14} />} color="var(--error)" />
          <div className="rel-grid">
            <BarPanel title="Por severidade" data={a.defectsBySeverity} labels={SEV_LABEL} keys={['critical', 'high', 'medium', 'low']} />
            <BarPanel title="Por status" data={a.defectsByStatus} labels={DEFECT_STATUS_LABEL as Record<string, string>}
              keys={['pending_azure', 'open', 'in_progress', 'resolved', 'closed']} />
          </div>

          {/* Lista de bugs abertos */}
          {a.openDefects.length > 0 && (
            <section className="tests-panel">
              <div className="tests-panel-header">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <IconAlertTriangle width={14} height={14} style={{ color: 'var(--error)' } as React.CSSProperties} />
                  Bugs em aberto ({a.openDefects.length})
                </h3>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/testes/defects')}>Ver defeitos</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="tests-table">
                  <thead>
                    <tr><th>Título</th><th>Severidade</th><th>Status</th><th>Criado em</th></tr>
                  </thead>
                  <tbody>
                    {a.openDefects.map(bug => (
                      <tr key={bug.id}>
                        <td style={{ fontWeight: 600 }}>{bug.title}</td>
                        <td>
                          <span style={{ fontSize: 11, fontWeight: 700, color: SEV_COLOR[bug.severity], background: `${SEV_COLOR[bug.severity]}18`, border: `1px solid ${SEV_COLOR[bug.severity]}40`, borderRadius: 5, padding: '2px 7px' }}>{SEV_LABEL[bug.severity]}</span>
                        </td>
                        <td><span className={`tests-badge def-${bug.status}`}>{DEFECT_STATUS_LABEL[bug.status]}</span></td>
                        <td><span className="tests-muted-cell">{formatDate(bug.createdAt)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Seção: Sessões Exploratórias ── */}
          {filteredSessions.length > 0 && (
            <>
              <SectionHeader title="Sessões Exploratórias" icon={<IconLightbulb width={14} height={14} />} color="#f59e0b" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <StatCard label="Sessões" value={filteredSessions.length} hint="total" />
                <StatCard label="Tempo total" value={fmtDur(a.totalSessionDuration)} hint="em sessões" />
                <StatCard label="Observações" value={a.sessionNotesByType['note'] ?? 0} hint="anotações" />
                <StatCard label="Bugs encontrados" value={a.sessionNotesByType['bug'] ?? 0} hint="em sessões" tone={(a.sessionNotesByType['bug'] ?? 0) > 0 ? 'bad' : 'ok'} />
                <StatCard label="Bloqueios" value={a.sessionNotesByType['blocker'] ?? 0} hint="registrados" tone={(a.sessionNotesByType['blocker'] ?? 0) > 0 ? 'warn' : undefined} />
                <StatCard label="Ideias" value={(a.sessionNotesByType['idea'] ?? 0) + (a.sessionNotesByType['improvement'] ?? 0)} hint="e melhorias" />
              </div>

              <section className="tests-panel">
                <div className="tests-panel-header">
                  <h3>Detalhe de sessões exploratórias</h3>
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate('/testes/exploratorio')}>Ver sessões</button>
                </div>
                {(() => {
                  const sth = (label: string, key: SessSortKey, center?: boolean) => (
                    <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: center ? 'center' : undefined, whiteSpace: 'nowrap' }}
                      onClick={() => setSessSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) as 1 | -1 : -1 }))}>
                      {label} <span style={{ opacity: sessSort.key === key ? 1 : 0.3 }}>{sessSort.key === key ? (sessSort.dir === -1 ? '↑' : '↓') : '↕'}</span>
                    </th>
                  );
                  const sessSortVal = (s: typeof filteredSessions[0]): string | number => {
                    const bugs = s.notes.filter(n => n.noteType === 'bug' || n.bugId).length;
                    switch (sessSort.key) {
                      case 'charter':      return s.charter?.toLowerCase() ?? '';
                      case 'ambiente':     return s.ambiente ?? '';
                      case 'company':      return s.company ? (COMPANY_MAP[s.company] ?? s.company) : '';
                      case 'duration':     return s.durationSeconds;
                      case 'notes':        return s.notes.length;
                      case 'bugs':         return bugs;
                      case 'blockers':     return s.notes.filter(n => n.noteType === 'blocker').length;
                      case 'ideas':        return s.notes.filter(n => n.noteType === 'idea').length;
                      case 'improvements': return s.notes.filter(n => n.noteType === 'improvement').length;
                      case 'date':         return s.createdAt;
                    }
                  };
                  const sortedSess = [...filteredSessions].sort((a, b) => {
                    const av = sessSortVal(a), bv = sessSortVal(b);
                    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
                    return cmp * sessSort.dir;
                  });
                  return (
                    <table className="tests-table">
                      <thead>
                        <tr>{sth('Charter','charter')}{sth('Ambiente','ambiente')}{sth('Empresa','company')}{sth('Duração','duration')}{sth('Notas','notes',true)}{sth('Bugs','bugs',true)}{sth('Bloqueios','blockers',true)}{sth('Ideias','ideas',true)}{sth('Melhorias','improvements',true)}{sth('Data','date')}</tr>
                      </thead>
                      <tbody>
                        {sortedSess.map(s => {
                          const bugs = s.notes.filter(n => n.noteType === 'bug' || n.bugId).length;
                          const blockers = s.notes.filter(n => n.noteType === 'blocker').length;
                          const ideas = s.notes.filter(n => n.noteType === 'idea').length;
                          const improvements = s.notes.filter(n => n.noteType === 'improvement').length;
                          const prof = s.createdBy ? cachedProfiles().find(x => x.id === s.createdBy) : null;
                          const avatarUrl = s.createdBy ? (localStorage.getItem(`prof-avatar-${s.createdBy}`) ?? '') : '';
                          const ini = prof ? prof.nome.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') : '?';
                          return (
                            <tr key={s.id} style={s.status === 'closed' ? { opacity: 0.4 } : undefined}>
                              <td style={{ maxWidth: 240 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {s.createdBy && (
                                    <span className="rel-plan-avatar-wrap" data-tooltip={prof?.nome ?? ''}>
                                      {avatarUrl
                                        ? <img src={avatarUrl} alt="" className="rel-plan-avatar" />
                                        : <span className="rel-plan-avatar rel-plan-avatar-ini">{ini}</span>
                                      }
                                    </span>
                                  )}
                                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.charter || '—'}</span>
                                </div>
                              </td>
                              <td><span className="tests-muted-cell">{s.ambiente ?? '—'}</span></td>
                              <td><span className="tests-muted-cell">{s.company ? (COMPANY_MAP[s.company] ?? s.company) : '—'}</span></td>
                              <td><span className="tests-muted-cell">{fmtDur(s.durationSeconds)}</span></td>
                              <td style={{ textAlign: 'center' }}>{s.notes.length}</td>
                              <td style={{ textAlign: 'center' }}>{bugs > 0 ? <span style={{ color: 'var(--error)', fontWeight: 700 }}>{bugs}</span> : <span className="tests-muted-cell">0</span>}</td>
                              <td style={{ textAlign: 'center' }}>{blockers > 0 ? <span style={{ color: 'var(--warning)', fontWeight: 700 }}>{blockers}</span> : <span className="tests-muted-cell">0</span>}</td>
                              <td style={{ textAlign: 'center' }}>{ideas > 0 ? <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{ideas}</span> : <span className="tests-muted-cell">0</span>}</td>
                              <td style={{ textAlign: 'center' }}>{improvements > 0 ? <span style={{ color: '#22c55e', fontWeight: 700 }}>{improvements}</span> : <span className="tests-muted-cell">0</span>}</td>
                              <td><span className="tests-muted-cell">{formatDate(s.createdAt)}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}
              </section>
            </>
          )}

          {/* ── Planos de teste ── */}
          {a.byPlan.length === 0 && a.runStats.length === 0 && (
            <p className="tests-muted">Nenhuma execução registrada neste projeto ainda.</p>
          )}

        </div>
      )}
    </TestsLayout>
  );
}

/* ── Helpers de UI ── */

function SectionHeader({ title, icon, color }: { title: string; icon: React.ReactNode; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2, borderBottom: `2px solid ${color}30` }}>
      <span style={{ color, display: 'flex' }}>{icon}</span>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{title}</h2>
    </div>
  );
}

function StatCard({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="tests-card">
      <span className="tests-card-label">{label}</span>
      <span className={`tests-card-value${tone ? ` tone-${tone}` : ''}`}>{value}</span>
      {hint && <span className="tests-card-hint">{hint}</span>}
    </div>
  );
}

function BarPanel({ title, data, labels, keys, useKeyAsLabel }: {
  title: string; data: Record<string, number>; labels: Record<string, string>; keys: string[]; useKeyAsLabel?: boolean;
}) {
  const present = keys.filter(k => (data[k] || 0) > 0);
  const max = Math.max(1, ...present.map(k => data[k] || 0));
  return (
    <section className="tests-panel">
      <div className="tests-panel-header"><h3>{title}</h3></div>
      {present.length === 0 ? <p className="tests-muted">Sem dados.</p> : (
        <div className="rel-bars">
          {present.map(k => (
            <div className="rel-bar-row" key={k}>
              <span className="rel-bar-label">{useKeyAsLabel ? k : (labels[k] ?? k)}</span>
              <div className="rel-bar-track"><div className={`rel-bar-fill bar-${k}`} style={{ width: `${((data[k] || 0) / max) * 100}%` }} /></div>
              <span className="rel-bar-value">{data[k] || 0}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function fmtDur(seconds: number): string {
  if (!seconds || seconds < 60) return seconds ? `${seconds}s` : '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}min`;
}

// Explicit export for ExploratorySession to satisfy type inference
type _ESRef = ExploratorySession;
export type { _ESRef as _ExploratorySessionRef };
