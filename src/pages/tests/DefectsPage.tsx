/* ═══════════════════════════════════════════════════════════
   DefectsPage — Defeitos com integração opcional Azure DevOps.
   ═══════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TestsLayout } from './TestsLayout';
import { ProjectBar } from '../../components/tests/ProjectBar';
import { Modal } from '../../components/Modal';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useUserNames } from '../../hooks/useUserNames';
import { IconSearch, IconX, IconPlus, IconPencil, IconTrash, IconExternal } from '../../components/tests/icons';
import { PhotoUploader } from '../../components/tests/PhotoUploader';
import { can } from '../../lib/auth';
import { showToast } from '../../lib/toast';
import { formatDate } from '../../lib/utils';
import {
  genId, currentUserId, listDefects, saveDefect, deleteDefect, uploadEvidence,
  listCases, listRuns, listRunResults, listPlans, listCards, listSprints, listMilestones,
} from '../../lib/testManagement';
import {
  listAzureConfigs, listAzureTemplatesForConfig, getMyAzureSettings,
} from '../../lib/azureManagement';
import {
  createBug, createWorkItem, getWorkItem, addComment, getComments, getMyAzureId,
  fetchAreas, fetchIterations, fetchBugStates, fetchBugFields,
  fetchWorkItemTypes, fetchWorkItemFields, fetchWorkItemStates,
  uploadAttachment, linkAttachment, updateWorkItemFields,
  fetchWorkItemsFromAzure, fetchWorkItemsByCardIds, BUG_WORK_ITEM_TYPES, downloadAttachment, attachmentNameFromUrl,
  extractImgTags, type AzureWorkItemSummary,
} from '../../lib/azureDevOps';
import {
  DEFECT_SEVERITY_LABEL, DEFECT_STATUS_LABEL,
  type Defect, type DefectKind, type DefectSeverity, type DefectStatus, type TestPlan, type Card, type Sprint, type Milestone, type TestRun,
} from '../../types/tests';
import type { AzureConfig, AzureTemplate, AzureComment, AzureWorkItemField } from '../../types/azure';

interface Origin { caseTitle: string; runName: string }

const COMPANY_LABEL: Record<string, string> = {
  '7': 'Bedsonline', '8': 'Cativa', '10': 'Flot', '12': 'Smiles', '17': 'Azul',
};

const HELP_BUG = (
  <>
    <strong>Como usar esta tela</strong>
    <ul>
      <li>Bugs são <b>defeitos encontrados</b> nos testes. Os criados no runner vêm <b>vinculados</b> ao caso/execução.</li>
      <li>Com <b>Azure DevOps configurado</b>, ao criar/importar um bug você o vincula ao Work Item do Azure.</li>
      <li>Use <b>Importar do Azure</b> para trazer bugs existentes, e <b>Atualizar do Azure</b> para sincronizar status e comentários.</li>
    </ul>
  </>
);
const HELP_IMPROVEMENT = (
  <>
    <strong>Como usar esta tela</strong>
    <ul>
      <li>Melhorias são <b>itens de trabalho</b> (User Story, Task, Feature, etc.) acompanhados aqui.</li>
      <li><b>Importar do Azure</b> traz <b>todos os tipos</b> de work item — por ID do card ou todos os abertos.</li>
      <li>Vincule a melhoria ao <b>plano de teste</b> (que já carrega o id do card) para amarrar tudo.</li>
    </ul>
  </>
);

/** Rótulos por tipo de registro (bug | improvement). */
const KIND_LABELS = {
  bug: { title: 'Bug', singular: 'bug', novo: 'Novo Bug', activeTest: 'defeitos' as const, importBtn: 'Importar do Azure', help: HELP_BUG, azureType: 'Bug' as string | undefined },
  improvement: { title: 'Melhoria', singular: 'melhoria', novo: 'Nova Melhoria', activeTest: 'melhorias' as const, importBtn: 'Importar do Azure', help: HELP_IMPROVEMENT, azureType: undefined },
};

