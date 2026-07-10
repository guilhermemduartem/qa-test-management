/* ═══════════════════════════════════════════════════════════
   PlanosPage — Marcos → Sprints → Cards → Planos de Teste.
   ═══════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from 'react';
import { TestsLayout } from './TestsLayout';
import { ProjectBar } from '../../components/tests/ProjectBar';
import { Modal } from '../../components/Modal';
import { useActiveProject } from '../../hooks/useActiveProject';
import { IconPlus, IconPencil, IconTrash } from '../../components/tests/icons';
import { can, cachedProfiles, currentUser } from '../../lib/auth';
import { showToast } from '../../lib/toast';
import { formatDate, formatDateOnly } from '../../lib/utils';
import {
  genId, currentUserId,
  listMilestones, saveMilestone, deleteMilestone,
  listSprints, saveSprint, deleteSprint,
  listCards, saveCard, deleteCard,
  listPlans, savePlan, deletePlan, listRuns, listDefects,
} from '../../lib/testManagement';
import { listAzureConfigs, getMyAzureSettings } from '../../lib/azureManagement';
import { getWorkItem, getComments, getMyAzureId, inlineCommentImages } from '../../lib/azureDevOps';
import { DEFECT_SEVERITY_LABEL, DEFECT_STATUS_LABEL } from '../../types/tests';
import type { Milestone, Sprint, Card, CardStatus, TestPlan, TestRun, MilestoneStatus, SprintStatus, PlanStatus, Defect } from '../../types/tests';
import type { AzureConfig, AzureComment } from '../../types/azure';

const MS_STATUS: Record<MilestoneStatus, string> = { open: 'Aberto', completed: 'Concluído', cancelled: 'Cancelado' };
const SP_STATUS: Record<SprintStatus, string> = { planejada: 'Planejada', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' };
const PLAN_STATUS: Record<PlanStatus, string> = { pendente: 'Pendente', em_teste: 'Em teste', com_bug: 'Com bug', bloqueado: 'Bloqueado', finalizado: 'Finalizado', cancelado: 'Cancelado' };
const planStatusClass: Record<PlanStatus, string> = { pendente: 'status-open', em_teste: 'status-in_progress', com_bug: 'status-failed', bloqueado: 'status-skipped', finalizado: 'status-closed', cancelado: 'status-skipped' };
const CARD_STATUS: Record<CardStatus, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' };
const isImage = (url: string) => /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url);

const HELP = (
  <>
    <strong>Como usar esta tela</strong>
    <ul>
      <li><b>Marcos</b> são metas com prazo (ex.: Release 2.0).</li>
      <li><b>Sprints</b> ficam dentro de um marco e organizam o trabalho por iteração.</li>
      <li><b>Cards</b> representam funcionalidades/demandas a testar — pode buscar direto do Azure pelo ID.</li>
      <li><b>Planos de Teste</b> agrupam execuções e são vinculados a uma sprint e a um marco.</li>
    </ul>
  </>
);

export function PlanosPage() {
  const { projects, activeId, setActiveId, reload, loading } = useActiveProject();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [azureConfigs, setAzureConfigs] = useState<AzureConfig[]>([]);
  const [myPat, setMyPat] = useState('');

  const [msModal, setMsModal] = useState(false);
  const [spModal, setSpModal] = useState(false);
  const [cardModal, setCardModal] = useState(false);
  const [planModal, setPlanModal] = useState(false);
  const [editMs, setEditMs] = useState<Milestone | null>(null);
  const [editSp, setEditSp] = useState<Sprint | null>(null);
  const [editCard, setEditCard] = useState<Card | null>(null);
  const [editPlan, setEditPlan] = useState<TestPlan | null>(null);
  const [viewingCard, setViewingCard] = useState<Card | null>(null);
  const [viewingMs, setViewingMs] = useState<Milestone | null>(null);
  const [viewingSp, setViewingSp] = useState<Sprint | null>(null);
  const [viewingPlan, setViewingPlan] = useState<TestPlan | null>(null);

  const [filterMs, setFilterMs] = useState('');
  const [filterSp, setFilterSp] = useState('');
  const [filterCard, setFilterCard] = useState('');
  const [filterPlan, setFilterPlan] = useState('');

  const [msPage, setMsPage] = useState(1);      const [msPgSz, setMsPgSz] = useState(10);
  const [spPage, setSpPage] = useState(1);      const [spPgSz, setSpPgSz] = useState(10);
  const [cardPage, setCardPage] = useState(1);  const [cardPgSz, setCardPgSz] = useState(10);
  const [planPage, setPlanPage] = useState(1);  const [planPgSz, setPlanPgSz] = useState(10);

  const [confirmDlg, setConfirmDlg] = useState<{ tipo: string; message: string; onConfirm: () => void } | null>(null);
  const confirm = (tipo: string, message: string, onConfirm: () => void) => setConfirmDlg({ tipo, message, onConfirm });

  const [blockedDlg, setBlockedDlg] = useState<{ tipo: string; name: string; reason: string; items: string[] } | null>(null);
  const blockDelete = (tipo: string, name: string, reason: string, items: string[]) => setBlockedDlg({ tipo, name, reason, items });

  const podeEscrever = can('create');

  const load = async (pid: string) => {
    const [m, sp, c, p, r, d] = await Promise.all([
      listMilestones(pid), listSprints(pid), listCards(pid), listPlans(pid), listRuns(pid), listDefects(pid),
    ]);
    setMilestones(m); setSprints(sp); setCards(c); setPlans(p); setRuns(r); setDefects(d);
  };

  useEffect(() => {
    if (activeId) load(activeId);
    else { setMilestones([]); setSprints([]); setCards([]); setPlans([]); setRuns([]); setDefects([]); }
  }, [activeId]);

  useEffect(() => {
    listAzureConfigs().then(setAzureConfigs);
    getMyAzureSettings().then((s) => { if (s) setMyPat(s.pat); });
  }, []);

  const runsOfPlan = (planId: string) => runs.filter((r) => r.planId === planId);
  const actions = <ProjectBar projects={projects} activeId={activeId} onChange={setActiveId} onCreated={reload} />;

  const azureApiCfg = azureConfigs.length > 0 && myPat
    ? { organization: azureConfigs[0].organization, project: azureConfigs[0].project, pat: myPat }
    : null;

  const q = (s: string) => (s ?? '').toLowerCase();
  const pg = <T,>(list: T[], page: number, size: number) => list.slice((page - 1) * size, page * size);

  const filteredMs = milestones.filter((m) => {
    const t = q(filterMs); if (!t) return true;
    return q(m.name).includes(t) || q(MS_STATUS[m.status]).includes(t) || (m.dueDate && q(formatDate(m.dueDate)).includes(t));
  });
  const filteredSp = sprints.filter((s) => {
    const t = q(filterSp); if (!t) return true;
    const ms = milestones.find((m) => m.id === s.milestoneId);
    return q(s.name).includes(t) || (ms && q(ms.name).includes(t)) || q(SP_STATUS[s.status]).includes(t) || q(formatDateOnly(s.startDate)).includes(t) || q(formatDateOnly(s.endDate)).includes(t);
  });
  const filteredCards = cards.filter((c) => {
    const t = q(filterCard); if (!t) return true;
    const sp = sprints.find((s) => s.id === c.sprintId);
    const ms = milestones.find((m) => m.id === (c.milestoneId ?? sp?.milestoneId));
    return q(c.title).includes(t) || (c.azureId && String(c.azureId).includes(t)) || (sp && q(sp.name).includes(t)) || (ms && q(ms.name).includes(t)) || q(CARD_STATUS[c.status]).includes(t) || q(c.resumo).includes(t) || q(c.objetivo).includes(t);
  });
  const filteredPlans = plans.filter((p) => {
    const t = q(filterPlan); if (!t) return true;
    const linkedCard = cards.find((c) => c.id === p.cardId);
    const sp = sprints.find((s) => s.id === (p.sprintId ?? linkedCard?.sprintId));
    const ms = milestones.find((m) => m.id === (p.milestoneId ?? sp?.milestoneId ?? linkedCard?.milestoneId));
    const criador = p.createdBy ? (cachedProfiles().find((pr) => pr.id === p.createdBy)?.nome ?? '') : '';
    return q(p.name).includes(t) || (linkedCard && q(linkedCard.title).includes(t)) || (ms && q(ms.name).includes(t)) || (sp && q(sp.name).includes(t)) || q(criador).includes(t);
  });

  const pagedMs    = pg(filteredMs,    msPage,   msPgSz);
  const pagedSp    = pg(filteredSp,    spPage,   spPgSz);
  const pagedCards = pg(filteredCards, cardPage, cardPgSz);
  const pagedPlans = pg(filteredPlans, planPage, planPgSz);

  return (
    <TestsLayout title="Planejamento" activeTest="planos" actions={actions} help={HELP} loading={loading}>
      {!activeId ? (
        <div className="tests-empty"><h2>Selecione um projeto</h2><p>Escolha ou crie um projeto no seletor acima.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '0 0 32px' }}>

          {/* ── Marcos ── */}
          <section className="tests-panel">
            <div className="casos-searchblock-top" style={{ padding: '14px 18px 12px' }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>Marcos (Milestones)</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={filterMs} onChange={(e) => { setFilterMs(e.target.value); setMsPage(1); }} placeholder="Filtrar marcos…" style={{ padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, width: 200, background: 'var(--surface)' }} />
                {podeEscrever && <button className="btn btn-primary btn-sm casos-new-btn" onClick={() => setMsModal(true)}><IconPlus /> Novo Marco</button>}
              </div>
            </div>
            {milestones.length === 0 ? (
              <p className="tests-muted" style={{ padding: '0 18px 16px' }}>Nenhum marco criado.</p>
            ) : (
              <div className="casos-table-wrap" style={{ borderTop: '1px solid var(--border)' }}>
                <table className="tests-table">
                  <thead><tr><th>Marco</th><th>Prazo</th><th>Sprints</th><th>Cards</th><th>Planos</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {pagedMs.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', padding: '16px 0' }}>Nenhum resultado encontrado.</td></tr>}
                    {pagedMs.map((m) => {
                      const msSprintIds = sprints.filter((s) => s.milestoneId === m.id).map((s) => s.id);
                      const cardCount = cards.filter((c) => c.milestoneId === m.id || (c.sprintId && msSprintIds.includes(c.sprintId))).length;
                      return (
                      <tr key={m.id}>
                        <td style={{ fontWeight: 500 }}><button className="casos-link" style={{ fontWeight: 500 }} onClick={() => setViewingMs(m)}>{m.name}</button></td>
                        <td className="tests-muted-cell">{m.dueDate ? formatDate(m.dueDate) : '—'}</td>
                        <td className="tests-muted-cell">{sprints.filter((s) => s.milestoneId === m.id).length}</td>
                        <td className="tests-muted-cell">{cardCount}</td>
                        <td className="tests-muted-cell">{plans.filter((p) => { const lc = cards.find((c) => c.id === p.cardId); const sp2 = sprints.find((s) => s.id === (p.sprintId ?? lc?.sprintId)); return p.milestoneId === m.id || sp2?.milestoneId === m.id || lc?.milestoneId === m.id; }).length}</td>
                        <td><span className={`tests-badge status-${m.status === 'completed' ? 'closed' : m.status === 'cancelled' ? 'skipped' : 'open'}`}>{MS_STATUS[m.status]}</span></td>
                        <td className="casos-actions-cell">
                          <div className="casos-rowactions">
                            {podeEscrever && <button className="tests-iconbtn" onClick={() => setEditMs(m)} title="Editar marco"><IconPencil /></button>}
                            {can('delete') && <button className="tests-iconbtn danger" onClick={() => {
                              const linked = sprints.filter((s) => s.milestoneId === m.id);
                              if (linked.length > 0) { blockDelete('Marco', m.name, 'Desvinculle ou remova as sprints antes de excluir este marco:', linked.map((s) => s.name)); return; }
                              confirm('Marco', m.name, async () => { if (await deleteMilestone(m.id)) { showToast('Marco removido.', 'success'); load(activeId); } });
                            }} title="Remover marco"><IconTrash /></button>}
                          </div>
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
                <Pager total={filteredMs.length} page={msPage} size={msPgSz} onPage={setMsPage} onSize={(s) => { setMsPgSz(s); setMsPage(1); }} />
              </div>
            )}
          </section>

          {/* ── Sprints ── */}
          <section className="tests-panel">
            <div className="casos-searchblock-top" style={{ padding: '14px 18px 12px' }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>Sprints</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={filterSp} onChange={(e) => { setFilterSp(e.target.value); setSpPage(1); }} placeholder="Filtrar sprints…" style={{ padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, width: 200, background: 'var(--surface)' }} />
                {podeEscrever && <button className="btn btn-primary btn-sm casos-new-btn" onClick={() => setSpModal(true)}><IconPlus /> Nova Sprint</button>}
              </div>
            </div>
            {sprints.length === 0 ? (
              <p className="tests-muted" style={{ padding: '0 18px 16px' }}>Nenhuma sprint criada.</p>
            ) : (
              <div className="casos-table-wrap" style={{ borderTop: '1px solid var(--border)' }}>
                <table className="tests-table">
                  <thead><tr><th>Sprint</th><th>Início</th><th>Fim</th><th>Marco</th><th>Cards</th><th>Planos</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {pagedSp.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', padding: '16px 0' }}>Nenhum resultado encontrado.</td></tr>}
                    {pagedSp.map((s) => {
                      const ms = milestones.find((m) => m.id === s.milestoneId);
                      return (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 500 }}><button className="casos-link" style={{ fontWeight: 500 }} onClick={() => setViewingSp(s)}>{s.name}</button></td>
                          <td className="tests-muted-cell">{formatDateOnly(s.startDate)}</td>
                          <td className="tests-muted-cell">{formatDateOnly(s.endDate)}</td>
                          <td className="tests-muted-cell">{ms?.name ?? '—'}</td>
                          <td className="tests-muted-cell">{cards.filter((c) => c.sprintId === s.id).length}</td>
                          <td className="tests-muted-cell">{plans.filter((p) => { const lc = cards.find((c) => c.id === p.cardId); return p.sprintId === s.id || lc?.sprintId === s.id; }).length}</td>
                          <td><span className={`tests-badge status-${s.status === 'concluida' ? 'closed' : s.status === 'em_andamento' ? 'in_progress' : s.status === 'cancelada' ? 'skipped' : 'open'}`}>{SP_STATUS[s.status]}</span></td>
                          <td className="casos-actions-cell">
                            <div className="casos-rowactions">
                              {podeEscrever && <button className="tests-iconbtn" onClick={() => setEditSp(s)} title="Editar sprint"><IconPencil /></button>}
                              {can('delete') && <button className="tests-iconbtn danger" onClick={() => {
                              const linked = cards.filter((c) => c.sprintId === s.id);
                              if (linked.length > 0) { blockDelete('Sprint', s.name, 'Desvinculle ou remova os cards antes de excluir esta sprint:', linked.map((c) => c.title)); return; }
                              confirm('Sprint', s.name, async () => { if (await deleteSprint(s.id)) { showToast('Sprint removida.', 'success'); load(activeId); } });
                            }} title="Remover sprint"><IconTrash /></button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pager total={filteredSp.length} page={spPage} size={spPgSz} onPage={setSpPage} onSize={(s) => { setSpPgSz(s); setSpPage(1); }} />
              </div>
            )}
          </section>

          {/* ── Cards ── */}
          <section className="tests-panel">
            <div className="casos-searchblock-top" style={{ padding: '14px 18px 12px' }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>Cards</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={filterCard} onChange={(e) => { setFilterCard(e.target.value); setCardPage(1); }} placeholder="Filtrar cards…" style={{ padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, width: 200, background: 'var(--surface)' }} />
                {podeEscrever && <button className="btn btn-primary btn-sm casos-new-btn" onClick={() => setCardModal(true)}><IconPlus /> Novo Card</button>}
              </div>
            </div>
            {cards.length === 0 ? (
              <p className="tests-muted" style={{ padding: '0 18px 16px' }}>Nenhum card criado.</p>
            ) : (
              <div className="casos-table-wrap" style={{ borderTop: '1px solid var(--border)' }}>
                <table className="tests-table">
                  <thead><tr><th>Card</th><th>Sprint</th><th>Marco</th><th>Bugs</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {pagedCards.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', padding: '16px 0' }}>Nenhum resultado encontrado.</td></tr>}
                    {pagedCards.map((c) => {
                      const sp = sprints.find((s) => s.id === c.sprintId);
                      const ms = milestones.find((m) => m.id === (c.milestoneId ?? sp?.milestoneId));
                      const bugCount = defects.filter((d) => d.cardId === c.id || (d.planId != null && plans.find((p) => p.id === d.planId)?.cardId === c.id)).length;
                      return (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 500 }}>
                            {c.azureId && <span className="casos-tag" style={{ marginRight: 6 }}>#{c.azureId}</span>}
                            <button className="casos-link" style={{ fontWeight: 500 }} onClick={() => setViewingCard(c)}>{c.title}</button>
                            {c.resumo && <div className="tests-muted" style={{ fontSize: 12, fontWeight: 400, marginTop: 2 }}>{c.resumo.length > 80 ? c.resumo.slice(0, 80) + '…' : c.resumo}</div>}
                          </td>
                          <td className="tests-muted-cell">{sp?.name ?? '—'}</td>
                          <td className="tests-muted-cell">{ms?.name ?? '—'}</td>
                          <td className="tests-muted-cell">
                            {bugCount > 0 ? <span className="tests-badge status-failed">{bugCount}</span> : <span className="tests-muted">0</span>}
                          </td>
                          <td><span className={`tests-badge status-${c.status === 'concluida' ? 'closed' : c.status === 'em_andamento' ? 'in_progress' : 'open'}`}>{CARD_STATUS[c.status]}</span></td>
                          <td className="casos-actions-cell">
                            <div className="casos-rowactions">
                              {podeEscrever && <button className="tests-iconbtn" onClick={() => setEditCard(c)} title="Editar card"><IconPencil /></button>}
                              {can('delete') && <button className="tests-iconbtn danger" onClick={() => {
                              const linked = plans.filter((p) => p.cardId === c.id);
                              if (linked.length > 0) { blockDelete('Card', c.title, 'Desvinculle ou remova os planos de teste antes de excluir este card:', linked.map((p) => p.name)); return; }
                              confirm('Card', c.title, async () => { if (await deleteCard(c.id)) { showToast('Card removido.', 'success'); load(activeId); } });
                            }} title="Remover card"><IconTrash /></button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pager total={filteredCards.length} page={cardPage} size={cardPgSz} onPage={setCardPage} onSize={(s) => { setCardPgSz(s); setCardPage(1); }} />
              </div>
            )}
          </section>

          {/* ── Planos ── */}
          <section className="tests-panel">
            <div className="casos-searchblock-top" style={{ padding: '14px 18px 12px' }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>Planos de Teste</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={filterPlan} onChange={(e) => { setFilterPlan(e.target.value); setPlanPage(1); }} placeholder="Filtrar planos…" style={{ padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, width: 200, background: 'var(--surface)' }} />
                {podeEscrever && <button className="btn btn-primary btn-sm casos-new-btn" onClick={() => setPlanModal(true)}><IconPlus /> Novo Plano</button>}
              </div>
            </div>
            {plans.length === 0 ? (
              <p className="tests-muted" style={{ padding: '0 18px 16px' }}>Nenhum plano criado.</p>
            ) : (
              <div className="casos-table-wrap" style={{ borderTop: '1px solid var(--border)' }}>
                <table className="tests-table">
                  <thead><tr><th>Plano</th><th>Marco</th><th>Sprint</th><th>Execuções</th><th>Bugs</th><th>Criado por</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {pagedPlans.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', padding: '16px 0' }}>Nenhum resultado encontrado.</td></tr>}
                    {pagedPlans.map((p) => {
                      const linkedCard = cards.find((c) => c.id === p.cardId);
                      const sp = sprints.find((s) => s.id === (p.sprintId ?? linkedCard?.sprintId));
                      const ms = milestones.find((m) => m.id === (p.milestoneId ?? sp?.milestoneId ?? linkedCard?.milestoneId));
                      const rs = runsOfPlan(p.id);
                      const closed = rs.filter((r) => r.status === 'closed').length;
                      const bugCount = defects.filter((d) => d.planId === p.id).length;
                      const criadorNome = p.createdBy ? (cachedProfiles().find((pr) => pr.id === p.createdBy)?.nome ?? p.createdBy) : null;
                      return (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 500 }}>
                            <button className="casos-link" style={{ fontWeight: 500 }} onClick={() => setViewingPlan(p)}>{p.name}</button>
                            {linkedCard && <div className="tests-muted" style={{ fontSize: 12, fontWeight: 400, marginTop: 2 }}>
                              {linkedCard.azureId && <span className="casos-tag" style={{ marginRight: 4, fontSize: 11 }}>#{linkedCard.azureId}</span>}
                              {linkedCard.title.length > 55 ? linkedCard.title.slice(0, 55) + '…' : linkedCard.title}
                            </div>}
                          </td>
                          <td className="tests-muted-cell">{ms?.name ?? '—'}</td>
                          <td className="tests-muted-cell">{sp?.name ?? '—'}</td>
                          <td className="tests-muted-cell">{rs.length === 0 ? '—' : `${closed}/${rs.length} fechadas`}</td>
                          <td className="tests-muted-cell">
                            {bugCount > 0 ? <span className="tests-badge status-failed">{bugCount}</span> : <span className="tests-muted">0</span>}
                          </td>
                          <td className="tests-muted-cell">{criadorNome ?? '—'}</td>
                          <td><span className={`tests-badge ${planStatusClass[p.status]}`}>{PLAN_STATUS[p.status]}</span></td>
                          <td className="casos-actions-cell">
                            <div className="casos-rowactions">
                              {podeEscrever && <button className="tests-iconbtn" onClick={() => setEditPlan(p)} title="Editar plano"><IconPencil /></button>}
                              {can('delete') && <button className="tests-iconbtn danger" onClick={() => confirm('Plano de Teste', p.name, async () => { if (await deletePlan(p.id)) { showToast('Plano removido.', 'success'); load(activeId); } })} title="Remover plano"><IconTrash /></button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pager total={filteredPlans.length} page={planPage} size={planPgSz} onPage={setPlanPage} onSize={(s) => { setPlanPgSz(s); setPlanPage(1); }} />
              </div>
            )}
          </section>
        </div>
      )}

      {confirmDlg && <ConfirmDialog tipo={confirmDlg.tipo} message={confirmDlg.message} onConfirm={() => { confirmDlg.onConfirm(); setConfirmDlg(null); }} onCancel={() => setConfirmDlg(null)} />}
      {blockedDlg && <BlockedDialog tipo={blockedDlg.tipo} name={blockedDlg.name} reason={blockedDlg.reason} items={blockedDlg.items} onClose={() => setBlockedDlg(null)} />}
      {msModal && activeId && <MilestoneModal projectId={activeId} onClose={() => setMsModal(false)} onSaved={() => { setMsModal(false); load(activeId); }} />}
      {editMs && activeId && <MilestoneModal projectId={activeId} milestone={editMs} onClose={() => setEditMs(null)} onSaved={() => { setEditMs(null); load(activeId); }} />}
      {spModal && activeId && <SprintModal projectId={activeId} milestones={milestones} onClose={() => setSpModal(false)} onSaved={() => { setSpModal(false); load(activeId); }} />}
      {editSp && activeId && <SprintModal projectId={activeId} milestones={milestones} sprint={editSp} onClose={() => setEditSp(null)} onSaved={() => { setEditSp(null); load(activeId); }} />}
      {cardModal && activeId && <CardModal projectId={activeId} milestones={milestones} sprints={sprints} azureApiCfg={azureApiCfg} onClose={() => setCardModal(false)} onSaved={() => { setCardModal(false); load(activeId); }} />}
      {editCard && activeId && <CardModal projectId={activeId} milestones={milestones} sprints={sprints} azureApiCfg={azureApiCfg} card={editCard} onClose={() => setEditCard(null)} onSaved={() => { setEditCard(null); load(activeId); }} />}
      {planModal && activeId && <PlanModal projectId={activeId} milestones={milestones} sprints={sprints} cards={cards} onClose={() => setPlanModal(false)} onSaved={() => { setPlanModal(false); load(activeId); }} />}
      {editPlan && activeId && <PlanModal projectId={activeId} milestones={milestones} sprints={sprints} cards={cards} plan={editPlan} onClose={() => setEditPlan(null)} onSaved={() => { setEditPlan(null); load(activeId); }} />}
      {viewingCard && activeId && (
        <CardDetail card={viewingCard} sprints={sprints} milestones={milestones} defects={defects} plans={plans} cards={cards} azureApiCfg={azureApiCfg}
          onClose={() => setViewingCard(null)}
          onEdit={podeEscrever ? () => { setEditCard(viewingCard); setViewingCard(null); } : undefined}
        />
      )}
      {viewingMs && activeId && (
        <MilestoneDetail milestone={viewingMs} sprints={sprints} cards={cards} plans={plans}
          onClose={() => setViewingMs(null)}
          onEdit={podeEscrever ? () => { setEditMs(viewingMs); setViewingMs(null); } : undefined}
        />
      )}
      {viewingSp && activeId && (
        <SprintDetail sprint={viewingSp} milestones={milestones} cards={cards} plans={plans} defects={defects}
          onClose={() => setViewingSp(null)}
          onEdit={podeEscrever ? () => { setEditSp(viewingSp); setViewingSp(null); } : undefined}
        />
      )}
      {viewingPlan && activeId && (
        <PlanDetail plan={viewingPlan} milestones={milestones} sprints={sprints} cards={cards} runs={runs} defects={defects} azureApiCfg={azureApiCfg}
          onClose={() => setViewingPlan(null)}
          onEdit={podeEscrever ? () => { setEditPlan(viewingPlan); setViewingPlan(null); } : undefined}
        />
      )}
    </TestsLayout>
  );
}

/* ── Modal Marco ── */
function MilestoneModal({ projectId, milestone, onClose, onSaved }: { projectId: string; milestone?: Milestone; onClose: () => void; onSaved: () => void }) {
  const editing = !!milestone;
  const [name, setName] = useState(milestone?.name ?? '');
  const [due, setDue] = useState(() => milestone?.dueDate ? new Date(milestone.dueDate).toISOString().slice(0, 10) : '');
  const [status, setStatus] = useState<MilestoneStatus>(milestone?.status ?? 'open');
  const salvar = async () => {
    if (!name.trim()) { showToast('Informe o nome do marco.', 'warning'); return; }
    const m: Milestone = { id: milestone?.id ?? genId(), projectId, name: name.trim(), dueDate: due ? new Date(due).toISOString() : null, status, createdAt: milestone?.createdAt ?? new Date().toISOString() };
    if (await saveMilestone(m)) { showToast(editing ? 'Marco atualizado.' : 'Marco criado.', 'success'); onSaved(); }
  };
  return (
    <Modal title={editing ? 'Editar Marco' : 'Novo Marco'} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={salvar}>{editing ? 'Salvar' : 'Criar'}</button></>}>
      <div className="form-group"><label>Nome *</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Release 2.0" /></div>
      <div className="form-row">
        <div className="form-group"><label>Prazo</label><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        <div className="form-group"><label>Status</label><select value={status} onChange={(e) => setStatus(e.target.value as MilestoneStatus)}>{Object.entries(MS_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
    </Modal>
  );
}

/* ── Modal Sprint ── */
function SprintModal({ projectId, milestones, sprint, onClose, onSaved }: { projectId: string; milestones: Milestone[]; sprint?: Sprint; onClose: () => void; onSaved: () => void }) {
  const editing = !!sprint;
  const [name, setName] = useState(sprint?.name ?? '');
  const [status, setStatus] = useState<SprintStatus>(sprint?.status ?? 'planejada');
  const [milestoneId, setMilestoneId] = useState(sprint?.milestoneId ?? '');
  const [startDate, setStartDate] = useState(() => sprint?.startDate ? new Date(sprint.startDate).toISOString().slice(0, 10) : '');
  const [endDate, setEndDate] = useState(() => sprint?.endDate ? new Date(sprint.endDate).toISOString().slice(0, 10) : '');
  const salvar = async () => {
    if (!name.trim()) { showToast('Informe o nome da sprint.', 'warning'); return; }
    if (startDate && endDate && endDate < startDate) { showToast('A data de fim não pode ser anterior ao início.', 'warning'); return; }
    const s: Sprint = { id: sprint?.id ?? genId(), projectId, milestoneId: milestoneId || null, name: name.trim(), status, startDate: startDate ? new Date(startDate).toISOString() : null, endDate: endDate ? new Date(endDate).toISOString() : null, createdAt: sprint?.createdAt ?? new Date().toISOString() };
    if (await saveSprint(s)) { showToast(editing ? 'Sprint atualizada.' : 'Sprint criada.', 'success'); onSaved(); }
  };
  return (
    <Modal title={editing ? 'Editar Sprint' : 'Nova Sprint'} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={salvar}>{editing ? 'Salvar' : 'Criar'}</button></>}>
      <div className="form-group"><label>Nome *</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Sprint 43" /></div>
      <div className="form-row">
        <div className="form-group"><label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as SprintStatus)}>
            {Object.entries(SP_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Início <span className="form-label-opt">(opcional)</span></label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
        <div className="form-group"><label>Fim <span className="form-label-opt">(opcional)</span></label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
      </div>
      <div className="form-group"><label>Marco <span className="form-label-opt">(opcional)</span></label>
        <select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
          <option value="">— Nenhum —</option>
          {milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
    </Modal>
  );
}

/* ── Modal Card ── */
type AzureApiCfg = { organization: string; project: string; pat: string } | null;

function CardModal({ projectId, milestones, sprints, azureApiCfg, card, onClose, onSaved }: {
  projectId: string; milestones: Milestone[]; sprints: Sprint[];
  azureApiCfg: AzureApiCfg; card?: Card; onClose: () => void; onSaved: () => void;
}) {
  const editing = !!card;
  const [azureIdInput, setAzureIdInput] = useState(card?.azureId ? String(card.azureId) : '');
  const [fetching, setFetching] = useState(false);
  const [fetched, setFetched] = useState(false);

  const [title, setTitle] = useState(card?.title ?? '');
  const [objetivo, setObjetivo] = useState(card?.objetivo ?? '');
  const [resumo, setResumo] = useState(card?.resumo ?? '');
  const [checklist, setChecklist] = useState(card?.checklist ?? '');
  const [sprintId, setSprintId] = useState(card?.sprintId ?? '');
  const [milestoneId, setMilestoneId] = useState(card?.milestoneId ?? '');
  const [status, setStatus] = useState<CardStatus>(card?.status ?? 'pendente');

  const selectedSprint = sprints.find((s) => s.id === sprintId) ?? null;
  const sprintHasMarco = !!selectedSprint?.milestoneId;
  const marcoFromSprint = sprintHasMarco ? milestones.find((m) => m.id === selectedSprint!.milestoneId) : null;

  const onSprintChange = (sid: string) => {
    setSprintId(sid);
    const sp = sprints.find((s) => s.id === sid);
    setMilestoneId(sp?.milestoneId ?? '');
  };

  const buscarAzure = async () => {
    const id = parseInt(azureIdInput.trim(), 10);
    if (!id || isNaN(id)) { showToast('Informe um ID numérico válido.', 'warning'); return; }
    if (!azureApiCfg) { showToast('Azure DevOps não configurado. Configure seu PAT nas configurações.', 'warning'); return; }
    setFetching(true);
    try {
      const wi = await getWorkItem(azureApiCfg, id);
      const f = wi.fields;
      const customFields = Object.entries(f)
        .filter(([k, v]) => k.startsWith('Custom.') && v && String(v).trim().length > 0);

      const stripHtml = (raw: unknown): string => {
        if (!raw) return '';
        let s = String(raw);
        // Blocos → quebras de linha
        s = s.replace(/<br\s*\/?>/gi, '\n');
        s = s.replace(/<\/p>/gi, '\n');
        s = s.replace(/<\/div>/gi, '\n');
        s = s.replace(/<\/h[1-6]>/gi, '\n');
        s = s.replace(/<\/tr>/gi, '\n');
        s = s.replace(/<li[^>]*>/gi, '• ');
        s = s.replace(/<\/li>/gi, '\n');
        // Remove todas as demais tags
        s = s.replace(/<[^>]*>/g, '');
        // Entidades nomeadas
        s = s.replace(/&nbsp;/g, ' ');
        s = s.replace(/&amp;/g, '&');
        s = s.replace(/&lt;/g, '<');
        s = s.replace(/&gt;/g, '>');
        s = s.replace(/&quot;/g, '"');
        s = s.replace(/&apos;/g, "'");
        s = s.replace(/&mdash;/g, '—');
        s = s.replace(/&ndash;/g, '–');
        s = s.replace(/&rsquo;/g, '’');
        s = s.replace(/&lsquo;/g, '‘');
        s = s.replace(/&rdquo;/g, '”');
        s = s.replace(/&ldquo;/g, '“');
        s = s.replace(/&hellip;/g, '…');
        // Entidades numéricas decimais e hex
        s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
        s = s.replace(/&#x([\da-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
        // Normaliza espaços e quebras
        s = s.replace(/[ \t]+/g, ' ');
        s = s.replace(/\n[ \t]+/g, '\n');
        s = s.replace(/[ \t]+\n/g, '\n');
        s = s.replace(/\n{3,}/g, '\n\n');
        return s.trim();
      };

      setTitle(String(f['System.Title'] ?? ''));

      // 1. Objetivo e Valor — System.Description (corpo da User Story)
      const rawObjetivo = f['System.Description'] ?? '';
      setObjetivo(stripHtml(rawObjetivo));

      // 2. Resumo da Demanda — campo Custom (business rules)
      const rawResumo = f['Custom.ResumoDaDemanda']
        ?? f['Custom.Resumo']
        ?? f['Custom.BusinessRules']
        ?? f['Custom.RegrasDeNegocio']
        ?? customFields.find(([k]) => /resumo/i.test(k))?.[1]
        ?? '';
      setResumo(stripHtml(rawResumo));

      // 3. Checklist com critérios de aceite
      const rawChecklist = f['Microsoft.VSTS.Common.AcceptanceCriteria']
        ?? f['Custom.ChecklistCriteriosAceite']
        ?? f['Custom.Checklist']
        ?? f['Custom.CriteriosDeAceite']
        ?? customFields.find(([k]) => /checklist|criterio|aceite/i.test(k))?.[1]
        ?? '';
      setChecklist(stripHtml(rawChecklist));

      // Diagnóstico se algum campo ficou vazio
      const empty = [
        !rawObjetivo && 'Objetivo e Valor',
        !rawResumo && 'Resumo da Demanda',
        !rawChecklist && 'Checklist',
      ].filter(Boolean);
      if (empty.length > 0) {
        const names = customFields.map(([k]) => k).join(', ') || '(nenhum)';
        showToast(`Campos vazios: ${empty.join(', ')} — Custom no console: ${names}`, 'warning');
      } else {
        showToast('Dados carregados do Azure. Revise e salve.', 'success');
      }
      setFetched(true);
    } catch {
      showToast('Não foi possível buscar o Work Item. Verifique o ID e o PAT.', 'error');
    } finally {
      setFetching(false);
    }
  };

  const salvar = async () => {
    if (!title.trim()) { showToast('Informe o título do card.', 'warning'); return; }
    const resolvedMilestoneId = sprintHasMarco ? (selectedSprint!.milestoneId ?? null) : (milestoneId || null);
    const azureId = azureIdInput.trim() ? parseInt(azureIdInput.trim(), 10) : null;
    const c: Card = { id: card?.id ?? genId(), projectId, sprintId: sprintId || null, milestoneId: resolvedMilestoneId, azureId: azureId && !isNaN(azureId) ? azureId : null, title: title.trim(), objetivo: objetivo.trim(), resumo: resumo.trim(), checklist: checklist.trim(), status, createdAt: card?.createdAt ?? new Date().toISOString() };
    if (await saveCard(c)) { showToast(editing ? 'Card atualizado.' : 'Card criado.', 'success'); onSaved(); }
  };

  const showFields = editing || fetched || !azureApiCfg;

  return (
    <Modal title={editing ? 'Editar Card' : 'Novo Card'} onClose={onClose} large footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={salvar}>{editing ? 'Salvar' : 'Criar'}</button></>}>

      {/* ── Busca Azure ── */}
      {azureApiCfg && (
        <div style={{ background: 'var(--bg-secondary, #f5f5f7)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--text-secondary)' }}>
            Buscar Work Item no Azure DevOps
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              value={azureIdInput}
              onChange={(e) => { setAzureIdInput(e.target.value); setFetched(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && azureIdInput.trim()) buscarAzure(); }}
              placeholder="ID do Work Item — ex.: 14294"
              disabled={editing}
              style={{ flex: 1, margin: 0 }}
            />
            {!editing && (
              <button
                className="btn btn-primary"
                onClick={buscarAzure}
                disabled={fetching || !azureIdInput.trim()}
                style={{ flexShrink: 0, minWidth: 100 }}
              >
                {fetching ? 'Buscando…' : 'Buscar'}
              </button>
            )}
          </div>
          {!showFields && !fetching && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Digite o ID e pressione <b>Enter</b> ou clique em <b>Buscar</b> para carregar os dados.
            </p>
          )}
          {fetched && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--success, #22863a)' }}>
              ✓ Work Item #{azureIdInput} carregado. Revise os campos abaixo antes de salvar.
            </p>
          )}
        </div>
      )}

      {/* ── Campos do card ── */}
      {showFields && (
        <>
          <div className="form-group">
            <label>Título *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do card" />
          </div>
          <div className="form-group">
            <label>Objetivo e Valor</label>
            <textarea value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="Como [ator], eu quero… para que…" rows={5} style={{ resize: 'vertical' }} />
          </div>
          <div className="form-group">
            <label>Resumo da Demanda</label>
            <textarea value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder="Regras de negócio / resumo da demanda" rows={6} style={{ resize: 'vertical' }} />
          </div>
          <div className="form-group">
            <label>Checklist com critérios de aceite</label>
            <textarea value={checklist} onChange={(e) => setChecklist(e.target.value)} placeholder="Critérios de aceite / cenários de teste" rows={6} style={{ resize: 'vertical' }} />
          </div>
          <div className="form-row">
            <div className="form-group"><label>Sprint <span className="form-label-opt">(opcional)</span></label>
              <select value={sprintId} onChange={(e) => onSprintChange(e.target.value)}>
                <option value="">— Nenhuma —</option>
                {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}{s.milestoneId ? ` · ${milestones.find((m) => m.id === s.milestoneId)?.name ?? ''}` : ''}</option>)}
              </select>
            </div>
            {sprintHasMarco ? (
              <div className="form-group"><label>Marco</label>
                <div className="form-locked"><span className="tests-badge status-open">{marcoFromSprint?.name ?? '—'}</span></div>
              </div>
            ) : (
              <div className="form-group"><label>Marco <span className="form-label-opt">(opcional)</span></label>
                <select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
                  <option value="">— Nenhum —</option>
                  {milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            )}
            <div className="form-group"><label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as CardStatus)}>
                {Object.entries(CARD_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ── Modal Plano ── */
function PlanModal({ projectId, milestones, sprints, cards, plan, onClose, onSaved }: { projectId: string; milestones: Milestone[]; sprints: Sprint[]; cards: Card[]; plan?: TestPlan; onClose: () => void; onSaved: () => void }) {
  const editing = !!plan;
  const [name, setName] = useState(plan?.name ?? '');
  const [planStatus, setPlanStatus] = useState<PlanStatus>(plan?.status ?? 'pendente');
  const [sprintId, setSprintId] = useState(plan?.sprintId ?? '');
  const [milestoneId, setMilestoneId] = useState(plan?.milestoneId ?? '');
  const [cardId, setCardId] = useState(plan?.cardId ?? '');

  const selectedSprint = sprints.find((s) => s.id === sprintId) ?? null;
  const sprintHasMarco = !!selectedSprint?.milestoneId;
  const marcoFromSprint = sprintHasMarco ? milestones.find((m) => m.id === selectedSprint!.milestoneId) : null;
  const selectedCard = cards.find((c) => c.id === cardId) ?? null;

  const onSprintChange = (sid: string) => {
    setSprintId(sid);
    const sp = sprints.find((s) => s.id === sid);
    setMilestoneId(sp?.milestoneId ?? '');
  };

  const cardSprint = selectedCard ? (sprints.find((s) => s.id === selectedCard.sprintId) ?? null) : null;
  const cardMilestone = selectedCard
    ? milestones.find((m) => m.id === (cardSprint?.milestoneId ?? selectedCard.milestoneId)) ?? null
    : null;

  const onCardChange = (cid: string) => {
    setCardId(cid);
    if (!cid) { setSprintId(''); setMilestoneId(''); return; }
    const card = cards.find((c) => c.id === cid);
    if (!card) return;
    setSprintId(card.sprintId ?? '');
    const sp = sprints.find((s) => s.id === card.sprintId);
    setMilestoneId(sp?.milestoneId ?? card.milestoneId ?? '');
  };

  const salvar = async () => {
    if (!name.trim()) { showToast('Informe o nome do plano.', 'warning'); return; }
    const resolvedMilestoneId = selectedCard
      ? (cardMilestone?.id ?? null)
      : sprintHasMarco ? (selectedSprint!.milestoneId ?? null) : (milestoneId || null);
    const p: TestPlan = { id: plan?.id ?? genId(), projectId, milestoneId: resolvedMilestoneId, sprintId: sprintId || null, cardId: cardId || null, name: name.trim(), scope: '', status: planStatus, createdBy: plan?.createdBy ?? currentUserId(), createdAt: plan?.createdAt ?? new Date().toISOString() };
    if (await savePlan(p)) { showToast(editing ? 'Plano atualizado.' : 'Plano criado.', 'success'); onSaved(); }
  };

  return (
    <Modal large title={editing ? 'Editar Plano' : 'Novo Plano'} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={salvar}>{editing ? 'Salvar' : 'Criar'}</button></>}>
      <div className="form-row">
        <div className="form-group" style={{ flex: 2 }}><label>Nome *</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Plano de regressão" /></div>
        <div className="form-group"><label>Status</label>
          <select value={planStatus} onChange={(e) => setPlanStatus(e.target.value as PlanStatus)}>
            {Object.entries(PLAN_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Card */}
      <div className="form-group"><label>Card <span className="form-label-opt">(opcional)</span></label>
        <select value={cardId} onChange={(e) => onCardChange(e.target.value)}>
          <option value="">— Nenhum —</option>
          {cards.map((c) => <option key={c.id} value={c.id}>{c.azureId ? `#${c.azureId} · ` : ''}{c.title}</option>)}
        </select>
      </div>

      {/* Card preview — 3 campos separados */}
      {selectedCard && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontWeight: 600, fontSize: 15 }}>
            {selectedCard.azureId && <span className="casos-tag">#{selectedCard.azureId}</span>}
            {selectedCard.title}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { label: 'Objetivo e Valor', value: selectedCard.objetivo },
              { label: 'Resumo da Demanda', value: selectedCard.resumo },
              { label: 'Checklist com critérios de aceite', value: selectedCard.checklist },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--text-primary)' }}>{label}</div>
                <div style={{
                  whiteSpace: 'pre-wrap',
                  fontSize: 13,
                  lineHeight: 1.7,
                  padding: '14px 16px',
                  background: 'var(--surface-alt, #f7f8fa)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  minHeight: 64,
                  color: value ? 'inherit' : 'var(--text-muted)',
                  fontStyle: value ? 'normal' : 'italic',
                }}>
                  {value || 'Não informado'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedCard && (
        <div className="form-row">
          <div className="form-group"><label>Sprint</label>
            <div className="form-locked"><span className="tests-badge status-open">{cardSprint?.name ?? '—'}</span></div>
          </div>
          <div className="form-group"><label>Marco</label>
            <div className="form-locked"><span className="tests-badge status-open">{cardMilestone?.name ?? '—'}</span></div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ── Card Detail (visualização) ── */
function CardDetail({ card, sprints, milestones, defects, plans, cards, azureApiCfg, onClose, onEdit }: {
  card: Card;
  sprints: Sprint[];
  milestones: Milestone[];
  defects: Defect[];
  plans: TestPlan[];
  cards: Card[];
  azureApiCfg: { organization: string; project: string; pat: string } | null;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const sp = sprints.find((s) => s.id === card.sprintId);
  const ms = milestones.find((m) => m.id === (card.milestoneId ?? sp?.milestoneId));
  const CARD_STATUS: Record<CardStatus, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' };
  const statusClass = card.status === 'concluida' ? 'status-closed' : card.status === 'em_andamento' ? 'status-in_progress' : 'status-open';
  const cardBugs = defects.filter((d) => d.cardId === card.id || (d.planId != null && plans.find((p) => p.id === d.planId)?.cardId === card.id));

  return (
    <Modal
      large
      title={
        <span>
          {card.azureId && <span className="casos-tag" style={{ marginRight: 8, fontSize: 13 }}>#{card.azureId}</span>}
          {card.title}
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
          {onEdit && <button className="btn btn-primary" onClick={onEdit}><span style={{ marginRight: 6 }}>✎</span>Editar</button>}
        </>
      }
    >
      {/* Metadata row */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 20, padding: '10px 14px', background: 'var(--surface-alt, #f7f8fa)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <div><span className="tests-muted" style={{ fontSize: 12 }}>Sprint</span><div style={{ fontWeight: 500 }}>{sp?.name ?? '—'}</div></div>
        <div><span className="tests-muted" style={{ fontSize: 12 }}>Marco</span><div style={{ fontWeight: 500 }}>{ms?.name ?? '—'}</div></div>
        <div><span className="tests-muted" style={{ fontSize: 12 }}>Status</span><div><span className={`tests-badge ${statusClass}`}>{CARD_STATUS[card.status]}</span></div></div>
        <div><span className="tests-muted" style={{ fontSize: 12 }}>Criado em</span><div style={{ fontWeight: 500 }}>{formatDate(card.createdAt)}</div></div>
        <div><span className="tests-muted" style={{ fontSize: 12 }}>Bugs</span><div style={{ fontWeight: 500 }}>{cardBugs.length > 0 ? <span className="tests-badge status-failed">{cardBugs.length}</span> : '0'}</div></div>
      </div>

      {/* Content fields */}
      {[
        { label: 'Objetivo e Valor', value: card.objetivo },
        { label: 'Resumo da Demanda', value: card.resumo },
        { label: 'Checklist com critérios de aceite', value: card.checklist },
      ].map(({ label, value }) => (
        <div key={label} className="form-group">
          <label style={{ fontWeight: 600, marginBottom: 6 }}>{label}</label>
          {value ? (
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, padding: '10px 12px', background: 'var(--surface-alt, #f7f8fa)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 14, minHeight: 48 }}>
              {value}
            </div>
          ) : (
            <div className="tests-muted" style={{ fontStyle: 'italic', padding: '10px 12px' }}>Não informado</div>
          )}
        </div>
      ))}

      {/* Bugs vinculados */}
      {cardBugs.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Defeitos vinculados</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {cardBugs.map((bug) => {
              const bc = bug.cardId ? cards.find((c) => c.id === bug.cardId) : card;
              return <BugRow key={bug.id} bug={bug} cardAzureId={bc?.azureId ?? null} azureApiCfg={azureApiCfg} />;
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}

const MetaRow = ({ items }: { items: { label: string; value: React.ReactNode }[] }) => (
  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 20, padding: '10px 14px', background: 'var(--surface-alt, #f7f8fa)', borderRadius: 8, border: '1px solid var(--border)' }}>
    {items.map(({ label, value }) => (
      <div key={label}><span className="tests-muted" style={{ fontSize: 12 }}>{label}</span><div style={{ fontWeight: 500, marginTop: 2 }}>{value}</div></div>
    ))}
  </div>
);

const DetailFooter = ({ onClose, onEdit }: { onClose: () => void; onEdit?: () => void }) => (
  <><button className="btn btn-ghost" onClick={onClose}>Fechar</button>{onEdit && <button className="btn btn-primary" onClick={onEdit}><span style={{ marginRight: 6 }}>✎</span>Editar</button>}</>
);

/* ── Marco Detail ── */
function MilestoneDetail({ milestone, sprints, cards, plans, onClose, onEdit }: {
  milestone: Milestone; sprints: Sprint[]; cards: Card[]; plans: TestPlan[];
  onClose: () => void; onEdit?: () => void;
}) {
  const [openSprintId, setOpenSprintId] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const msSprints = sprints.filter((s) => s.milestoneId === milestone.id);
  const msSprintIds = msSprints.map((s) => s.id);
  const cardCount = cards.filter((c) => c.milestoneId === milestone.id || (c.sprintId && msSprintIds.includes(c.sprintId))).length;
  const planCount = plans.filter((p) => p.milestoneId === milestone.id).length;
  const statusClass = milestone.status === 'completed' ? 'status-closed' : milestone.status === 'cancelled' ? 'status-skipped' : 'status-open';
  const CARD_STATUS_LABEL: Record<CardStatus, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' };

  const toggleSprint = (id: string) => { setOpenSprintId((p) => p === id ? null : id); setOpenCardId(null); };
  const toggleCard = (id: string) => setOpenCardId((p) => p === id ? null : id);

  return (
    <Modal large title={milestone.name} onClose={onClose} footer={<DetailFooter onClose={onClose} onEdit={onEdit} />}>
      <MetaRow items={[
        { label: 'Status', value: <span className={`tests-badge ${statusClass}`}>{MS_STATUS[milestone.status]}</span> },
        { label: 'Prazo', value: milestone.dueDate ? formatDate(milestone.dueDate) : '—' },
        { label: 'Sprints', value: msSprints.length },
        { label: 'Cards', value: cardCount },
        { label: 'Planos', value: planCount },
        { label: 'Criado em', value: formatDate(milestone.createdAt) },
      ]} />
      {msSprints.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Sprints deste marco</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 420, overflowY: 'auto', paddingRight: 2 }}>
            {msSprints.map((s) => {
              const spCards = cards.filter((c) => c.sprintId === s.id);
              const spOpen = openSprintId === s.id;
              return (
                <div key={s.id} style={{ borderRadius: 10, border: `1.5px solid ${spOpen ? 'var(--accent, #4f6ef7)' : 'var(--border)'}`, overflow: 'hidden', transition: 'border-color 0.15s' }}>
                  {/* Sprint row */}
                  <div
                    onClick={() => toggleSprint(s.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: spOpen ? 'var(--accent, #4f6ef7)' : 'var(--surface-alt, #f7f8fa)', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, transform: spOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: spOpen ? '#fff' : 'var(--text-muted)' }}>
                      <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: spOpen ? '#fff' : 'var(--text-primary)' }}>{s.name}</span>
                    <span style={{ fontSize: 12, color: spOpen ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)', background: spOpen ? 'rgba(255,255,255,0.2)' : 'var(--border)', borderRadius: 20, padding: '2px 8px' }}>{spCards.length} card{spCards.length !== 1 ? 's' : ''}</span>
                    <span style={{ fontSize: 12, color: spOpen ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)', background: spOpen ? 'rgba(255,255,255,0.2)' : 'var(--border)', borderRadius: 20, padding: '2px 8px' }}>{plans.filter((p) => p.sprintId === s.id).length} plano{plans.filter((p) => p.sprintId === s.id).length !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Cards list */}
                  {spOpen && (
                    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--surface)' }}>
                      {spCards.length === 0 && (
                        <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', textAlign: 'center' }}>Nenhum card nesta sprint.</div>
                      )}
                      {spCards.map((c) => {
                        const cardOpen = openCardId === c.id;
                        const linkedPlan = plans.find((p) => p.cardId === c.id);
                        return (
                          <div key={c.id} style={{ borderRadius: 7, border: `1px solid ${cardOpen ? 'var(--border)' : 'var(--border)'}`, overflow: 'hidden', background: 'var(--surface-alt, #f7f8fa)' }}>
                            {/* Card row */}
                            <div
                              onClick={() => toggleCard(c.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer', userSelect: 'none' }}
                            >
                              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, transform: cardOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: 'var(--text-muted)' }}>
                                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              {c.azureId && <span className="casos-tag" style={{ fontSize: 11, flexShrink: 0 }}>#{c.azureId}</span>}
                              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{c.title}</span>
                              <span className={`tests-badge status-${c.status === 'concluida' ? 'closed' : c.status === 'em_andamento' ? 'in_progress' : 'open'}`} style={{ flexShrink: 0 }}>{CARD_STATUS_LABEL[c.status]}</span>
                            </div>

                            {/* Plan row */}
                            {cardOpen && (
                              <div style={{ margin: '0 0 0 28px', borderTop: '1px dashed var(--border)', padding: '10px 14px', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 10, borderLeft: '3px solid var(--accent, #4f6ef7)' }}>
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--accent, #4f6ef7)', flexShrink: 0 }}>
                                  <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                                  <path d="M5 6h6M5 9h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                                <div>
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Plano de Teste</div>
                                  {linkedPlan
                                    ? <span style={{ fontSize: 13, fontWeight: 600 }}>{linkedPlan.name}</span>
                                    : <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhum plano vinculado.</span>
                                  }
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ── Sprint Detail ── */
function SprintDetail({ sprint, milestones, cards, plans, defects, onClose, onEdit }: {
  sprint: Sprint; milestones: Milestone[]; cards: Card[]; plans: TestPlan[]; defects: Defect[];
  onClose: () => void; onEdit?: () => void;
}) {
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const ms = milestones.find((m) => m.id === sprint.milestoneId);
  const spCards = cards.filter((c) => c.sprintId === sprint.id);
  const spCardIds = spCards.map((c) => c.id);
  const bugCount = defects.filter((d) => d.cardId && spCardIds.includes(d.cardId)).length;
  const planCount = plans.filter((p) => p.sprintId === sprint.id).length;
  const CARD_STATUS_LABEL: Record<CardStatus, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' };
  return (
    <Modal large title={sprint.name} onClose={onClose} footer={<DetailFooter onClose={onClose} onEdit={onEdit} />}>
      <MetaRow items={[
        { label: 'Status', value: <span className={`tests-badge status-${sprint.status === 'concluida' ? 'closed' : sprint.status === 'em_andamento' ? 'in_progress' : sprint.status === 'cancelada' ? 'skipped' : 'open'}`}>{SP_STATUS[sprint.status]}</span> },
        { label: 'Marco', value: ms?.name ?? '—' },
        { label: 'Início', value: formatDateOnly(sprint.startDate) },
        { label: 'Fim', value: formatDateOnly(sprint.endDate) },
        { label: 'Cards', value: spCards.length },
        { label: 'Planos', value: planCount },
        { label: 'Bugs', value: bugCount > 0 ? <span className="tests-badge status-failed">{bugCount}</span> : '0' },
      ]} />
      {spCards.length === 0
        ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', padding: '16px 0' }}>Nenhum card nesta sprint.</div>
        : (
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Cards nesta sprint</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 420, overflowY: 'auto', paddingRight: 2 }}>
              {spCards.map((c) => {
                const cardOpen = openCardId === c.id;
                const linkedPlan = plans.find((p) => p.cardId === c.id);
                return (
                  <div key={c.id} style={{ borderRadius: 10, border: `1.5px solid ${cardOpen ? 'var(--accent, #4f6ef7)' : 'var(--border)'}`, overflow: 'hidden', transition: 'border-color 0.15s' }}>
                    <div
                      onClick={() => setOpenCardId(cardOpen ? null : c.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: cardOpen ? 'var(--accent, #4f6ef7)' : 'var(--surface-alt, #f7f8fa)', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, transform: cardOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: cardOpen ? '#fff' : 'var(--text-muted)' }}>
                        <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {c.azureId && <span className="casos-tag" style={{ fontSize: 11, flexShrink: 0, background: cardOpen ? 'rgba(255,255,255,0.25)' : undefined, color: cardOpen ? '#fff' : undefined }}>#{c.azureId}</span>}
                      <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: cardOpen ? '#fff' : 'var(--text-primary)' }}>{c.title}</span>
                      <span className={`tests-badge status-${c.status === 'concluida' ? 'closed' : c.status === 'em_andamento' ? 'in_progress' : 'open'}`} style={{ flexShrink: 0, opacity: cardOpen ? 0.85 : 1 }}>{CARD_STATUS_LABEL[c.status]}</span>
                    </div>
                    {cardOpen && (
                      <div style={{ padding: '10px 12px', background: 'var(--surface)' }}>
                        <div style={{ marginLeft: 28, borderLeft: '3px solid var(--accent, #4f6ef7)', padding: '10px 14px', background: 'var(--surface-alt, #f7f8fa)', borderRadius: '0 6px 6px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--accent, #4f6ef7)', flexShrink: 0 }}>
                            <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M5 6h6M5 9h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Plano de Teste</div>
                            {linkedPlan
                              ? <span style={{ fontSize: 13, fontWeight: 600 }}>{linkedPlan.name}</span>
                              : <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhum plano vinculado.</span>
                            }
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )
      }
    </Modal>
  );
}

/* ── Bug row with inline Azure comments ── */
function BugRow({ bug, cardAzureId, azureApiCfg }: {
  bug: Defect; cardAzureId?: number | null;
  azureApiCfg: { organization: string; project: string; pat: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<AzureComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [myAzureId, setMyAzureId] = useState<string | null>(null);
  const objectUrls = useRef<string[]>([]);
  useEffect(() => () => { objectUrls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);
  const onImgClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'IMG') { e.preventDefault(); window.open((t as HTMLImageElement).src, '_blank', 'noopener'); }
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded && bug.azureWorkItemId && azureApiCfg) {
      setLoading(true);
      try {
        const [cms, azId] = await Promise.all([
          getComments(azureApiCfg, bug.azureWorkItemId),
          getMyAzureId(azureApiCfg),
        ]);
        setComments(await inlineCommentImages(azureApiCfg, cms, (u) => objectUrls.current.push(u)));
        setMyAzureId(azId);
      } catch { /* sem comentários */ }
      setLoaded(true); setLoading(false);
    }
  };

  const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const title = bug.title || '(sem título)';
  const truncTitle = title.length > 60 ? title.slice(0, 60) + '…' : title;

  return (
    <div style={{ border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, overflow: 'hidden' }}>
      <button onClick={toggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(239,68,68,0.12)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ flexShrink: 0, fontWeight: 700, fontSize: 15, color: '#c0392b', minWidth: 48 }}>
          {bug.azureWorkItemId ? `#${bug.azureWorkItemId}` : '—'}
        </span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{truncTitle}</span>
        {cardAzureId && <span className="casos-tag" style={{ flexShrink: 0, fontSize: 11 }}>#{cardAzureId}</span>}
        <span className={`tests-badge def-${bug.status}`} style={{ flexShrink: 0 }}>{DEFECT_STATUS_LABEL[bug.status]}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4, display: 'inline-block', transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.03)', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
          {bug.externalKey && <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Chave: </span>{bug.externalKey}</div>}
          {bug.description
            ? (/<[a-z!/][\s\S]*>/i.test(bug.description)
                ? <div className="defect-desc-html" onClick={onImgClick} dangerouslySetInnerHTML={{ __html: bug.description }} />
                : <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{bug.description}</div>)
            : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem descrição.</span>}
          {bug.evidence && bug.evidence.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {bug.evidence.map((ev, i) => (
                isImage(ev.url) ? (
                  <a key={i} href={ev.url} target="_blank" rel="noreferrer" title={ev.name}
                    style={{ display: 'block', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                    <img src={ev.url} alt={ev.name} style={{ display: 'block', maxHeight: 120, maxWidth: 180, objectFit: 'cover' }} />
                  </a>
                ) : (
                  <a key={i} href={ev.url} target="_blank" rel="noreferrer"
                    style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'underline' }}>{ev.name}</a>
                )
              ))}
            </div>
          )}
          {bug.azureWorkItemId && azureApiCfg && (
            <div style={{ marginTop: 4, borderTop: '1px solid rgba(239,68,68,0.12)', paddingTop: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Comentários Azure DevOps</div>
              {loading ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Carregando comentários…</p>
              ) : comments.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhum comentário.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} onClick={onImgClick}>
                  {comments.map((cm) => {
                    const isMe = !!myAzureId && cm.createdBy?.id === myAzureId;
                    const authorName = cm.createdBy?.displayName ?? 'Azure';
                    return (
                      <div key={cm.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexDirection: isMe ? 'row-reverse' : 'row', maxWidth: '85%' }}>
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: isMe ? 'var(--accent)' : '#6c757d', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, opacity: isMe ? 1 : 0.85 }}>
                            {initials(authorName)}
                          </div>
                          <div style={{ background: isMe ? 'var(--accent)' : 'var(--bg-card)', color: isMe ? '#fff' : 'var(--text-primary)', borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '8px 12px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
                            {!isMe && <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 3, opacity: 0.7 }}>{authorName}</div>}
                            <p className="azure-comment-text" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: cm.text }} />
                            <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6, textAlign: isMe ? 'right' : 'left' }}>
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

/* ── Plan Detail ── */
function PlanDetail({ plan, milestones, sprints, cards, runs, defects, azureApiCfg, onClose, onEdit }: {
  plan: TestPlan; milestones: Milestone[]; sprints: Sprint[]; cards: Card[]; runs: TestRun[]; defects: Defect[];
  azureApiCfg: { organization: string; project: string; pat: string } | null;
  onClose: () => void; onEdit?: () => void;
}) {
  const linkedCard = cards.find((c) => c.id === plan.cardId);
  const sp = sprints.find((s) => s.id === (plan.sprintId ?? linkedCard?.sprintId));
  const ms = milestones.find((m) => m.id === (plan.milestoneId ?? sp?.milestoneId ?? linkedCard?.milestoneId));
  const rs = runs.filter((r) => r.planId === plan.id);
  const closed = rs.filter((r) => r.status === 'closed').length;
  const planBugs = defects.filter((d) => d.planId === plan.id);
  const criadorNome = plan.createdBy ? (cachedProfiles().find((pr) => pr.id === plan.createdBy)?.nome ?? plan.createdBy) : '—';
  const [openFields, setOpenFields] = useState<Set<string>>(new Set());
  const toggleField = (label: string) => setOpenFields((p) => { const n = new Set(p); n.has(label) ? n.delete(label) : n.add(label); return n; });

  return (
    <Modal large title={plan.name} onClose={onClose} footer={<DetailFooter onClose={onClose} onEdit={onEdit} />}>
      <MetaRow items={[
        { label: 'Status', value: <span className={`tests-badge ${planStatusClass[plan.status]}`}>{PLAN_STATUS[plan.status]}</span> },
        { label: 'Marco', value: ms?.name ?? '—' },
        { label: 'Sprint', value: sp?.name ?? '—' },
        { label: 'Execuções', value: rs.length === 0 ? '—' : `${closed}/${rs.length} fechadas` },
        { label: 'Bugs', value: planBugs.length > 0 ? <span className="tests-badge status-failed">{planBugs.length}</span> : '0' },
        { label: 'Criado por', value: criadorNome },
        { label: 'Criado em', value: formatDate(plan.createdAt) },
      ]} />

      {linkedCard && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            {linkedCard.azureId && <span className="casos-tag">#{linkedCard.azureId}</span>}
            {linkedCard.title}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'var(--surface-alt, #f7f8fa)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, textAlign: 'left' }}
                  >
                    {label}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', transition: 'transform 0.15s', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
                  </button>
                  {open && (
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, padding: '12px 14px', color: value ? 'inherit' : 'var(--text-muted)', fontStyle: value ? 'normal' : 'italic' }}>
                      {value || 'Não informado'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {planBugs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Defeitos vinculados</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {planBugs.map((bug) => {
                const bc = bug.cardId ? cards.find((c) => c.id === bug.cardId) : linkedCard;
                return <BugRow key={bug.id} bug={bug} cardAzureId={bc?.azureId ?? null} azureApiCfg={azureApiCfg} />;
              })}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ── Blocked Dialog ── */
function BlockedDialog({ tipo, name, reason, items, onClose }: { tipo: string; name: string; reason: string; items: string[]; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 8px 40px rgba(0,0,0,0.25)', padding: '28px 32px', maxWidth: 440, width: '90%', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f59e0b', marginBottom: 4 }}>{tipo}</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, wordBreak: 'break-word' }}>Não é possível remover "{name}"</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{reason}</div>
          </div>
        </div>
        <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((item, i) => (
            <li key={i} style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{item}</li>
          ))}
        </ul>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onClose}>Entendido</button>
        </div>
      </div>
    </div>
  );
}

/* ── Confirm Dialog ── */
function ConfirmDialog({ tipo, message, onConfirm, onCancel }: { tipo: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }} onClick={onCancel} />
      <div style={{ position: 'relative', background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 8px 40px rgba(0,0,0,0.25)', padding: '28px 32px', maxWidth: 400, width: '90%', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#ef4444', marginBottom: 4 }}>{tipo}</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, wordBreak: 'break-word' }}>{message}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Esta ação não pode ser desfeita.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn" onClick={onConfirm} style={{ background: '#ef4444', color: '#fff', border: 'none' }}>Remover</button>
        </div>
      </div>
    </div>
  );
}

/* ── Paginação ── */
function Pager({ total, page, size, onPage, onSize }: {
  total: number; page: number; size: number;
  onPage: (p: number) => void; onSize: (s: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(page * size, total);

  const Btn = ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--border)',
        background: 'var(--surface)', color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
        cursor: disabled ? 'default' : 'pointer', fontSize: 15, fontWeight: 500,
        opacity: disabled ? 0.35 : 1, display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', transition: 'background 0.12s, border-color 0.12s',
        flexShrink: 0,
      }}
    >{label}</button>
  );

  const col = { flex: 1, display: 'flex', alignItems: 'center' } as const;
  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '10px 20px', background: 'var(--surface-alt, #f7f8fa)', display: 'flex', alignItems: 'center', gap: 8 }}>
      {/* esquerda */}
      <div style={{ ...col, justifyContent: 'flex-start' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {total === 0 ? 'Nenhum resultado' : `${from}–${to} de ${total}`}
        </span>
      </div>

      {/* centro */}
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Btn label="«" onClick={() => onPage(1)} disabled={page <= 1} />
        <Btn label="‹" onClick={() => onPage(page - 1)} disabled={page <= 1} />
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          height: 32, padding: '0 14px', borderRadius: 8,
          border: '1.5px solid var(--accent, #4f6ef7)', background: 'var(--accent, #4f6ef7)',
          color: '#fff', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', minWidth: 72,
        }}>
          {page} / {totalPages}
        </span>
        <Btn label="›" onClick={() => onPage(page + 1)} disabled={page >= totalPages} />
        <Btn label="»" onClick={() => onPage(totalPages)} disabled={page >= totalPages} />
      </div>

      {/* direita */}
      <div style={{ ...col, justifyContent: 'flex-end' }}>
        <select
          value={size}
          onChange={(e) => onSize(Number(e.target.value))}
          style={{
            fontSize: 11, padding: '2px 2px', width: 48, textAlign: 'center',
            border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)',
            cursor: 'pointer', color: 'var(--text-muted)',
          }}
        >
          {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </div>
  );
}