export function DefectsPage({ kind = 'bug' }: { kind?: DefectKind }) {
  const L = KIND_LABELS[kind];
  const { projects, activeId, setActiveId, reload, loading } = useActiveProject();
  const { name: userName, initials: userInitials } = useUserNames();
  const [defects, setDefects] = useState<Defect[]>([]);
  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [origin, setOrigin] = useState<Map<string, Origin>>(new Map());
  const [runsMap, setRunsMap] = useState<Map<string, TestRun>>(new Map());
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [fStatus, setFStatus] = useState<'all' | DefectStatus>('all');
  const [fSeverity, setFSeverity] = useState<'all' | DefectSeverity>('all');
  const [viewing, setViewing] = useState<Defect | null>(null);
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; data: Defect } | null>(null);
  const [confirmDel, setConfirmDel] = useState<Defect | null>(null);
  const [azureConfigs, setAzureConfigs] = useState<AzureConfig[]>([]);
  const [myPat, setMyPat] = useState('');
  const [sendingToAzure, setSendingToAzure] = useState<Defect | null>(null);
  const [importing, setImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<'' | DefectStatus>('');
  const [bulkPlan, setBulkPlan] = useState<string>(''); /* '' = manter · '__none__' = limpar · else planId */
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkConfirmDel, setBulkConfirmDel] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'createdAt', dir: 'desc' });
  const [pinDone, setPinDone] = useState(true); /* fechados no fim (padrão); some ao ordenar por coluna */

  const podeCriar = can('create');
  const canEdit = (d: Defect) => can('edit', d.createdBy ?? undefined);
  const canDel = (d: Defect) => can('delete', d.createdBy ?? undefined);

  const load = useCallback(async (pid: string) => {
    setBusy(true);
    const [defs, cases, runs, pls, crds, sps, mss] = await Promise.all([listDefects(pid), listCases(pid), listRuns(pid), listPlans(pid), listCards(pid), listSprints(pid), listMilestones(pid)]);
    const titleOf = new Map(cases.map((c) => [c.id, c.title]));
    const resultsByRun = await Promise.all(runs.map((r) => listRunResults(r.id)));
    const map = new Map<string, Origin>();
    const rmap = new Map<string, TestRun>();
    runs.forEach((run, i) => {
      resultsByRun[i].forEach((res) => {
        map.set(res.id, { caseTitle: titleOf.get(res.caseId) ?? res.caseId, runName: run.name });
        rmap.set(res.id, run);
      });
    });
    setDefects(defs.filter((d) => (d.kind ?? 'bug') === kind)); setPlans(pls); setCards(crds); setSprints(sps); setMilestones(mss); setOrigin(map); setRunsMap(rmap); setBusy(false);
    setSelectedIds(new Set());
  }, [kind]);

  useEffect(() => {
    if (activeId) load(activeId);
    else { setDefects([]); setOrigin(new Map()); }
  }, [activeId, load]);

  // Deep-link: abre um defeito/melhoria vindo de ?defect=ID (ex.: link do Assistente).
  const [defParams, setDefParams] = useSearchParams();
  const defOpenedRef = useRef(false);
  useEffect(() => {
    if (defOpenedRef.current) return;
    const id = defParams.get('defect');
    if (!id || defects.length === 0) return;
    const d = defects.find((x) => x.id === id);
    if (d) {
      setViewing(d);
      defOpenedRef.current = true;
      defParams.delete('defect');
      setDefParams(defParams, { replace: true });
    }
  }, [defects, defParams, setDefParams]);

  useEffect(() => {
    listAzureConfigs().then(setAzureConfigs);
    getMyAzureSettings().then((s) => { if (s?.pat) setMyPat(s.pat); });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return defects.filter((d) => {
      if (fStatus !== 'all' && d.status !== fStatus) return false;
      if (fSeverity !== 'all' && d.severity !== fSeverity) return false;
      if (q) { const hay = `${d.title} ${d.externalKey ?? ''} ${d.description}`.toLowerCase(); if (!hay.includes(q)) return false; }
      return true;
    });
  }, [defects, search, fStatus, fSeverity]);

  const hasFilters = !!search || fStatus !== 'all' || fSeverity !== 'all';
  const clearFilters = () => { setSearch(''); setFStatus('all'); setFSeverity('all'); };

  /* ── Ordenação por coluna ── */
  const toggleSort = (key: string) => { setPinDone(false); setSort((p) => p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }); };
  const sorted = useMemo(() => {
    const sevRank: Record<DefectSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };
    const sprintNameOf = (d: Defect) => {
      const lc = d.cardId ? cards.find((c) => c.id === d.cardId) : null;
      const lp = d.planId ? plans.find((p) => p.id === d.planId) : null;
      const sid = lp?.sprintId ?? lc?.sprintId ?? null;
      return sid ? (sprints.find((s) => s.id === sid)?.name ?? '') : '';
    };
    const val = (d: Defect): string | number => {
      switch (sort.key) {
        case 'title': return d.title.toLowerCase();
        case 'azureId': return d.azureWorkItemId ?? -1;
        case 'severity': return sevRank[d.severity];
        case 'status': return (d.azureState || DEFECT_STATUS_LABEL[d.status]).toLowerCase();
        case 'card': return (d.cardId ? cards.find((c) => c.id === d.cardId)?.azureId : null) ?? -1;
        case 'sprint': return sprintNameOf(d).toLowerCase();
        case 'createdBy': return userName(d.createdBy).toLowerCase();
        case 'createdAt': return d.createdAt;
        default: return 0;
      }
    };
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      /* No padrão (sem ordenar coluna), fechados/done vão pro fim. */
      if (pinDone) {
        const ca = a.status === 'closed' ? 1 : 0;
        const cb = b.status === 'closed' ? 1 : 0;
        if (ca !== cb) return ca - cb;
      }
      const va = val(a), vb = val(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [filtered, sort, pinDone, cards, plans, sprints]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Seleção em massa ── */
  const editableFiltered = useMemo(() => filtered.filter((d) => canEdit(d)), [filtered]); // eslint-disable-line react-hooks/exhaustive-deps
  const allSelected = editableFiltered.length > 0 && editableFiltered.every((d) => selectedIds.has(d.id));
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(editableFiltered.map((d) => d.id)));
  const toggleOne = (id: string) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const applyBulk = async () => {
    if (selectedIds.size === 0) return;
    if (bulkStatus === '' && bulkPlan === '') { showToast('Escolha um status ou plano para aplicar.', 'warning'); return; }
    setBulkBusy(true);
    const targets = defects.filter((d) => selectedIds.has(d.id) && canEdit(d));
    let ok = 0;
    for (const d of targets) {
      const updated: Defect = { ...d };
      if (bulkStatus !== '') updated.status = bulkStatus;
      if (bulkPlan === '__none__') {
        updated.planId = null;
      } else if (bulkPlan !== '') {
        updated.planId = bulkPlan;
        const plan = plans.find((p) => p.id === bulkPlan);
        if (plan?.cardId) updated.cardId = plan.cardId; /* amarra ao card do plano, se houver */
      }
      if (await saveDefect(updated)) ok++;
    }
    setBulkBusy(false);
    showToast(`${ok} defeito${ok === 1 ? '' : 's'} atualizado${ok === 1 ? '' : 's'}.`, 'success');
    setBulkStatus(''); setBulkPlan('');
    if (activeId) load(activeId);
  };

  const azureSelected = useMemo(() => defects.filter((d) => selectedIds.has(d.id) && d.azureWorkItemId && d.azureConfigId), [defects, selectedIds]);
  const bulkSyncAzure = async () => {
    if (!myPat) { showToast('Configure seu PAT em Meu Perfil para sincronizar.', 'warning'); return; }
    if (azureSelected.length === 0) { showToast('Nenhum selecionado tem vínculo com o Azure.', 'warning'); return; }
    setBulkBusy(true);
    let ok = 0;
    for (const d of azureSelected) {
      const cfg = azureConfigs.find((c) => c.id === d.azureConfigId);
      if (!cfg) continue;
      try {
        const wi = await getWorkItem({ organization: cfg.organization, project: cfg.project, pat: myPat }, d.azureWorkItemId!);
        const updated: Defect = { ...d, azureState: wi.state, azureSyncedAt: new Date().toISOString(), status: mapAzureStateToStatus(wi.state) };
        if (await saveDefect(updated)) ok++;
      } catch { /* pula o que falhar */ }
    }
    setBulkBusy(false);
    showToast(`${ok} defeito${ok === 1 ? '' : 's'} sincronizado${ok === 1 ? '' : 's'} do Azure.`, 'success');
    if (activeId) load(activeId);
  };

  const deletableSelected = useMemo(() => defects.filter((d) => selectedIds.has(d.id) && canDel(d)), [defects, selectedIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const bulkDelete = async () => {
    setBulkBusy(true);
    let ok = 0;
    for (const d of deletableSelected) { if (await deleteDefect(d.id)) ok++; }
    setBulkBusy(false); setBulkConfirmDel(false);
    showToast(`${ok} defeito${ok === 1 ? '' : 's'} excluído${ok === 1 ? '' : 's'}.`, 'success');
    if (activeId) load(activeId);
  };

  const novo = (): Defect => ({
    id: genId(), projectId: activeId!, kind, runResultId: null, cardId: null, planId: null, title: '', description: '',
    severity: 'medium', status: 'pending_azure', externalKey: null, createdBy: currentUserId(), createdAt: new Date().toISOString(), evidence: [],
    azureWorkItemId: null, azureConfigId: null, azureTemplateId: null, azureState: null, azureSyncedAt: null, azureCustomFields: {},
  });

  const onSaved = async (d: Defect, isEdit: boolean) => {
    if (!(await saveDefect(d))) return;
    showToast(`${L.title} ${isEdit ? 'salva' : 'criada'}.`, 'success');
    setEditor(null); if (activeId) load(activeId);
  };

  const originOf = (d: Defect) => (d.runResultId ? origin.get(d.runResultId) ?? null : null);

  const actions = <ProjectBar projects={projects} activeId={activeId} onChange={setActiveId} onCreated={reload} />;

  return (
    <TestsLayout title={L.title} activeTest={L.activeTest} actions={actions} help={L.help} loading={loading || busy}>
      {!activeId ? (
        <div className="tests-empty"><h2>Selecione um projeto</h2><p>Escolha ou crie um projeto no seletor acima.</p></div>
      ) : (
        <>
          <div className="casos-searchblock">
            <div className="casos-searchblock-top">
              <div className="casos-search-wrap">
                <IconSearch className="casos-search-icon" />
                <input className="casos-search" placeholder={`Buscar ${L.singular} por título, chave ou descrição…`} value={search} onChange={(e) => setSearch(e.target.value)} />
                {search && <button className="casos-search-clear" onClick={() => setSearch('')} title="Limpar busca" aria-label="Limpar busca"><IconX /></button>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {podeCriar && azureConfigs.length > 0 && myPat && (
                  <button className="btn btn-ghost btn-sm casos-new-btn" onClick={() => setImporting(true)} title={`Importar ${L.singular === 'bug' ? 'bugs' : 'itens'} existentes do Azure DevOps`}>↓ {L.importBtn}</button>
                )}
                {podeCriar && <button className="btn btn-primary btn-sm casos-new-btn" onClick={() => setEditor({ mode: 'create', data: novo() })}><IconPlus /> {L.novo}</button>}
              </div>
            </div>
            <div className="casos-filtergrid">
              <div className="filter-field"><label>Severidade</label>
                <select className="col-filter" value={fSeverity} onChange={(e) => setFSeverity(e.target.value as typeof fSeverity)}>
                  <option value="all">Todas</option>
                  {Object.entries(DEFECT_SEVERITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="filter-field"><label>Status</label>
                <select className="col-filter" value={fStatus} onChange={(e) => setFStatus(e.target.value as typeof fStatus)}>
                  <option value="all">Todos</option>
                  {Object.entries(DEFECT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            {hasFilters && (
              <div className="casos-filtergrid-footer">
                <button className="btn btn-ghost btn-sm" onClick={clearFilters}><IconX /> Limpar filtros</button>
              </div>
            )}
          </div>

          {selectedIds.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', marginBottom: 12, background: 'var(--accent-subtle, var(--bg-secondary))', border: '1px solid var(--accent)', borderRadius: 8 }}>
              <strong style={{ fontSize: 13 }}>{selectedIds.size} selecionado{selectedIds.size === 1 ? '' : 's'}</strong>
              <select className="col-filter" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as typeof bulkStatus)} title="Alterar status">
                <option value="">Status: manter</option>
                {Object.entries(DEFECT_STATUS_LABEL).filter(([k]) => k !== 'pending_azure').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className="col-filter" value={bulkPlan} onChange={(e) => setBulkPlan(e.target.value)} title="Vincular plano de teste">
                <option value="">Plano: manter</option>
                <option value="__none__">Sem vínculo</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" onClick={applyBulk} disabled={bulkBusy}>{bulkBusy ? 'Aplicando…' : 'Aplicar'}</button>
              {azureSelected.length > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={bulkSyncAzure} disabled={bulkBusy} title="Atualizar status/estado a partir do Azure">↻ Atualizar do Azure ({azureSelected.length})</button>
              )}
              <span style={{ flex: 1 }} />
              {deletableSelected.length > 0 && (
                <button className="btn btn-danger btn-sm" onClick={() => setBulkConfirmDel(true)} disabled={bulkBusy}><IconTrash /> Excluir ({deletableSelected.length})</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>Limpar seleção</button>
            </div>
          )}

          <div className="casos-table-wrap">
            {busy ? (
              <p className="tests-muted" style={{ padding: 16 }}>Carregando…</p>
            ) : filtered.length === 0 ? (
              <div className="tests-empty">
                <h2>Nenhuma {L.title.toLowerCase()}</h2>
                <p>{defects.length === 0 ? `Nenhuma ${L.title.toLowerCase()} registrada neste projeto.` : `Nenhuma ${L.title.toLowerCase()} corresponde aos filtros.`}</p>
              </div>
            ) : (
              <table className="tests-table">
                <thead><tr>
                  <th style={{ width: 32, textAlign: 'center' }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={editableFiltered.length === 0} title="Selecionar todos" aria-label="Selecionar todos" />
                  </th>
                  {([['title', 'Título'], ['azureId', 'Bug ID'], ['severity', 'Severidade'], ['status', 'Status'], ['card', 'Card'], ['sprint', 'Sprint'], ['createdBy', 'Criado por'], ['createdAt', 'Criado em']] as const).map(([key, label]) => (
                    <th key={key} onClick={() => toggleSort(key)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} title="Ordenar">
                      {label}{sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                  <th></th>
                </tr></thead>
                <tbody>
                  {sorted.map((d) => {
                    const linkedCard = d.cardId ? cards.find((c) => c.id === d.cardId) : null;
                    const linkedPlan = d.planId ? plans.find((p) => p.id === d.planId) : null;
                    const sprintId = linkedPlan?.sprintId ?? linkedCard?.sprintId ?? null;
                    const linkedSprint = sprintId ? sprints.find((s) => s.id === sprintId) : null;
                    return (
                      <tr key={d.id} className={selectedIds.has(d.id) ? 'row-selected' : undefined} style={d.status === 'closed' ? { opacity: 0.5 } : undefined}>
                        <td style={{ textAlign: 'center' }}>
                          {canEdit(d) && <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleOne(d.id)} aria-label="Selecionar defeito" />}
                        </td>
                        <td>
                          <button className="casos-link" onClick={() => setViewing(d)} title="Ver detalhes">{d.title || '(sem título)'}</button>
                          {d.externalKey && <div className="casos-tags"><span className="casos-tag">{d.externalKey}</span></div>}
                        </td>
                        <td>
                          {d.azureWorkItemId ? (
                            <span className="casos-tag" title={`Azure state: ${d.azureState ?? '?'}`}>#{d.azureWorkItemId}</span>
                          ) : <span className="tests-muted">—</span>}
                        </td>
                        <td><span className={`tests-chip prio-${d.severity}`}>{DEFECT_SEVERITY_LABEL[d.severity]}</span></td>
                        <td>
                          {d.azureState
                            ? <span className="tests-badge" style={azureStateStyle(d.azureState)} title={DEFECT_STATUS_LABEL[d.status]}>{d.azureState}</span>
                            : <span className={`tests-badge def-${d.status}`}>{DEFECT_STATUS_LABEL[d.status]}</span>}
                        </td>
                        <td className="tests-muted-cell">
                          {linkedCard?.azureId ? <span className="casos-tag">#{linkedCard.azureId}</span> : <span className="tests-muted">—</span>}
                        </td>
                        <td className="tests-muted-cell">{linkedSprint ? linkedSprint.name : <span className="tests-muted">—</span>}</td>
                        <td><span className="tests-author"><span className="tests-author-dot" aria-hidden>•</span>{userName(d.createdBy)}</span></td>
                        <td className="tests-muted-cell">{formatDate(d.createdAt)}</td>
                        <td className="casos-actions-cell">
                          <div className="casos-rowactions">
                            {!d.azureWorkItemId && azureConfigs.length > 0 && (
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => setSendingToAzure(clone(d))}
                                title="Enviar ao Azure DevOps"
                                aria-label="Enviar ao Azure"
                                style={{ fontSize: 11, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                              >
                                ↑ Azure
                              </button>
                            )}
                            {canEdit(d) && <button className="tests-iconbtn" onClick={() => setEditor({ mode: 'edit', data: clone(d) })} title="Editar" aria-label="Editar"><IconPencil /></button>}
                            {canDel(d) && <button className="tests-iconbtn danger" onClick={() => setConfirmDel(d)} title="Excluir" aria-label="Excluir"><IconTrash /></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {importing && activeId && (
        <ImportFromAzureModal
          kind={kind}
          projectId={activeId}
          azureConfigs={azureConfigs}
          myPat={myPat}
          plans={plans}
          cards={cards}
          existingAzureIds={new Set(defects.map((d) => d.azureWorkItemId).filter((v): v is number => v != null))}
          onClose={() => setImporting(false)}
          onImported={(n) => { setImporting(false); if (n > 0 && activeId) load(activeId); }}
        />
      )}

      {sendingToAzure && (
        <SendToAzureModal
          defect={sendingToAzure}
          azureConfigs={azureConfigs}
          myPat={myPat}
          onClose={() => setSendingToAzure(null)}
          onSent={(updated) => {
            setSendingToAzure(null);
            setDefects((prev) => prev.map((d) => d.id === updated.id ? updated : d));
            if (viewing?.id === updated.id) setViewing(updated);
            saveDefect(updated);
          }}
        />
      )}

      {viewing && (
        <DefectDetail
          defect={viewing} origin={originOf(viewing)} authorName={userName(viewing.createdBy)} authorInitials={userInitials(viewing.createdBy)}
          canEdit={canEdit(viewing)} canDelete={canDel(viewing)}
          plans={plans} cards={cards} sprints={sprints} milestones={milestones} runsMap={runsMap}
          azureConfigs={azureConfigs} myPat={myPat}
          onSendToAzure={!viewing.azureWorkItemId && azureConfigs.length > 0 ? () => { setSendingToAzure(clone(viewing)); setViewing(null); } : undefined}
          onEdit={() => { setEditor({ mode: 'edit', data: clone(viewing) }); setViewing(null); }}
          onDelete={() => { setConfirmDel(viewing); setViewing(null); }}
          onClose={() => setViewing(null)}
          onUpdated={(updated) => {
            setViewing(updated);
            setDefects((prev) => prev.map((d) => d.id === updated.id ? updated : d));
            saveDefect(updated);
          }}
        />
      )}
      {editor && (
        <DefectEditor
          mode={editor.mode} initial={editor.data}
          azureConfigs={azureConfigs} myPat={myPat}
          plans={plans} cards={cards}
          onClose={() => setEditor(null)} onSave={onSaved}
        />
      )}
      {confirmDel && (
        <Modal title="Excluir defeito" onClose={() => setConfirmDel(null)} footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Cancelar</button>
            <button className="btn btn-danger" onClick={async () => {
              if (await deleteDefect(confirmDel.id)) { showToast('Defeito excluído.', 'success'); if (activeId) load(activeId); }
              setConfirmDel(null);
            }}>Excluir</button>
          </>
        }>
          <p style={{ color: 'var(--text-secondary)' }}>Excluir <strong style={{ color: 'var(--text-primary)' }}>{confirmDel.title}</strong>? Esta ação não pode ser desfeita.</p>
        </Modal>
      )}
      {bulkConfirmDel && (
        <Modal title="Excluir defeitos" onClose={() => setBulkConfirmDel(false)} footer={
          <>
            <button className="btn btn-ghost" onClick={() => setBulkConfirmDel(false)} disabled={bulkBusy}>Cancelar</button>
            <button className="btn btn-danger" onClick={bulkDelete} disabled={bulkBusy}>{bulkBusy ? 'Excluindo…' : `Excluir ${deletableSelected.length}`}</button>
          </>
        }>
          <p style={{ color: 'var(--text-secondary)' }}>Excluir <strong style={{ color: 'var(--text-primary)' }}>{deletableSelected.length}</strong> defeito{deletableSelected.length === 1 ? '' : 's'} selecionado{deletableSelected.length === 1 ? '' : 's'}? Esta ação não pode ser desfeita.</p>
        </Modal>
      )}
    </TestsLayout>
  );
}

/* ── Visualização / Detalhe ── */
function DefectDetail({ defect, origin, authorName, authorInitials, canEdit, canDelete, plans, cards, sprints, milestones, runsMap, azureConfigs, myPat, onSendToAzure, onEdit, onDelete, onClose, onUpdated }: {
  defect: Defect; origin: Origin | null; authorName: string; authorInitials: string;
  canEdit: boolean; canDelete: boolean;
  plans: TestPlan[]; cards: Card[]; sprints: Sprint[]; milestones: Milestone[]; runsMap: Map<string, TestRun>;
  azureConfigs: AzureConfig[]; myPat: string;
  onSendToAzure?: () => void;
  onEdit: () => void; onDelete: () => void; onClose: () => void;
  onUpdated: (d: Defect) => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [comments, setComments] = useState<AzureComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [myAzureId, setMyAzureId] = useState<string | null>(null);
  const objectUrls = useRef<string[]>([]);
  useEffect(() => () => { objectUrls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);
  const [lightbox, setLightbox] = useState<string | null>(null);
  /* Clique numa imagem (descrição/comentário) abre o lightbox. */
  const onImgClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'IMG') { e.preventDefault(); setLightbox((t as HTMLImageElement).src); }
  };

  const linkedCard = defect.cardId ? cards.find((c) => c.id === defect.cardId) : null;
  const linkedPlan = defect.planId ? plans.find((p) => p.id === defect.planId) : null;
  const linkedSprint = linkedPlan?.sprintId ? sprints.find((s) => s.id === linkedPlan.sprintId) : (linkedCard?.sprintId ? sprints.find((s) => s.id === linkedCard.sprintId) : null);
  const linkedMilestone = linkedPlan?.milestoneId ? milestones.find((m) => m.id === linkedPlan.milestoneId) : (linkedSprint?.milestoneId ? milestones.find((m) => m.id === linkedSprint.milestoneId) : null);
  const linkedRun = defect.runResultId ? runsMap.get(defect.runResultId) ?? null : null;

  const scf = defect.azureCustomFields as Record<string, string | undefined>;
  const sAmb = linkedRun?.ambiente       ?? scf._s_amb ?? null;
  const sCo  = linkedRun?.company        ?? scf._s_co  ?? null;
  const sBo  = linkedRun?.versaoBackoffice ?? scf._s_bo  ?? null;
  const sB2b = linkedRun?.versaoB2b      ?? scf._s_b2b ?? null;

  const azureCfg = azureConfigs.find((c) => c.id === defect.azureConfigId);

  const apiCfg = azureCfg && myPat ? { organization: azureCfg.organization, project: azureCfg.project, pat: myPat } : null;

  /* Substitui imagens de anexos Azure (protegidas por PAT) por blob URLs p/ exibir dentro do comentário. */
  const inlineComments = useCallback(async (cms: AzureComment[]): Promise<AzureComment[]> => {
    if (!apiCfg) return cms;
    return Promise.all(cms.map(async (cm) => {
      const tags = extractImgTags(cm.text ?? '').filter((t) => /_apis\/wit\/attachments/i.test(t.url));
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiCfg?.organization, apiCfg?.project, apiCfg?.pat]);

  useEffect(() => {
    if (!apiCfg || !defect.azureWorkItemId) return;
    setLoadingComments(true);
    Promise.all([
      getComments(apiCfg, defect.azureWorkItemId),
      getMyAzureId(apiCfg),
    ])
      .then(async ([cms, azId]) => { setComments(await inlineComments(cms)); setMyAzureId(azId); })
      .catch(() => {})
      .finally(() => setLoadingComments(false));
  }, [defect.azureWorkItemId]);

  const syncAzure = async () => {
    if (!apiCfg || !defect.azureWorkItemId) return;
    setSyncing(true);
    try {
      const wi = await getWorkItem(apiCfg, defect.azureWorkItemId);
      const updated: Defect = {
        ...defect,
        azureState: wi.state,
        azureSyncedAt: new Date().toISOString(),
        status: mapAzureStateToStatus(wi.state),
      };
      onUpdated(updated);
      const fresh = await getComments(apiCfg, defect.azureWorkItemId);
      setComments(await inlineComments(fresh));
      showToast('Bug sincronizado do Azure.', 'success');
    } catch (e) {
      showToast(`Erro ao sincronizar: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
    setSyncing(false);
  };

  const sendComment = async () => {
    if (!newComment.trim() || !apiCfg || !defect.azureWorkItemId) return;
    setSendingComment(true);
    try {
      const c = await addComment(apiCfg, defect.azureWorkItemId, newComment.trim());
      setComments((prev) => [...prev, c]);
      setNewComment('');
      showToast('Comentário enviado.', 'success');
    } catch (e) {
      showToast(`Erro ao comentar: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
    setSendingComment(false);
  };

  return (
    <Modal large title={defect.title || '(sem título)'} onClose={onClose} footer={
      <>
        <span style={{ flex: 1 }} />
        {canDelete && <button className="btn btn-danger" onClick={onDelete}><IconTrash /> Excluir</button>}
        {onSendToAzure && (
          <button className="btn btn-primary" onClick={onSendToAzure}>
            ↑ Enviar ao Azure
          </button>
        )}
        {defect.azureWorkItemId && apiCfg && (
          <button className="btn btn-ghost" onClick={syncAzure} disabled={syncing}>
            {syncing ? 'Sincronizando…' : '↺ Atualizar do Azure'}
          </button>
        )}
        {canEdit && <button className="btn btn-ghost" onClick={onEdit}><IconPencil /> Editar</button>}
        <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
      </>
    }>
      <div className="case-detail">
        <header className="case-detail-header">
          <div className="case-detail-facts">
            <div className="fact">
              <span className="fact-label">Severidade</span>
              <span className="fact-value"><span className={`tests-chip prio-${defect.severity}`}>{DEFECT_SEVERITY_LABEL[defect.severity]}</span></span>
            </div>
            <div className="fact">
              <span className="fact-label">Status</span>
              <span className="fact-value"><span className={`tests-badge def-${defect.status}`}>{DEFECT_STATUS_LABEL[defect.status]}</span></span>
            </div>
            <div className="fact">
              <span className="fact-label">Origem</span>
              <span className="fact-value">
                {origin
                  ? `${origin.caseTitle} · ${origin.runName}`
                  : scf._s_charter
                    ? <><span className="casos-tag" style={{ fontSize: 11 }}>Exploratório</span> {scf._s_charter}</>
                    : <span className="tests-muted">Manual</span>}
              </span>
            </div>
            <div className="fact">
              <span className="fact-label">Criado em</span>
              <span className="fact-value">{formatDate(defect.createdAt)}</span>
            </div>
          </div>
          {(linkedCard || linkedPlan || linkedSprint || linkedMilestone || sAmb || sCo || sBo || sB2b) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12, padding: '10px 14px', background: 'var(--surface-alt, #f7f8fa)', borderRadius: 8, border: '1px solid var(--border)' }}>
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
          <div className="case-detail-meta">
            <span className="case-detail-avatar" aria-hidden>{authorInitials}</span>
            <div className="case-detail-author">
              <span className="case-detail-author-name">{authorName}</span>
              <span className="case-detail-author-date">Criado em {formatDate(defect.createdAt)}</span>
            </div>
          </div>
        </header>

        {defect.azureWorkItemId && (
          <section className="case-detail-block">
            <h4>Azure Work Item</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="casos-tag" style={{ fontSize: 13 }}>#{defect.azureWorkItemId}</span>
              {defect.azureState && <span className={`tests-badge azure-state-${/done|closed|resolved/i.test(defect.azureState) ? 'done' : /active|progress/i.test(defect.azureState) ? 'active' : 'new'}`} style={{ fontSize: 12 }}>{defect.azureState}</span>}
              {azureCfg && <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{azureCfg.name}</span>}
              {defect.azureSyncedAt && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>- {formatDate(defect.azureSyncedAt)}</span>}
            </div>
          </section>
        )}

        {defect.description && (
          <section className="case-detail-block">
            <h4>Descrição</h4>
            {/<[a-z!/][\s\S]*>/i.test(defect.description)
              ? <div className="defect-desc-html" onClick={onImgClick} dangerouslySetInnerHTML={{ __html: defect.description }} />
              : <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{defect.description}</p>}
          </section>
        )}


        {defect.evidence.length > 0 && (
          <section className="case-detail-block">
            <h4>Evidências</h4>
            <div className="runner-evidence-list">
              {defect.evidence.map((e, i) => (
                <div className={`evi${isImage(e.url) ? ' evi--img' : ''}`} key={i}>
                  {isImage(e.url) ? (
                    <><a className="evi-thumb" href={e.url} target="_blank" rel="noreferrer" title={e.name}><img src={e.url} alt={e.name} /></a>
                      <span className="evi-cap" title={e.name}>{e.name}</span></>
                  ) : (
                    <a className="evi-link" href={e.url} target="_blank" rel="noreferrer" title={e.name}><IconExternal /> {e.name}</a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Comentários Azure */}
        {defect.azureWorkItemId && apiCfg && (
          <section className="case-detail-block">
            <h4>Comentários Azure DevOps</h4>
            {loadingComments ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Carregando comentários…</p>
            ) : comments.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Nenhum comentário.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }} onClick={onImgClick}>
                {comments.map((cm) => {
                  const isMe = !!myAzureId && cm.createdBy?.id === myAzureId;
                  const authorName = cm.createdBy?.displayName ?? 'Azure';
                  const initials = authorName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
                  return (
                    <div key={cm.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexDirection: isMe ? 'row-reverse' : 'row', maxWidth: '85%' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: isMe ? 'var(--accent)' : '#6c757d', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                          {initials}
                        </div>
                        <div style={{ background: isMe ? 'var(--accent)' : 'var(--bg-secondary)', color: isMe ? '#fff' : 'var(--text-primary)', borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '10px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
                          {!isMe && <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, opacity: 0.7 }}>{authorName}</div>}
                          <p className="azure-comment-text" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: cm.text }} />
                          <div style={{ fontSize: 11, marginTop: 5, opacity: 0.6, textAlign: isMe ? 'right' : 'left' }}>
                            <span style={{ fontWeight: 600 }}>{authorName}</span> · {formatDate(cm.createdDate)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Adicionar comentário…"
                onKeyDown={(e) => e.key === 'Enter' && !sendingComment && sendComment()}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary btn-sm" onClick={sendComment} disabled={sendingComment || !newComment.trim()}>
                {sendingComment ? '…' : 'Enviar'}
              </button>
            </div>
          </section>
        )}
      </div>
      {lightbox && (
        <div className="img-lightbox" onClick={() => setLightbox(null)}>
          <button className="img-lightbox-close" onClick={() => setLightbox(null)} aria-label="Fechar">✕</button>
          <img src={lightbox} alt="Imagem ampliada" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </Modal>
  );
}

/* ── Editor de defeito ── */
function DefectEditor({ mode, initial, azureConfigs, myPat, plans, cards, onClose, onSave }: {
  mode: 'create' | 'edit'; initial: Defect; azureConfigs: AzureConfig[]; myPat: string;
  plans: TestPlan[]; cards: Card[];
  onClose: () => void; onSave: (d: Defect, isEdit: boolean) => void;
}) {
  const [d, setD] = useState<Defect>(initial);
  const [sendToAzure, setSendToAzure] = useState(false);
  const [azureTemplates, setAzureTemplates] = useState<AzureTemplate[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [iterations, setIterations] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [bugFields, setBugFields] = useState<AzureWorkItemField[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState('');

  const set = <K extends keyof Defect>(k: K, v: Defect[K]) => setD((p) => ({ ...p, [k]: v }));

  /* Vincular plano: se o plano tiver card, amarra o defeito ao card do plano. */
  const onPlanChange = (planId: string) => {
    const plan = planId ? plans.find((p) => p.id === planId) : null;
    setD((p) => ({ ...p, planId: planId || null, cardId: plan?.cardId ?? p.cardId }));
  };
  const planCardId = d.planId ? plans.find((p) => p.id === d.planId)?.cardId ?? null : null;

  const customVal = (ref: string) => String(d.azureCustomFields?.[ref] ?? '');
  const setCustomVal = (ref: string, val: string | number) => set('azureCustomFields', { ...(d.azureCustomFields ?? {}), [ref]: val });

  const selectedCfg = azureConfigs.find((c) => c.id === d.azureConfigId);
  const apiCfg = selectedCfg && myPat ? { organization: selectedCfg.organization, project: selectedCfg.project, pat: myPat } : null;
  const selectedTemplate = azureTemplates.find((t) => t.id === d.azureTemplateId) ?? null;
  const hasAzure = azureConfigs.length > 0 && !!myPat;

  const onConfigChange = async (configId: string) => {
    set('azureConfigId', configId);
    set('azureTemplateId', null);
    setAzureTemplates([]); setAreas([]); setIterations([]); setStates([]); setBugFields([]);
    if (!configId) return;
    const tmpl = await listAzureTemplatesForConfig(configId);
    setAzureTemplates(tmpl);
    if (tmpl.length > 0) set('azureTemplateId', tmpl[0].id);
  };

  useEffect(() => {
    if (!d.azureConfigId) return;
    listAzureTemplatesForConfig(d.azureConfigId).then((tmpl) => {
      setAzureTemplates(tmpl);
      if (!d.azureTemplateId && tmpl.length > 0) set('azureTemplateId', tmpl[0].id);
    });
  }, []);

  const loadMeta = async () => {
    if (!apiCfg) return;
    setLoadingMeta(true);
    setSendStatus('Carregando dados do Azure…');
    try {
      const [a, it, st, bf] = await Promise.all([
        fetchAreas(apiCfg), fetchIterations(apiCfg), fetchBugStates(apiCfg), fetchBugFields(apiCfg),
      ]);
      setAreas(a); setIterations(it); setStates(st); setBugFields(bf);
      setSendStatus('');
    } catch (e) {
      setSendStatus('');
      showToast(`Erro ao carregar dados: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
    setLoadingMeta(false);
  };

  const submit = async () => {
    if (!d.title.trim()) { showToast('Informe o título do defeito.', 'warning'); return; }
    const defect: Defect = { ...d, title: d.title.trim(), description: d.description.trim(), externalKey: d.externalKey?.trim() || null };

    if (sendToAzure && apiCfg) {
      setSending(true);
      try {
        /* 1. Montar Repro Steps HTML com evidências locais */
        const reproText = String(defect.azureCustomFields?.['Microsoft.VSTS.TCM.ReproSteps'] ?? '');
        let reproHtml = reproText ? `<p>${reproText.replace(/\n/g, '<br/>')}</p>` : '';

        /* 2. Upload de evidências para o Azure */
        setSendStatus('Fazendo upload de evidências…');
        const attachmentUrls: string[] = [];
        for (const ev of defect.evidence) {
          try {
            const res = await fetch(ev.url);
            const blob = await res.blob();
            const azUrl = await uploadAttachment(apiCfg, ev.name, blob);
            attachmentUrls.push(azUrl);
            if (isImage(ev.url)) {
              reproHtml += `<img src="${azUrl}" width="800" alt="${ev.name}" />`;
            }
          } catch {
            /* Upload de evidência falhou — continua sem ela */
          }
        }

        /* 3. Montar campos do bug */
        setSendStatus('Criando bug no Azure…');
        const bugState = customVal('System.State') || states[0] || 'New';
        const fields: Record<string, unknown> = {
          'System.Title': defect.title,
          'System.State': bugState,
        };

        const reason = customVal('System.Reason');
        if (reason) fields['System.Reason'] = reason;
        const areaPath = customVal('System.AreaPath');
        if (areaPath) fields['System.AreaPath'] = areaPath;
        const iterPath = customVal('System.IterationPath');
        if (iterPath) fields['System.IterationPath'] = iterPath;
        const owner = customVal('System.AssignedTo');
        if (owner) fields['System.AssignedTo'] = owner;
        const imgHtmlEditor = attachmentUrls
          .filter((u) => /\.(png|jpe?g|gif|webp|bmp|svg)/i.test(u))
          .map((u) => `<img src="${u}" width="800" />`)
          .join('');
        if (defect.description || imgHtmlEditor) {
          fields['System.Description'] = (defect.description ? defect.description.replace(/\n/g, '<br/>') : '') + (imgHtmlEditor ? '<br/><br/>' + imgHtmlEditor : '');
        }
        if (reproHtml) fields['Microsoft.VSTS.TCM.ReproSteps'] = reproHtml;

        /* Campos do template */
        if (selectedTemplate) {
          for (const f of selectedTemplate.fields) {
            if (['System.State', 'System.Reason', 'System.AreaPath', 'System.IterationPath', 'System.AssignedTo', 'Microsoft.VSTS.TCM.ReproSteps'].includes(f.referenceName)) continue;
            const val = defect.azureCustomFields?.[f.referenceName];
            if (val !== undefined && val !== '') {
              fields[f.referenceName] = f.type === 'integer' ? Number(val) : val;
            }
          }
        }

        /* Campos customizados do projeto (detectados automaticamente via API) */
        for (const bf of bugFields.filter((f) => f.isCustomField)) {
          if (fields[bf.referenceName] !== undefined) continue;
          const val = defect.azureCustomFields?.[bf.referenceName];
          if (val !== undefined && val !== '') fields[bf.referenceName] = val;
        }

        /* 4. Criar bug */
        const workItemId = await createBug(apiCfg, fields);

        /* 5. Vincular anexos */
        if (attachmentUrls.length > 0) {
          setSendStatus('Vinculando anexos…');
          for (const url of attachmentUrls) {
            await linkAttachment(apiCfg, workItemId, url).catch(() => {});
          }
        }

        /* 6. Comentário automático */
        setSendStatus('Adicionando comentário…');
        await addComment(apiCfg, workItemId, 'Criado via QA Reporter.').catch(() => {});

        defect.azureWorkItemId = workItemId;
        defect.azureState = bugState;
        defect.azureSyncedAt = new Date().toISOString();
        defect.externalKey = defect.externalKey || `#${workItemId}`;
        defect.azureConfigId = d.azureConfigId;
        defect.azureTemplateId = d.azureTemplateId;
        showToast(`Bug criado no Azure: #${workItemId}`, 'success');
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        const match = raw.match(/Azure \d+: (\{.+)/s);
        if (match) {
          try {
            const body = JSON.parse(match[1]);
            const errs: { fieldReferenceName: string }[] = body?.customProperties?.RuleValidationErrors ?? [];
            if (errs.length > 0) {
              const names = errs.map((r) => {
                const bf = bugFields.find((f) => f.referenceName === r.fieldReferenceName);
                return bf ? `${bf.name} (${r.fieldReferenceName})` : r.fieldReferenceName;
              }).join(', ');
              showToast(`Campos obrigatórios não preenchidos: ${names}`, 'error');
              setSending(false); setSendStatus('');
              return;
            }
          } catch { /* segue */ }
        }
        showToast(`Erro ao criar no Azure: ${raw}`, 'error');
        setSending(false); setSendStatus('');
        return;
      }
      setSending(false); setSendStatus('');
    }

    onSave(defect, mode === 'edit');
  };

  return (
    <Modal large title={mode === 'create' ? 'Novo Defeito' : 'Editar Defeito'} onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={sending}>Cancelar</button>
        <button className="btn btn-primary" onClick={submit} disabled={sending}>
          {sending ? (sendStatus || 'Enviando…') : mode === 'create' ? 'Criar' : 'Salvar'}
        </button>
      </>
    }>
      {/* ── Campos locais ── */}
      <div className="form-group">
        <label>Título *</label>
        <input type="text" value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="Resumo do defeito" />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Plano de Teste <span className="form-label-opt">(opcional)</span></label>
          <select value={d.planId ?? ''} onChange={(e) => onPlanChange(e.target.value)}>
            <option value="">Sem vínculo</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Card <span className="form-label-opt">(opcional)</span></label>
          <select value={d.cardId ?? ''} onChange={(e) => set('cardId', e.target.value || null)}>
            <option value="">Sem vínculo</option>
            {cards.map((c) => <option key={c.id} value={c.id}>{c.azureId ? `#${c.azureId} — ` : ''}{c.title || c.id}</option>)}
          </select>
          {planCardId && d.cardId === planCardId && (
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Vinculado automaticamente ao card do plano de teste.</p>
          )}
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Severidade</label>
          <select value={d.severity} onChange={(e) => set('severity', e.target.value as DefectSeverity)}>
            {Object.entries(DEFECT_SEVERITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Status local</label>
          <select value={d.status} onChange={(e) => set('status', e.target.value as DefectStatus)}>
            {Object.entries(DEFECT_STATUS_LABEL).filter(([k]) => k !== 'pending_azure').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label>Chave externa <span className="form-label-opt">(opcional)</span></label>
        <input type="text" value={d.externalKey ?? ''} onChange={(e) => set('externalKey', e.target.value)} placeholder="Ex.: BUG-1042" />
      </div>
      <div className="form-group">
        <label>Descrição</label>
        <textarea value={d.description} onChange={(e) => set('description', e.target.value)} placeholder="Comportamento esperado vs. obtido…" />
      </div>
      <div className="form-group">
        <label>Evidências <span className="form-label-opt">(prints/arquivos — serão enviados ao Azure se integrado)</span></label>
        <PhotoUploader folderId={d.id} evidence={d.evidence} onChange={(ev) => set('evidence', ev)} />
      </div>

      {/* ── Seção Azure DevOps ── */}
      {(hasAzure || d.azureWorkItemId) && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 8 }}>
          {!d.azureWorkItemId ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={sendToAzure} onChange={(e) => setSendToAzure(e.target.checked)} />
              <span style={{ fontWeight: 600 }}>Enviar para Azure DevOps</span>
            </label>
          ) : (
            <p style={{ fontSize: 13, marginBottom: 12, color: 'var(--text-secondary)' }}>
              Vinculado ao Azure: <strong style={{ color: 'var(--text-primary)' }}>#{d.azureWorkItemId}</strong>
              {d.azureState && ` · ${d.azureState}`}
            </p>
          )}

          {sendToAzure && !d.azureWorkItemId && (
            myPat ? (
              <>
                {/* Conexão + Template */}
                <div className="form-row">
                  <div className="form-group">
                    <label>Conexão</label>
                    <select value={d.azureConfigId ?? ''} onChange={(e) => onConfigChange(e.target.value)}>
                      <option value="">Selecione…</option>
                      {azureConfigs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Template</label>
                    <select value={d.azureTemplateId ?? ''} onChange={(e) => set('azureTemplateId', e.target.value)} disabled={!d.azureConfigId}>
                      <option value="">Sem template</option>
                      {azureTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* Botão carregar dados do Azure */}
                {d.azureConfigId && (
                  <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }} onClick={loadMeta} disabled={loadingMeta}>
                    {loadingMeta ? 'Carregando…' : '↓ Carregar States, Áreas, Iterações e Usuários'}
                  </button>
                )}

                {/* Campos padrão do Azure */}
                {(states.length > 0 || areas.length > 0 || iterations.length > 0) && (
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)' }}>CAMPOS AZURE</p>
                    <div className="form-row">
                      {states.length > 0 && (
                        <div className="form-group">
                          <label>Estado</label>
                          <select value={customVal('System.State')} onChange={(e) => setCustomVal('System.State', e.target.value)}>
                            {states.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      )}
                      <div className="form-group">
                        <label>Motivo (Reason)</label>
                        <input type="text" autoComplete="off" value={customVal('System.Reason')} onChange={(e) => setCustomVal('System.Reason', e.target.value)} placeholder="New" />
                      </div>
                    </div>
                    {areas.length > 0 && (
                      <div className="form-row">
                        <div className="form-group">
                          <label>Área</label>
                          <select value={customVal('System.AreaPath')} onChange={(e) => setCustomVal('System.AreaPath', e.target.value)}>
                            <option value="">Padrão do projeto</option>
                            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </div>
                        {iterations.length > 0 && (
                          <div className="form-group">
                            <label>Iteração</label>
                            <select value={customVal('System.IterationPath')} onChange={(e) => setCustomVal('System.IterationPath', e.target.value)}>
                              <option value="">Padrão do projeto</option>
                              {iterations.map((it) => <option key={it} value={it}>{it}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="form-group">
                      <label>Responsável (Owner)</label>
                      <input type="text" autoComplete="off" value={customVal('System.AssignedTo')} onChange={(e) => setCustomVal('System.AssignedTo', e.target.value)} placeholder="Ex.: João Silva" />
                    </div>
                  </div>
                )}

                {/* Repro Steps */}
                <div className="form-group">
                  <label>Repro Steps <span className="form-label-opt">(enviado como HTML ao Azure)</span></label>
                  <textarea
                    rows={4}
                    value={customVal('Microsoft.VSTS.TCM.ReproSteps')}
                    onChange={(e) => setCustomVal('Microsoft.VSTS.TCM.ReproSteps', e.target.value)}
                    placeholder={'1. Acesse a tela X\n2. Clique em Y\n3. Observe o erro'}
                  />
                  {d.evidence.length > 0 && (
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {d.evidence.length} evidência{d.evidence.length > 1 ? 's' : ''} serão enviadas ao Azure e inseridas nos Repro Steps automaticamente.
                    </p>
                  )}
                </div>

                {/* Campos customizados do PROJETO (detectados automaticamente) */}
                {bugFields.filter((f) => f.isCustomField).length > 0 && (() => {
                  const templateRefs = new Set(selectedTemplate?.fields.map((f) => f.referenceName) ?? []);
                  const autoFields = bugFields.filter((f) => f.isCustomField && !templateRefs.has(f.referenceName));
                  if (autoFields.length === 0) return null;
                  return (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>CAMPOS DO PROJETO (Azure)</p>
                      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
                        Campos customizados detectados automaticamente. Preencha os obrigatórios.
                      </p>
                      {autoFields.map((f) => (
                        <div className="form-group" key={f.referenceName}>
                          <label>
                            {f.name}
                            <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{f.referenceName}</span>
                          </label>
                          {f.allowedValues.length > 0 ? (
                            <select value={customVal(f.referenceName)} onChange={(e) => setCustomVal(f.referenceName, e.target.value)}>
                              <option value="">Selecione…</option>
                              {f.allowedValues.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input type="text" autoComplete="off" value={customVal(f.referenceName)} onChange={(e) => setCustomVal(f.referenceName, e.target.value)} placeholder={f.name} />
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Campos dinâmicos do template (exceto os já mostrados acima) */}
                {selectedTemplate && selectedTemplate.fields.filter((f) =>
                  !['System.State', 'System.Reason', 'System.AreaPath', 'System.IterationPath', 'System.AssignedTo', 'Microsoft.VSTS.TCM.ReproSteps'].includes(f.referenceName)
                ).length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)' }}>
                      CAMPOS CUSTOMIZADOS — {selectedTemplate.name}
                    </p>
                    {selectedTemplate.fields
                      .filter((f) => !['System.State', 'System.Reason', 'System.AreaPath', 'System.IterationPath', 'System.AssignedTo', 'Microsoft.VSTS.TCM.ReproSteps'].includes(f.referenceName))
                      .map((f) => (
                        <div className="form-group" key={f.referenceName}>
                          <label>{f.label}{f.required && ' *'}</label>
                          {f.type === 'dropdown' ? (
                            <select value={customVal(f.referenceName)} onChange={(e) => setCustomVal(f.referenceName, e.target.value)}>
                              <option value="">{f.defaultValue || 'Selecione…'}</option>
                              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : f.type === 'textarea' ? (
                            <textarea rows={3} value={customVal(f.referenceName)} onChange={(e) => setCustomVal(f.referenceName, e.target.value)} placeholder={f.defaultValue} />
                          ) : f.type === 'integer' ? (
                            <input type="number" value={customVal(f.referenceName)} onChange={(e) => setCustomVal(f.referenceName, e.target.value)} placeholder={f.defaultValue} />
                          ) : (
                            <input type="text" autoComplete="off" value={customVal(f.referenceName)} onChange={(e) => setCustomVal(f.referenceName, e.target.value)} placeholder={f.defaultValue} />
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </>
            ) : (
              <p style={{ color: 'var(--danger)', fontSize: 13 }}>
                Configure seu <strong>PAT</strong> em <strong>Meu Perfil</strong> para enviar ao Azure.
              </p>
            )
          )}
        </div>
      )}
    </Modal>
  );
}

/* ── Modal dedicado: Enviar bug existente ao Azure DevOps ── */
function SendToAzureModal({ defect, azureConfigs, myPat: initialPat, onClose, onSent }: {
  defect: Defect; azureConfigs: AzureConfig[]; myPat: string;
  onClose: () => void; onSent: (updated: Defect) => void;
}) {
  const [configId, setConfigId] = useState(azureConfigs[0]?.id ?? '');
  const [templateId, setTemplateId] = useState('');
  const [templates, setTemplates] = useState<AzureTemplate[]>([]);
  const [pat, setPat] = useState(initialPat);
  const [showPat, setShowPat] = useState(!initialPat);
  const [workItemType, setWorkItemType] = useState('Bug');
  const [workItemTypes, setWorkItemTypes] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [iterations, setIterations] = useState<string[]>([]);
  const [bugFields, setBugFields] = useState<AzureWorkItemField[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');

  /* Campos do work item Azure */
  const [azureState, setAzureState] = useState('');
  const [reason, setReason] = useState('');
  const [areaPath, setAreaPath] = useState('');
  const [iterPath, setIterPath] = useState('');
  const [owner, setOwner] = useState('');
  const [reproSteps, setReproSteps] = useState(defect.description || '');
  const [customVals, setCustomVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(defect.azureCustomFields ?? {}).map(([k, v]) => [k, String(v)]))
  );
  const setCV = (ref: string, val: string) => setCustomVals((p) => ({ ...p, [ref]: val }));

  const selectedCfg = azureConfigs.find((c) => c.id === configId);
  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  const apiCfg = selectedCfg && pat ? { organization: selectedCfg.organization, project: selectedCfg.project, pat } : null;

  /* Carrega templates quando conexão muda */
  useEffect(() => {
    if (!configId) return;
    listAzureTemplatesForConfig(configId).then((tmpl) => {
      setTemplates(tmpl);
      if (tmpl.length > 0) setTemplateId(tmpl[0].id);
    });
  }, [configId]);

  /* Auto-carrega tipos, áreas e iterações quando conexão/pat mudam */
  useEffect(() => {
    if (!configId || !pat) return;
    const cfg = azureConfigs.find((c) => c.id === configId);
    if (!cfg) return;
    const apicfg = { organization: cfg.organization, project: cfg.project, pat };
    let cancelled = false;
    setWorkItemTypes([]); setAreas([]); setIterations([]);
    fetchWorkItemTypes(apicfg).then((types) => { if (!cancelled) setWorkItemTypes(types); }).catch(() => {});
    Promise.all([fetchAreas(apicfg), fetchIterations(apicfg)]).then(([ar, it]) => {
      if (!cancelled) { setAreas(ar); setIterations(it); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [configId, pat]);

  /* Recarrega estados e campos quando tipo de work item muda */
  useEffect(() => {
    if (!configId || !pat || !workItemType) return;
    const cfg = azureConfigs.find((c) => c.id === configId);
    if (!cfg) return;
    const apicfg = { organization: cfg.organization, project: cfg.project, pat };
    let cancelled = false;
    setStates([]); setBugFields([]); setAzureState('');
    setLoadingMeta(true); setStatus(`Carregando campos de ${workItemType}…`);
    Promise.all([fetchWorkItemStates(apicfg, workItemType), fetchWorkItemFields(apicfg, workItemType)])
      .then(([st, bf]) => {
        if (cancelled) return;
        setStates(st); setBugFields(bf);
        setAzureState(st[0] || '');
      }).catch((e) => {
        if (cancelled) return;
        showToast(`Erro: ${e instanceof Error ? e.message : String(e)}`, 'error');
      }).finally(() => { if (!cancelled) { setLoadingMeta(false); setStatus(''); } });
    return () => { cancelled = true; };
  }, [configId, pat, workItemType]);

  const loadMeta = async () => {
    if (!apiCfg) { showToast('Selecione a conexão e informe o PAT.', 'warning'); return; }
    setLoadingMeta(true); setStatus('Carregando dados do Azure…');
    try {
      const [st, ar, it, bf] = await Promise.all([
        fetchWorkItemStates(apiCfg, workItemType), fetchAreas(apiCfg),
        fetchIterations(apiCfg), fetchWorkItemFields(apiCfg, workItemType),
      ]);
      setStates(st); setAreas(ar); setIterations(it); setBugFields(bf);
      if (st.length > 0) setAzureState(st[0]);
      setStatus('');
    } catch (e) {
      showToast(`Erro: ${e instanceof Error ? e.message : String(e)}`, 'error'); setStatus('');
    }
    setLoadingMeta(false);
  };

  const send = async () => {
    if (!apiCfg) { showToast('Configure a conexão e o PAT.', 'warning'); return; }

    /* Valida campos customizados com allowedValues obrigatórios ainda vazios */
    const emptyRequired = bugFields.filter(
      (f) => f.isCustomField && f.allowedValues.length > 0 && !customVals[f.referenceName],
    );
    if (emptyRequired.length > 0) {
      showToast(`Preencha os campos obrigatórios: ${emptyRequired.map((f) => f.name).join(', ')}`, 'warning');
      return;
    }

    setSending(true);

    try {
      /* 1. Upload de evidências */
      let reproHtml = reproSteps ? `<p>${reproSteps.replace(/\n/g, '<br/>')}</p>` : '';
      const attachUrls: string[] = [];
      if (defect.evidence.length > 0) {
        setStatus('Fazendo upload de evidências…');
        for (const ev of defect.evidence) {
          try {
            const res = await fetch(ev.url);
            const blob = await res.blob();
            const url = await uploadAttachment(apiCfg, ev.name, blob);
            attachUrls.push(url);
            if (isImage(ev.url)) reproHtml += `<img src="${url}" width="800" alt="${ev.name}" />`;
          } catch { /* falhou, continua */ }
        }
      }

      /* 2. Montar campos */
      setStatus('Criando bug no Azure…');
      const fields: Record<string, unknown> = { 'System.Title': defect.title };
      if (azureState) fields['System.State'] = azureState;
      if (reason) fields['System.Reason'] = reason;
      if (areaPath) fields['System.AreaPath'] = areaPath;
      if (iterPath) fields['System.IterationPath'] = iterPath;
      if (owner) fields['System.AssignedTo'] = owner;
      const imgHtml = attachUrls
        .filter((u) => /\.(png|jpe?g|gif|webp|bmp|svg)/i.test(u))
        .map((u) => `<img src="${u}" width="800" />`)
        .join('');
      if (defect.description || imgHtml) {
        fields['System.Description'] = (defect.description ? defect.description.replace(/\n/g, '<br/>') : '') + (imgHtml ? '<br/><br/>' + imgHtml : '');
      }
      if (reproHtml) fields['Microsoft.VSTS.TCM.ReproSteps'] = reproHtml;

      /* Campos do template */
      const SKIP = new Set(['System.State', 'System.Reason', 'System.AreaPath', 'System.IterationPath', 'System.AssignedTo', 'Microsoft.VSTS.TCM.ReproSteps']);
      if (selectedTemplate) {
        for (const f of selectedTemplate.fields) {
          if (SKIP.has(f.referenceName)) continue;
          const val = customVals[f.referenceName];
          if (val !== undefined && val !== '') fields[f.referenceName] = f.type === 'integer' ? Number(val) : val;
        }
      }

      /* Campos customizados do projeto (detectados automaticamente via API) */
      const projectCustomRefs = new Set(bugFields.filter((f) => f.isCustomField).map((f) => f.referenceName));
      for (const ref of projectCustomRefs) {
        if (fields[ref] !== undefined) continue; /* já preenchido pelo template */
        const val = customVals[ref];
        if (val !== undefined && val !== '') fields[ref] = val;
      }

      /* 3. Criar work item */
      const workItemId = await createWorkItem(apiCfg, workItemType, fields);

      /* 4. Vincular anexos */
      if (attachUrls.length > 0) {
        setStatus('Vinculando anexos…');
        for (const url of attachUrls) await linkAttachment(apiCfg, workItemId, url).catch(() => {});
      }

      /* 5. Comentário automático */
      await addComment(apiCfg, workItemId, 'Registrado via QA Reporter.').catch(() => {});

      const updated: Defect = {
        ...defect,
        status: defect.status === 'pending_azure' ? 'open' : defect.status,
        azureWorkItemId: workItemId,
        azureConfigId: configId,
        azureTemplateId: templateId || null,
        azureState: azureState || 'New',
        azureSyncedAt: new Date().toISOString(),
        externalKey: defect.externalKey || `#${workItemId}`,
        azureCustomFields: { ...defect.azureCustomFields, ...customVals, 'System.AreaPath': areaPath, 'System.IterationPath': iterPath },
      };

      showToast(`Bug criado no Azure: #${workItemId}`, 'success');
      onSent(updated);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const match = raw.match(/Azure \d+: (\{.+)/s);
      if (match) {
        try {
          const body = JSON.parse(match[1]);
          const errs: { fieldReferenceName: string }[] = body?.customProperties?.RuleValidationErrors ?? [];
          if (errs.length > 0) {
            const names = errs.map((r) => {
              const bf = bugFields.find((f) => f.referenceName === r.fieldReferenceName);
              return bf ? `${bf.name} (${r.fieldReferenceName})` : r.fieldReferenceName;
            }).join(', ');
            showToast(`Campos obrigatórios não preenchidos: ${names}`, 'error');
            setSending(false); setStatus('');
            return;
          }
        } catch { /* segue */ }
      }
      showToast(`Erro: ${raw}`, 'error');
    }
    setSending(false); setStatus('');
  };

  return (
    <Modal large title={`Enviar ao Azure: ${defect.title}`} onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={sending}>Cancelar</button>
        <button className="btn btn-primary" onClick={send} disabled={sending}>
          {sending ? (status || 'Enviando…') : '↑ Enviar ao Azure'}
        </button>
      </>
    }>
      {/* Conexão + Tipo + Template */}
      <div className="form-row">
        <div className="form-group">
          <label>Conexão Azure *</label>
          <select value={configId} onChange={(e) => setConfigId(e.target.value)}>
            {azureConfigs.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.organization}/{c.project}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Tipo de Card *</label>
          <select value={workItemType} onChange={(e) => setWorkItemType(e.target.value)} disabled={loadingMeta}>
            {workItemTypes.length > 0
              ? workItemTypes.map((t) => <option key={t} value={t}>{t}</option>)
              : <option value={workItemType}>{workItemType}</option>
            }
          </select>
        </div>
      </div>
      <div className="form-group">
        <label>Template</label>
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">Sem template</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {/* PAT */}
      <div className="form-group">
        <label>Seu PAT</label>
        <div className="uf-password-wrap">
          <input type={showPat ? 'text' : 'password'} autoComplete="off" value={pat} onChange={(e) => setPat(e.target.value)} placeholder="Personal Access Token" />
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowPat((s) => !s)}>{showPat ? 'Ocultar' : 'Mostrar'}</button>
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={loadMeta} disabled={loadingMeta}>
          {loadingMeta ? 'Carregando…' : '↓ Carregar Estados, Áreas, Iterações e Usuários'}
        </button>
      </div>

      {/* Campos principais do Azure */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
        <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)' }}>CAMPOS AZURE</p>
        <div className="form-row">
          <div className="form-group">
            <label>Estado</label>
            {states.length > 0 ? (
              <select value={azureState} onChange={(e) => setAzureState(e.target.value)}>
                {states.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <input type="text" autoComplete="off" value={azureState} onChange={(e) => setAzureState(e.target.value)} placeholder="New" />
            )}
          </div>
          <div className="form-group">
            <label>Motivo (Reason)</label>
            <input type="text" autoComplete="off" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="New" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Área</label>
            {areas.length > 0 ? (
              <select value={areaPath} onChange={(e) => setAreaPath(e.target.value)}>
                <option value="">Padrão</option>
                {areas.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            ) : (
              <input type="text" autoComplete="off" value={areaPath} onChange={(e) => setAreaPath(e.target.value)} placeholder="Projeto\Área" />
            )}
          </div>
          <div className="form-group">
            <label>Iteração</label>
            {iterations.length > 0 ? (
              <select value={iterPath} onChange={(e) => setIterPath(e.target.value)}>
                <option value="">Padrão</option>
                {iterations.map((it) => <option key={it} value={it}>{it}</option>)}
              </select>
            ) : (
              <input type="text" autoComplete="off" value={iterPath} onChange={(e) => setIterPath(e.target.value)} placeholder="Projeto\Iteração" />
            )}
          </div>
        </div>
        <div className="form-group">
          <label>Responsável (Owner)</label>
          <input type="text" autoComplete="off" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Ex.: João Silva" />
        </div>
      </div>

      {/* Repro Steps */}
      <div className="form-group">
        <label>Repro Steps <span className="form-label-opt">(enviado como HTML)</span></label>
        <textarea rows={5} value={reproSteps} onChange={(e) => setReproSteps(e.target.value)} placeholder={'1. Acesse a tela X\n2. Clique em Y\n3. Observe o erro'} />
        {defect.evidence.length > 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {defect.evidence.length} evidência{defect.evidence.length > 1 ? 's' : ''} serão enviadas e inseridas nos Repro Steps.
          </p>
        )}
      </div>

      {/* Campos customizados do PROJETO (detectados automaticamente) */}
      {bugFields.filter((f) => f.isCustomField).length > 0 && (() => {
        const templateRefs = new Set(selectedTemplate?.fields.map((f) => f.referenceName) ?? []);
        const autoFields = bugFields.filter((f) => f.isCustomField && !templateRefs.has(f.referenceName));
        if (autoFields.length === 0) return null;
        return (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>CAMPOS DO PROJETO (Azure)</p>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
              Campos customizados detectados automaticamente no projeto Azure. Preencha os obrigatórios antes de enviar.
            </p>
            {autoFields.map((f) => (
              <div className="form-group" key={f.referenceName}>
                <label>
                  {f.name}
                  <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{f.referenceName}</span>
                </label>
                {f.allowedValues.length > 0 ? (
                  <select value={customVals[f.referenceName] ?? ''} onChange={(e) => setCV(f.referenceName, e.target.value)}>
                    <option value="">Selecione…</option>
                    {f.allowedValues.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type="text" autoComplete="off" value={customVals[f.referenceName] ?? ''} onChange={(e) => setCV(f.referenceName, e.target.value)} placeholder={f.name} />
                )}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Campos customizados do template */}
      {selectedTemplate && selectedTemplate.fields.filter((f) =>
        !['System.State', 'System.Reason', 'System.AreaPath', 'System.IterationPath', 'System.AssignedTo', 'Microsoft.VSTS.TCM.ReproSteps'].includes(f.referenceName)
      ).length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)' }}>
            CAMPOS CUSTOMIZADOS — {selectedTemplate.name}
          </p>
          {selectedTemplate.fields
            .filter((f) => !['System.State', 'System.Reason', 'System.AreaPath', 'System.IterationPath', 'System.AssignedTo', 'Microsoft.VSTS.TCM.ReproSteps'].includes(f.referenceName))
            .map((f) => (
              <div className="form-group" key={f.referenceName}>
                <label>{f.label}{f.required && ' *'}</label>
                {f.type === 'dropdown' ? (
                  <select value={customVals[f.referenceName] ?? ''} onChange={(e) => setCV(f.referenceName, e.target.value)}>
                    <option value="">{f.defaultValue || 'Selecione…'}</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea rows={3} value={customVals[f.referenceName] ?? ''} onChange={(e) => setCV(f.referenceName, e.target.value)} placeholder={f.defaultValue} />
                ) : f.type === 'integer' ? (
                  <input type="number" value={customVals[f.referenceName] ?? ''} onChange={(e) => setCV(f.referenceName, e.target.value)} placeholder={f.defaultValue} />
                ) : (
                  <input type="text" autoComplete="off" value={customVals[f.referenceName] ?? ''} onChange={(e) => setCV(f.referenceName, e.target.value)} placeholder={f.defaultValue} />
                )}
              </div>
            ))}
        </div>
      )}
    </Modal>
  );
}

/* ── Modal: Importar bugs existentes do Azure DevOps ── */
function mapAzureSeverity(sev: string | null): DefectSeverity {
  const s = (sev ?? '').toLowerCase();
  if (s.includes('critical')) return 'critical';
  if (s.includes('high')) return 'high';
  if (s.includes('low')) return 'low';
  return 'medium';
}

/* Cor do badge a partir do estado do Azure (semântico + fallback determinístico). */
function azureStateStyle(state: string) {
  const s = state.toLowerCase();
  const pick = (hex: string) => ({ color: hex, background: hex + '22', border: `1px solid ${hex}55` });
  if (/(done|closed|complet|conclu|fechad)/.test(s)) return pick('#10b981');      /* verde */
  if (/resolv/.test(s)) return pick('#14b8a6');                                    /* teal */
  if (/(release|deploy|stg|staging|\bprod|homolog|publish|merge)/.test(s)) return pick('#8b5cf6'); /* roxo */
  if (/(progress|doing|active|develop|andamento|\bwip\b|coding)/.test(s)) return pick('#3b82f6');  /* azul */
  if (/(test|\bqa\b|review|valida|verif|homol)/.test(s)) return pick('#f59e0b');   /* âmbar */
  if (/(block|impediment|bloque|hold|reopen)/.test(s)) return pick('#ef4444');     /* vermelho */
  if (/(new|to ?do|backlog|propos|\bopen\b|abert|approv|ready)/.test(s)) return pick('#94a3b8'); /* cinza */
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return { color: `hsl(${h},60%,62%)`, background: `hsla(${h},60%,50%,0.15)`, border: `1px solid hsla(${h},60%,50%,0.38)` };
}

/* Estado do Azure → status local do defeito. */
function mapAzureStateToStatus(state: string | null): DefectStatus {
  const s = (state ?? '').toLowerCase();
  if (!s) return 'open';
  if (/(closed|done|removed|completed|fechad|conclu)/.test(s)) return 'closed';
  if (/(resolved|resolvid)/.test(s)) return 'resolved';
  if (/(progress|active|doing|committed|andamento|develop)/.test(s)) return 'in_progress';
  return 'open';
}

function ImportFromAzureModal({ kind, projectId, azureConfigs, myPat, plans, cards, existingAzureIds, onClose, onImported }: {
  kind: DefectKind;
  projectId: string;
  azureConfigs: AzureConfig[]; myPat: string;
  plans: TestPlan[]; cards: Card[];
  existingAzureIds: Set<number>;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const isBug = kind === 'bug';
  const itemWord = isBug ? 'bug' : 'item';
  const itemWordPl = isBug ? 'bugs' : 'itens';
  const [configId, setConfigId] = useState(azureConfigs[0]?.id ?? '');
  const [typeFilter, setTypeFilter] = useState(''); /* '' = todos os tipos (só melhoria) */
  const [wiTypes, setWiTypes] = useState<string[]>([]);
  const [mode, setMode] = useState<'card' | 'all'>('card');
  const [cardIdInput, setCardIdInput] = useState('');
  const [planId, setPlanId] = useState('');
  const [bugs, setBugs] = useState<AzureWorkItemSummary[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [loaded, setLoaded] = useState(false);

  const cfg = azureConfigs.find((c) => c.id === configId);
  const apiCfg = cfg && myPat ? { organization: cfg.organization, project: cfg.project, pat: myPat } : null;
  const plan = planId ? plans.find((p) => p.id === planId) : null;
  const planCardId = plan?.cardId ?? null;
  const cardByAzureId = useMemo(() => new Map(cards.filter((c) => c.azureId != null).map((c) => [c.azureId as number, c.id])), [cards]);

  /* Aceita múltiplos IDs separados por vírgula/espaço: "13145, 14750". */
  const cardIds = cardIdInput.split(/[\s,]+/).map((s) => parseInt(s, 10)).filter((n) => n > 0);
  /* Tipos a buscar:
     - Bug: todos os tipos "bug-like" do projeto (Bug, sub_bug, Sub-Bug…) detectados; fallback fixo.
     - Melhoria: o tipo escolhido no filtro (vazio = todos os tipos). */
  const bugTypes = wiTypes.length ? wiTypes.filter((t) => /bug/i.test(t)) : [];
  const onlyTypes = isBug
    ? (bugTypes.length ? bugTypes : BUG_WORK_ITEM_TYPES)
    : (typeFilter ? [typeFilter] : undefined);

  /* Carrega os tipos de work item do projeto (para o filtro da Melhoria e p/ detectar os tipos de bug). */
  useEffect(() => {
    if (!apiCfg) { setWiTypes([]); return; }
    let cancelled = false;
    fetchWorkItemTypes(apiCfg).then((ts) => { if (!cancelled) setWiTypes(ts); }).catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configId, myPat]);

  const load = async () => {
    if (!apiCfg) return;
    if (mode === 'card' && cardIds.length === 0) { showToast('Informe ao menos um ID.', 'warning'); return; }
    setLoading(true); setLoaded(false);
    try {
      const list = mode === 'card'
        ? await fetchWorkItemsByCardIds(apiCfg, cardIds, { onlyTypes })
        : await fetchWorkItemsFromAzure(apiCfg, { onlyTypes });
      setBugs(list);
      /* Pré-seleciona apenas os que ainda não existem localmente */
      setSelected(new Set(list.filter((b) => !existingAzureIds.has(b.id)).map((b) => b.id)));
      setLoaded(true);
    } catch (e) {
      showToast(`Erro ao buscar ${itemWordPl} do Azure: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bugs;
    return bugs.filter((b) => `#${b.id} ${b.title}`.toLowerCase().includes(q));
  }, [bugs, search]);

  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const importableSelected = [...selected].filter((id) => !existingAzureIds.has(id));

  const doImport = async () => {
    if (!apiCfg || importableSelected.length === 0) return;
    setSaving(true);
    const now = new Date().toISOString();
    /* Card local do ID informado no modo "por card" (se existir localmente) */
    const enteredCardLocalId = mode === 'card' && cardIds.length === 1 ? cardByAzureId.get(cardIds[0]) ?? null : null;
    const toImport = bugs.filter((b) => selected.has(b.id) && !existingAzureIds.has(b.id));

    /* Re-hospeda as imagens de um HTML do Azure no Supabase, mantendo-as inline. */
    const rehostHtml = async (folderId: string, html: string): Promise<string> => {
      let out = html;
      for (const { raw, url } of extractImgTags(html)) {
        try {
          const blob = await downloadAttachment(apiCfg, url);
          const file = new File([blob], attachmentNameFromUrl(url), { type: blob.type || 'image/png' });
          const ev = await uploadEvidence(folderId, file);
          if (ev) out = out.split(raw).join(ev.url);
        } catch { /* mantém a imagem original se falhar */ }
      }
      return out;
    };

    let count = 0;
    for (let i = 0; i < toImport.length; i++) {
      const bug = toImport[i];
      const cardId = planCardId ?? enteredCardLocalId ?? (bug.parentId != null ? cardByAzureId.get(bug.parentId) ?? null : null);
      const defectId = genId();

      /* Descrição como HTML, com as imagens junto ao texto (re-hospedadas). */
      setStatus(`Importando ${i + 1}/${toImport.length} — imagens do #${bug.id}…`);
      const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
      const descTxt = norm(bug.description);
      const reproTxt = norm(bug.reproSteps);
      /* Muitos bugs repetem o mesmo conteúdo em Description e Repro Steps — evita duplicar. */
      const reproIsDup = !reproTxt || reproTxt === descTxt || (descTxt && descTxt.includes(reproTxt));
      const parts: string[] = [];
      if (bug.descriptionHtml.trim()) parts.push(await rehostHtml(defectId, bug.descriptionHtml));
      if (bug.reproStepsHtml.trim() && !reproIsDup) parts.push(`<p><strong>Passos para reproduzir</strong></p>${await rehostHtml(defectId, bug.reproStepsHtml)}`);
      const description = parts.join('<br/>') || bug.description || bug.reproSteps || '';

      const defect: Defect = {
        id: defectId, projectId, kind, runResultId: null, cardId, planId: planId || null,
        title: bug.title || `${bug.workItemType || 'Item'} #${bug.id}`,
        description,
        severity: mapAzureSeverity(bug.severity),
        status: mapAzureStateToStatus(bug.state),
        externalKey: `#${bug.id}`,
        createdBy: currentUserId(), createdAt: now, evidence: [],
        azureWorkItemId: bug.id, azureConfigId: configId, azureTemplateId: null,
        azureState: bug.state, azureSyncedAt: now, azureCustomFields: bug.workItemType ? { _azureType: bug.workItemType } : {},
      };
      if (await saveDefect(defect)) count++;
    }
    setSaving(false); setStatus('');
    if (count > 0) showToast(`${count} ${count > 1 ? itemWordPl : itemWord} importado${count > 1 ? 's' : ''} do Azure.`, 'success');
    else showToast(`Nenhum ${itemWord} importado.`, 'warning');
    onImported(count);
  };

  return (
    <Modal large title={`Importar ${itemWordPl} do Azure DevOps`} onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary" onClick={doImport} disabled={saving || importableSelected.length === 0}>
          {saving ? (status || 'Importando…') : `Importar ${importableSelected.length} ${importableSelected.length === 1 ? itemWord : itemWordPl}`}
        </button>
      </>
    }>
      <div className="form-row">
        <div className="form-group">
          <label>Conexão Azure *</label>
          <select value={configId} onChange={(e) => { setConfigId(e.target.value); setBugs([]); setLoaded(false); }}>
            {azureConfigs.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.organization}/{c.project}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Vincular ao Plano de Teste <span className="form-label-opt">(opcional)</span></label>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">Sem vínculo</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {plan && (
            planCardId
              ? <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Os {itemWordPl} serão amarrados ao plano e ao card {(() => { const c = cards.find((x) => x.id === planCardId); return c?.azureId ? `#${c.azureId}` : c?.title ?? ''; })()}.</p>
              : <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Este plano não tem card vinculado — os {itemWordPl} serão amarrados apenas ao plano.</p>
          )}
        </div>
      </div>

      {!isBug && (
        <div className="form-group">
          <label>Tipo de card <span className="form-label-opt">(opcional)</span></label>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setLoaded(false); }}>
            <option value="">Todos os tipos</option>
            {wiTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Escolha um tipo para retornar só esses cards; deixe em "Todos" para trazer qualquer tipo.</p>
        </div>
      )}

      {/* Modo de busca: por ID do card ou todos os itens abertos */}
      <div className="form-group">
        <label>Como buscar</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {([['card', 'Pelo ID do card'], ['all', `Todos os ${itemWordPl} abertos`]] as const).map(([m, lbl]) => {
            const active = mode === m;
            return (
              <button key={m} type="button" onClick={() => { setMode(m); setBugs([]); setLoaded(false); }}
                style={{ flex: 1, padding: '8px', borderRadius: 8, border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--bg-hover)' : 'var(--bg-input)', color: active ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: active ? 700 : 400, cursor: 'pointer', fontSize: 13 }}>
                {lbl}
              </button>
            );
          })}
        </div>
      </div>

      {mode === 'card' && (
        <div className="form-group">
          <label>ID(s) do card ou do bug *</label>
          <input type="text" inputMode="numeric" autoComplete="off" value={cardIdInput}
            onChange={(e) => { setCardIdInput(e.target.value.replace(/[^\d,\s]/g, '')); setLoaded(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !loading) load(); }}
            placeholder="Ex.: 13145, 14750" />
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            Informe um ou mais IDs separados por vírgula. Pode ser ID de card (traz os {itemWordPl} vinculados) ou de um item específico.
            {cardIds.length > 1 && <strong> ({cardIds.length} IDs)</strong>}
          </p>
        </div>
      )}

      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={load} disabled={loading || !apiCfg || (mode === 'card' && cardIds.length === 0)}>
        {loading ? 'Buscando…' : loaded ? '↻ Recarregar' : mode === 'card' ? `↓ Buscar ${itemWordPl} do card` : `↓ Buscar ${itemWordPl} abertos`}
      </button>

      {loaded && (
        <>
          <div className="casos-search-wrap" style={{ marginBottom: 10 }}>
            <IconSearch className="casos-search-icon" />
            <input className="casos-search" placeholder="Filtrar por ID ou título…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {bugs.length === 0 ? (
            <p className="tests-muted">{mode === 'card' ? `Nenhum ${itemWord} vinculado a esse ID (verifique se é o ID do card no Azure).` : `Nenhum ${itemWord} aberto encontrado no projeto Azure.`}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
              {filtered.map((b) => {
                const already = existingAzureIds.has(b.id);
                const checked = selected.has(b.id);
                return (
                  <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', cursor: already ? 'default' : 'pointer', opacity: already ? 0.55 : 1 }}>
                    <input type="checkbox" checked={checked} disabled={already} onChange={() => toggle(b.id)} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', flexShrink: 0 }}>#{b.id}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                    {b.workItemType && (!isBug || b.workItemType.toLowerCase() !== 'bug') && <span className="casos-tag" style={{ fontSize: 10 }} title="Tipo no Azure">{b.workItemType}</span>}
                    {b.parentId != null && <span className="casos-tag" style={{ fontSize: 10 }} title="Card pai no Azure">US #{b.parentId}</span>}
                    {b.state && <span className="casos-tag" style={{ fontSize: 10 }}>{b.state}</span>}
                    {already && <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>já importado</span>}
                  </label>
                );
              })}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function isImage(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url);
}

function clone(d: Defect): Defect { return JSON.parse(JSON.stringify(d)); }
