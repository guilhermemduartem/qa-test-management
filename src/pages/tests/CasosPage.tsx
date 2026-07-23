/* ═══════════════════════════════════════════════════════════
   CasosPage — Casos de Teste.
   Árvore Projeto → Suítes (esquerda, expansível) + tabela com
   busca/filtros (direita).

   Fluxo separado em 3 etapas (foco usabilidade beta):
     • Visualizar  → modal somente-leitura (CaseDetail)
     • Criar/Editar → formulário (CaseEditor)
     • Excluir      → confirmação, só criador ou admin
   ═══════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { TestsLayout } from './TestsLayout';
import { ProjectBar } from '../../components/tests/ProjectBar';
import { Modal } from '../../components/Modal';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useUserNames } from '../../hooks/useUserNames';
import {
  IconSearch, IconPencil, IconTrash, IconHistory, IconChevron, IconFolder, IconCheck, IconPlus, IconX, IconCopy,
} from '../../components/tests/icons';
import { can } from '../../lib/auth';
import { showToast } from '../../lib/toast';
import { formatDate } from '../../lib/utils';
import {
  genId, currentUserId,
  listSuites, saveSuite, deleteSuite,
  listCases, saveCase, deleteCase, bulkUpsertCases,
  listCaseVersions, addCaseVersion, listPlans, listCards,
} from '../../lib/testManagement';
import {
  TYPE_LABEL, PRIORITY_LABEL, CASE_STATUS_LABEL,
  type TestSuite, type TestCase, type TestCaseVersion, type TestStep,
  type TestPlan, type Card, type TestType, type TestPriority, type TestCaseStatus,
} from '../../types/tests';

type SuiteFilter = 'all' | 'none' | string;
type SortKey = 'title' | 'type' | 'priority' | 'status' | 'author' | 'createdAt' | 'updatedAt';

const PRIORITY_RANK: Record<TestPriority, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const STATUS_RANK: Record<TestCaseStatus, number> = { draft: 0, active: 1, deprecated: 2 };

const HELP = (
  <>
    <strong>Como usar esta tela</strong>
    <ul>
      <li>À esquerda ficam as <b>suítes</b> (pastas). Clique numa suíte para filtrar; use a setinha para expandir e ver as sub-suítes. O número mostra o total de casos da suíte e de tudo dentro dela.</li>
      <li>Clique no <b>título</b> de um caso para <b>visualizar</b> os detalhes.</li>
      <li>Use <b>Editar</b> para alterar e <b>Excluir</b> para remover — disponíveis apenas para quem criou o caso ou um admin.</li>
      <li>O ícone de <b>histórico</b> mostra as versões anteriores (geradas a cada edição).</li>
    </ul>
  </>
);

export function CasosPage() {
  const { projects, activeId, setActiveId, reload, loading } = useActiveProject();
  const { name: userName, initials: userInitials } = useUserNames();
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [suiteSel, setSuiteSel] = useState<SuiteFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // filtros: busca global + um por coluna
  const [search, setSearch] = useState('');
  const [fStatus, setFStatus] = useState<'all' | TestCaseStatus>('all');
  const [fPriority, setFPriority] = useState<'all' | TestPriority>('all');
  const [fType, setFType] = useState<'all' | TestType>('all');
  const [colTitle, setColTitle] = useState('');
  const [colAuthor, setColAuthor] = useState('');

  const hasActiveFilters = !!(search || colTitle || colAuthor) || fType !== 'all' || fPriority !== 'all' || fStatus !== 'all';
  const clearFilters = () => {
    setSearch(''); setColTitle(''); setColAuthor('');
    setFType('all'); setFPriority('all'); setFStatus('all');
  };

  const [viewing, setViewing] = useState<TestCase | null>(null);
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; data: TestCase } | null>(null);
  const [importing, setImporting] = useState(false);
  const [versionsFor, setVersionsFor] = useState<TestCase | null>(null);
  const [confirmDel, setConfirmDel] = useState<TestCase | null>(null);
  const [suiteModal, setSuiteModal] = useState(false);
  const [suiteName, setSuiteName] = useState('');
  const [suiteParent, setSuiteParent] = useState<string>('');

  // ordenação por coluna
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortBy(null); setSortDir('asc'); } // 3º clique remove a ordenação
    } else { setSortBy(key); setSortDir('asc'); }
  };

  // seleção múltipla + ações em lote
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmBulkDel, setConfirmBulkDel] = useState(false);

  const podeCriar = can('create');
  const podeRemoverSuite = can('delete'); // suítes não têm dono → restrito a admin
  const canEditCase = (c: TestCase) => can('edit', c.createdBy ?? undefined);
  const canDelCase = (c: TestCase) => can('delete', c.createdBy ?? undefined);

  const loadData = async (projectId: string) => {
    setBusy(true);
    const [s, c, p, cr] = await Promise.all([listSuites(projectId), listCases(projectId), listPlans(projectId), listCards(projectId)]);
    setSuites(s);
    setCases(c);
    setPlans(p);
    setCards(cr);
    setBusy(false);
  };

  useEffect(() => {
    if (activeId) loadData(activeId);
    else { setSuites([]); setCases([]); }
  }, [activeId]);

  // Deep-link: abre um caso específico vindo de ?case=ID (ex.: link do Assistente).
  const [caseParams, setCaseParams] = useSearchParams();
  const caseOpenedRef = useRef(false);
  useEffect(() => {
    if (caseOpenedRef.current) return;
    const id = caseParams.get('case');
    if (!id || cases.length === 0) return;
    const c = cases.find((x) => x.id === id);
    if (c) {
      setViewing(c);
      caseOpenedRef.current = true;
      caseParams.delete('case');
      setCaseParams(caseParams, { replace: true });
    }
  }, [cases, caseParams, setCaseParams]);

  // Suítes começam RECOLHIDAS — o usuário expande clicando na setinha.

  // para cada suíte, o conjunto dela + todas as descendentes (para filtrar pelo pai)
  const suiteDescendants = useMemo(() => {
    const childrenOf = new Map<string, string[]>();
    suites.forEach((s) => {
      if (!s.parentId) return;
      if (!childrenOf.has(s.parentId)) childrenOf.set(s.parentId, []);
      childrenOf.get(s.parentId)!.push(s.id);
    });
    const map = new Map<string, Set<string>>();
    const collect = (id: string): Set<string> => {
      const cached = map.get(id);
      if (cached) return cached;
      const set = new Set<string>([id]);
      (childrenOf.get(id) || []).forEach((ch) => collect(ch).forEach((x) => set.add(x)));
      map.set(id, set);
      return set;
    };
    suites.forEach((s) => collect(s.id));
    return map;
  }, [suites]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qt = colTitle.trim().toLowerCase();
    const qa = colAuthor.trim().toLowerCase();
    return cases.filter((c) => {
      if (suiteSel === 'none' && c.suiteId) return false;
      if (suiteSel !== 'all' && suiteSel !== 'none') {
        const allowed = suiteDescendants.get(suiteSel);
        if (!c.suiteId || !allowed || !allowed.has(c.suiteId)) return false;
      }
      if (fStatus !== 'all' && c.status !== fStatus) return false;
      if (fPriority !== 'all' && c.priority !== fPriority) return false;
      if (fType !== 'all' && c.type !== fType) return false;
      if (q) {
        const hay = `${c.title} ${c.tags.join(' ')} ${c.preconditions}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (qt && !c.title.toLowerCase().includes(qt)) return false;
      if (qa && !userName(c.createdBy).toLowerCase().includes(qa)) return false;
      return true;
    });
  }, [cases, suiteSel, suiteDescendants, search, fStatus, fPriority, fType, colTitle, colAuthor, userName]);

  const sorted = useMemo(() => {
    if (!sortBy) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    const val = (c: TestCase): string | number => {
      switch (sortBy) {
        case 'title': return c.title.toLowerCase();
        case 'type': return TYPE_LABEL[c.type].toLowerCase();
        case 'priority': return PRIORITY_RANK[c.priority];
        case 'status': return STATUS_RANK[c.status];
        case 'author': return userName(c.createdBy).toLowerCase();
        case 'createdAt': return c.createdAt || '';
        case 'updatedAt': return c.updatedAt || c.createdAt || '';
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    });
  }, [filtered, sortBy, sortDir, userName]);

  /* ── Seleção múltipla ── */
  const allVisibleSelected = sorted.length > 0 && sorted.every((c) => selected.has(c.id));
  const selectedCases = useMemo(() => cases.filter((c) => selected.has(c.id)), [cases, selected]);
  const toggleSelect = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleSelectAll = () => setSelected((prev) => {
    const next = new Set(prev);
    if (sorted.length > 0 && sorted.every((c) => prev.has(c.id))) sorted.forEach((c) => next.delete(c.id));
    else sorted.forEach((c) => next.add(c.id));
    return next;
  });
  const clearSelection = () => setSelected(new Set());
  // Troca de projeto/suíte limpa a seleção para não agir sobre casos ocultos.
  useEffect(() => { setSelected(new Set()); }, [activeId, suiteSel]);

  /* ── Ações em lote ── */
  const applyBulkEdit = async (changes: Partial<Pick<TestCase, 'suiteId' | 'type' | 'priority' | 'status'>>) => {
    const editable = selectedCases.filter(canEditCase);
    if (editable.length === 0) { showToast('Nenhum caso selecionado que você possa editar.', 'warning'); return; }
    const now = new Date().toISOString();
    for (const c of editable) await addCaseVersion(c.id, snapshot(c));
    const rows = editable.map((c) => ({ ...c, ...changes, updatedAt: now }));
    if (!(await bulkUpsertCases(rows))) { showToast('Falha ao salvar em lote.', 'error'); return; }
    const skipped = selectedCases.length - editable.length;
    showToast(`${editable.length} caso(s) atualizado(s)${skipped ? ` · ${skipped} sem permissão ignorado(s)` : ''}.`, 'success');
    setBulkOpen(false); clearSelection();
    if (activeId) loadData(activeId);
  };

  const applyBulkDelete = async () => {
    const deletable = selectedCases.filter(canDelCase);
    if (deletable.length === 0) { showToast('Nenhum caso selecionado que você possa excluir.', 'warning'); return; }
    const results = await Promise.all(deletable.map((c) => deleteCase(c.id)));
    const okCount = results.filter(Boolean).length;
    const skipped = selectedCases.length - deletable.length;
    showToast(`${okCount} caso(s) excluído(s)${skipped ? ` · ${skipped} sem permissão ignorado(s)` : ''}.`, 'success');
    setConfirmBulkDel(false); clearSelection();
    if (activeId) loadData(activeId);
  };

  /* ── Clonar: abre o editor em modo "novo" com tudo preenchido, menos o título ── */
  const clonarCaso = (c: TestCase) => {
    const dup = clone(c);
    dup.id = genId();
    dup.title = '';
    dup.createdBy = currentUserId();
    dup.createdAt = new Date().toISOString();
    dup.updatedAt = null;
    setViewing(null);
    setEditor({ mode: 'create', data: dup });
  };

  const suiteTree = useMemo(() => buildTree(suites), [suites]);
  const suiteNameOf = (id: string | null) => suites.find((s) => s.id === id)?.name ?? null;

  // total de casos por suíte INCLUINDO todas as sub-suítes (agregado)
  const aggCount = useMemo(() => {
    const direct = new Map<string, number>();
    cases.forEach((c) => { if (c.suiteId) direct.set(c.suiteId, (direct.get(c.suiteId) || 0) + 1); });
    const childrenOf = new Map<string | null, TestSuite[]>();
    suites.forEach((s) => {
      const k = s.parentId;
      if (!childrenOf.has(k)) childrenOf.set(k, []);
      childrenOf.get(k)!.push(s);
    });
    const agg = new Map<string, number>();
    const compute = (id: string): number => {
      let total = direct.get(id) || 0;
      (childrenOf.get(id) || []).forEach((ch) => { total += compute(ch.id); });
      agg.set(id, total);
      return total;
    };
    suites.forEach((s) => { if (!agg.has(s.id)) compute(s.id); });
    return agg;
  }, [cases, suites]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const novoCaso = (): TestCase => ({
    id: genId(), suiteId: suiteSel !== 'all' && suiteSel !== 'none' ? suiteSel : null,
    projectId: activeId!, planId: null, title: '', type: 'manual', priority: 'medium', status: 'draft',
    preconditions: '', steps: [{ action: '', expected: '' }], expectedResult: '', tags: [],
    customFields: {}, createdBy: currentUserId(), createdAt: new Date().toISOString(), updatedAt: null,
  });

  const onSaved = async (c: TestCase, isEdit: boolean) => {
    if (isEdit) {
      const original = cases.find((x) => x.id === c.id);
      if (original) await addCaseVersion(c.id, snapshot(original));
      c.updatedAt = new Date().toISOString();
    }
    const ok = await saveCase(c);
    if (!ok) return;
    showToast(isEdit ? 'Caso atualizado.' : 'Caso criado.', 'success');
    setEditor(null);
    if (activeId) loadData(activeId);
  };

  const criarSuite = async () => {
    if (!suiteName.trim() || !activeId) { showToast('Informe o nome da suíte.', 'warning'); return; }
    const s: TestSuite = {
      id: genId(), projectId: activeId, parentId: suiteParent || null,
      name: suiteName.trim(), order: suites.length, createdAt: new Date().toISOString(),
    };
    if (!(await saveSuite(s))) return;
    showToast('Suíte criada.', 'success');
    setSuiteModal(false); setSuiteName(''); setSuiteParent('');
    loadData(activeId);
  };

  const removerSuite = async (s: TestSuite) => {
    if (!activeId) return;
    if (!(await deleteSuite(s.id))) return;
    showToast('Suíte removida.', 'success');
    if (suiteSel === s.id) setSuiteSel('all');
    loadData(activeId);
  };

  const actions = (
    <ProjectBar projects={projects} activeId={activeId} onChange={setActiveId} onCreated={reload} />
  );

  const SortTh = ({ k, children, className }: { k: SortKey; children: ReactNode; className?: string }) => (
    <th
      className={`casos-th-sort${sortBy === k ? ' sorted' : ''}${className ? ' ' + className : ''}`}
      onClick={() => toggleSort(k)}
      title="Ordenar por esta coluna"
    >
      {children}
      <span className="casos-sort-ind">{sortBy === k ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </th>
  );

  return (
    <TestsLayout title="Casos de Teste" activeTest="casos" actions={actions} help={HELP} fluid loading={loading || busy}>
      {!activeId ? (
        <div className="tests-scroll"><div className="tests-empty"><h2>Selecione um projeto</h2><p>Crie ou escolha um projeto no seletor acima.</p></div></div>
      ) : (
        <>
          {/* Árvore de suítes */}
          <aside className="casos-tree">
            <div className="casos-tree-head">
              <span>Suítes</span>
              {podeCriar && <button className="btn btn-primary btn-xs" onClick={() => setSuiteModal(true)} title="Criar nova suíte">+ Suíte</button>}
            </div>
            <button className={`casos-tree-item${suiteSel === 'all' ? ' active' : ''}`} onClick={() => setSuiteSel('all')}>
              <span className="casos-tree-toggle-spacer" />
              <span className="casos-tree-label-text">Todos os casos</span>
              <span className="casos-count">{cases.length}</span>
            </button>
            <button className={`casos-tree-item${suiteSel === 'none' ? ' active' : ''}`} onClick={() => setSuiteSel('none')}>
              <span className="casos-tree-toggle-spacer" />
              <span className="casos-tree-label-text">Sem suíte</span>
              <span className="casos-count">{cases.filter((c) => !c.suiteId).length}</span>
            </button>
            <div className="casos-tree-divider" />
            {suiteTree.map((node) => (
              <SuiteNode
                key={node.suite.id} node={node} depth={0} selected={suiteSel}
                aggCount={aggCount} expanded={expanded} onToggle={toggleExpand}
                onSelect={(id) => { setSuiteSel(id); setExpanded((p) => new Set(p).add(id)); }}
                onDelete={podeRemoverSuite ? removerSuite : undefined}
              />
            ))}
            {suites.length === 0 && <p className="tests-muted" style={{ padding: '8px 4px' }}>Nenhuma suíte.</p>}
          </aside>

          {/* Tabela de casos */}
          <section className="casos-main">
            <div className="casos-searchblock">
              <div className="casos-searchblock-top">
                <div className="casos-search-wrap">
                  <IconSearch className="casos-search-icon" />
                  <input className="casos-search" placeholder="Buscar casos por título, tag ou pré-condição…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  {search && <button className="casos-search-clear" onClick={() => setSearch('')} title="Limpar busca" aria-label="Limpar busca"><IconX /></button>}
                </div>
                {podeCriar && <button className="btn btn-ghost btn-sm casos-new-btn" onClick={() => setImporting(true)}><IconPlus /> Importar Excel</button>}
                {podeCriar && <button className="btn btn-primary btn-sm casos-new-btn" onClick={() => setEditor({ mode: 'create', data: novoCaso() })}><IconPlus /> Novo Caso</button>}
              </div>
              <div className="casos-filtergrid">
                <div className="filter-field">
                  <label>Título</label>
                  <input className="col-filter" placeholder="Filtrar…" value={colTitle} onChange={(e) => setColTitle(e.target.value)} />
                </div>
                <div className="filter-field">
                  <label>Tipo</label>
                  <select className="col-filter" value={fType} onChange={(e) => setFType(e.target.value as typeof fType)}>
                    <option value="all">Todos</option>
                    {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="filter-field">
                  <label>Prioridade</label>
                  <select className="col-filter" value={fPriority} onChange={(e) => setFPriority(e.target.value as typeof fPriority)}>
                    <option value="all">Todas</option>
                    {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="filter-field">
                  <label>Status</label>
                  <select className="col-filter" value={fStatus} onChange={(e) => setFStatus(e.target.value as typeof fStatus)}>
                    <option value="all">Todos</option>
                    {Object.entries(CASE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="filter-field">
                  <label>Criado por</label>
                  <input className="col-filter" placeholder="Filtrar…" value={colAuthor} onChange={(e) => setColAuthor(e.target.value)} />
                </div>
              </div>
              {hasActiveFilters && (
                <div className="casos-filtergrid-footer">
                  <button className="btn btn-ghost btn-sm" onClick={clearFilters} title="Limpar busca e filtros"><IconX /> Limpar filtros</button>
                </div>
              )}
            </div>

            {selected.size > 0 && (
              <div className="casos-bulkbar">
                <span className="casos-bulkbar-count"><IconCheck /> {selected.size} selecionado(s)</span>
                {podeCriar && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setBulkOpen(true)}><IconPencil /> Editar em lote</button>
                )}
                {can('delete') && (
                  <button className="btn btn-ghost btn-sm danger" onClick={() => setConfirmBulkDel(true)}><IconTrash /> Excluir selecionados</button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={clearSelection}><IconX /> Limpar seleção</button>
              </div>
            )}

            <div className="casos-table-wrap">
              {busy ? (
                <p className="tests-muted">Carregando…</p>
              ) : filtered.length === 0 ? (
                <div className="tests-empty"><h2>Nenhum caso</h2><p>{cases.length === 0 ? 'Crie o primeiro caso de teste.' : 'Nenhum caso corresponde aos filtros.'}</p></div>
              ) : (
                <table className="tests-table">
                  <thead>
                    <tr>
                      <th className="casos-check-col">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          ref={(el) => { if (el) el.indeterminate = !allVisibleSelected && sorted.some((c) => selected.has(c.id)); }}
                          onChange={toggleSelectAll}
                          title="Selecionar todos os visíveis"
                          aria-label="Selecionar todos os visíveis"
                        />
                      </th>
                      <SortTh k="title">Título</SortTh>
                      <SortTh k="type">Tipo</SortTh>
                      <SortTh k="priority">Prioridade</SortTh>
                      <SortTh k="status">Status</SortTh>
                      <SortTh k="author">Criado por</SortTh>
                      <SortTh k="createdAt">Criado em</SortTh>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((c) => (
                      <tr key={c.id} className={selected.has(c.id) ? 'casos-row-selected' : undefined}>
                        <td className="casos-check-col">
                          <input
                            type="checkbox"
                            checked={selected.has(c.id)}
                            onChange={() => toggleSelect(c.id)}
                            aria-label={`Selecionar ${c.title || 'caso'}`}
                          />
                        </td>
                        <td>
                          <button className="casos-link" onClick={() => setViewing(c)} title="Ver detalhes">{c.title || '(sem título)'}</button>
                          {c.tags.length > 0 && <div className="casos-tags">{c.tags.map((t) => <span key={t} className="casos-tag">{t}</span>)}</div>}
                        </td>
                        <td>{TYPE_LABEL[c.type]}</td>
                        <td><span className={`tests-chip prio-${c.priority}`}>{PRIORITY_LABEL[c.priority]}</span></td>
                        <td><span className={`tests-badge case-${c.status}`}>{CASE_STATUS_LABEL[c.status]}</span></td>
                        <td><span className="tests-author"><span className="tests-author-dot" aria-hidden>•</span>{userName(c.createdBy)}</span></td>
                        <td className="tests-muted-cell">{formatDate(c.createdAt)}</td>
                        <td className="casos-actions-cell">
                          <div className="casos-rowactions">
                            <button className="tests-iconbtn" onClick={() => setVersionsFor(c)} title="Histórico de versões" aria-label="Histórico de versões"><IconHistory /></button>
                            {podeCriar && <button className="tests-iconbtn" onClick={() => clonarCaso(c)} title="Clonar caso (cria um novo a partir deste)" aria-label="Clonar caso"><IconCopy /></button>}
                            {canEditCase(c) && <button className="tests-iconbtn" onClick={() => setEditor({ mode: 'edit', data: clone(c) })} title="Editar caso" aria-label="Editar caso"><IconPencil /></button>}
                            {canDelCase(c) && <button className="tests-iconbtn danger" onClick={() => setConfirmDel(c)} title="Excluir caso" aria-label="Excluir caso"><IconTrash /></button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}

      {/* Visualização (somente leitura) */}
      {viewing && (
        <CaseDetail
          caso={viewing}
          suiteName={suiteNameOf(viewing.suiteId)}
          authorName={userName(viewing.createdBy)}
          authorInitials={userInitials(viewing.createdBy)}
          canEdit={canEditCase(viewing)}
          canDelete={canDelCase(viewing)}
          onEdit={() => { setEditor({ mode: 'edit', data: clone(viewing) }); setViewing(null); }}
          onDelete={() => { setConfirmDel(viewing); setViewing(null); }}
          onHistory={() => { setVersionsFor(viewing); setViewing(null); }}
          onClose={() => setViewing(null)}
        />
      )}

      {editor && (
        <CaseEditor
          mode={editor.mode} initial={editor.data} suites={suites} plans={plans} cards={cards}
          onClose={() => setEditor(null)} onSave={onSaved}
        />
      )}
      {importing && activeId && (
        <ImportCasesModal
          projectId={activeId}
          suites={suites}
          existing={cases}
          defaultSuiteId={suiteSel !== 'all' && suiteSel !== 'none' ? suiteSel : ''}
          onClose={() => setImporting(false)}
          onDone={() => { setImporting(false); loadData(activeId); }}
        />
      )}
      {versionsFor && <VersionsModal caso={versionsFor} onClose={() => setVersionsFor(null)} />}
      {confirmDel && (
        <Modal title="Excluir caso" onClose={() => setConfirmDel(null)} footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Cancelar</button>
            <button className="btn btn-danger" onClick={async () => {
              if (await deleteCase(confirmDel.id)) { showToast('Caso excluído.', 'success'); if (activeId) loadData(activeId); }
              setConfirmDel(null);
            }}>Excluir</button>
          </>
        }>
          <p style={{ color: 'var(--text-secondary)' }}>Excluir <strong style={{ color: 'var(--text-primary)' }}>{confirmDel.title}</strong>? Esta ação não pode ser desfeita.</p>
        </Modal>
      )}
      {bulkOpen && (
        <BulkEditModal count={selectedCases.length} suites={suites} onClose={() => setBulkOpen(false)} onApply={applyBulkEdit} />
      )}
      {confirmBulkDel && (
        <Modal title="Excluir selecionados" onClose={() => setConfirmBulkDel(false)} footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmBulkDel(false)}>Cancelar</button>
            <button className="btn btn-danger" onClick={applyBulkDelete}>Excluir {selectedCases.length}</button>
          </>
        }>
          <p style={{ color: 'var(--text-secondary)' }}>Excluir <strong style={{ color: 'var(--text-primary)' }}>{selectedCases.length} caso(s)</strong> selecionado(s)? Casos sem permissão serão ignorados. Esta ação não pode ser desfeita.</p>
        </Modal>
      )}
      {suiteModal && (
        <Modal title="Nova suíte" onClose={() => setSuiteModal(false)} footer={
          <>
            <button className="btn btn-ghost" onClick={() => setSuiteModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={criarSuite}>Criar</button>
          </>
        }>
          <div className="form-group"><label>Nome *</label><input value={suiteName} onChange={(e) => setSuiteName(e.target.value)} placeholder="Ex.: Autenticação" /></div>
          <div className="form-group">
            <label>Suíte pai (opcional)</label>
            <select value={suiteParent} onChange={(e) => setSuiteParent(e.target.value)}>
              <option value="">— Raiz —</option>
              {suites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <p className="form-hint">Deixe em "Raiz" para uma suíte principal, ou escolha uma suíte pai para aninhar.</p>
          </div>
        </Modal>
      )}
    </TestsLayout>
  );
}

/* ── Árvore de suítes ── */
interface TreeNode { suite: TestSuite; children: TreeNode[] }
function buildTree(suites: TestSuite[]): TreeNode[] {
  const byParent = new Map<string | null, TestSuite[]>();
  suites.forEach((s) => {
    const k = s.parentId;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(s);
  });
  const build = (parentId: string | null): TreeNode[] =>
    (byParent.get(parentId) || []).map((suite) => ({ suite, children: build(suite.id) }));
  return build(null);
}

function SuiteNode({ node, depth, selected, aggCount, expanded, onToggle, onSelect, onDelete }: {
  node: TreeNode; depth: number; selected: SuiteFilter; aggCount: Map<string, number>;
  expanded: Set<string>; onToggle: (id: string) => void;
  onSelect: (id: string) => void; onDelete?: (s: TestSuite) => void;
}) {
  const count = aggCount.get(node.suite.id) ?? 0;
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.suite.id);
  return (
    <>
      <div className={`casos-tree-item${selected === node.suite.id ? ' active' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}>
        {hasChildren ? (
          <button
            className={`casos-tree-toggle${isOpen ? ' open' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggle(node.suite.id); }}
            title={isOpen ? 'Recolher' : 'Expandir'}
            aria-label={isOpen ? 'Recolher sub-suítes' : 'Expandir sub-suítes'}
          >
            <IconChevron />
          </button>
        ) : (
          <span className="casos-tree-toggle-spacer" />
        )}
        <button className="casos-tree-label" onClick={() => onSelect(node.suite.id)} title={node.suite.name}>
          <span className="casos-tree-label-text">{node.suite.name}</span>
          <span className="casos-count" title="Total de casos (incluindo sub-suítes)">{count}</span>
        </button>
        {onDelete && <button className="casos-tree-del" title="Excluir suíte" aria-label="Excluir suíte" onClick={() => onDelete(node.suite)}><IconTrash /></button>}
      </div>
      {hasChildren && isOpen && node.children.map((ch) => (
        <SuiteNode key={ch.suite.id} node={ch} depth={depth + 1} selected={selected} aggCount={aggCount} expanded={expanded} onToggle={onToggle} onSelect={onSelect} onDelete={onDelete} />
      ))}
    </>
  );
}

/* ── Visualização somente-leitura ── */
function CaseDetail({ caso, suiteName, authorName, authorInitials, canEdit, canDelete, onEdit, onDelete, onHistory, onClose }: {
  caso: TestCase; suiteName: string | null; authorName: string; authorInitials: string;
  canEdit: boolean; canDelete: boolean;
  onEdit: () => void; onDelete: () => void; onHistory: () => void; onClose: () => void;
}) {
  const customEntries = Object.entries(caso.customFields || {});
  return (
    <Modal large title={caso.title || '(sem título)'} onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onHistory} title="Histórico de versões"><IconHistory /> Histórico</button>
        <span style={{ flex: 1 }} />
        {canDelete && <button className="btn btn-danger" onClick={onDelete}><IconTrash /> Excluir</button>}
        {canEdit && <button className="btn btn-primary" onClick={onEdit}><IconPencil /> Editar</button>}
        <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
      </>
    }>
      <div className="case-detail">
        <header className="case-detail-header">
          {caso.tags.length > 0 && (
            <div className="case-detail-tags">
              <span className="case-detail-tags-label">Tags</span>
              {caso.tags.map((t) => <span key={t} className="casos-tag">{t}</span>)}
            </div>
          )}

          <div className="case-detail-facts">
            <div className="fact">
              <span className="fact-label">Tipo</span>
              <span className="fact-value">{TYPE_LABEL[caso.type]}</span>
            </div>
            <div className="fact">
              <span className="fact-label">Prioridade</span>
              <span className="fact-value"><span className={`prio-dot prio-${caso.priority}`} aria-hidden />{PRIORITY_LABEL[caso.priority]}</span>
            </div>
            <div className="fact">
              <span className="fact-label">Status</span>
              <span className="fact-value"><span className={`tests-badge case-${caso.status}`}>{CASE_STATUS_LABEL[caso.status]}</span></span>
            </div>
            <div className="fact">
              <span className="fact-label">Suíte</span>
              <span className="fact-value">{suiteName ? <><IconFolder /> {suiteName}</> : <span className="tests-muted">— sem suíte —</span>}</span>
            </div>
          </div>

          <div className="case-detail-meta">
            <span className="case-detail-avatar" aria-hidden>{authorInitials}</span>
            <div className="case-detail-author">
              <span className="case-detail-author-name">{authorName}</span>
              <span className="case-detail-author-date">
                Criado em {formatDate(caso.createdAt)}
                {caso.updatedAt && <> · atualizado em {formatDate(caso.updatedAt)}</>}
              </span>
            </div>
          </div>
        </header>

        {caso.preconditions && (
          <section className="case-detail-block">
            <h4>Pré-condições</h4>
            <p>{caso.preconditions}</p>
          </section>
        )}

        <section className="case-detail-block">
          <h4>Passos</h4>
          {caso.steps.length === 0 ? (
            <p className="tests-muted">Sem passos cadastrados.</p>
          ) : (
            <ol className="cd-steps">
              {caso.steps.map((s, i) => (
                <li className="cd-step" key={i}>
                  <span className="cd-step-num">{i + 1}</span>
                  <div className="cd-step-body">
                    <div className="cd-step-action">{s.action || <span className="tests-muted">—</span>}</div>
                    {s.expected && <div className="case-detail-step-exp"><IconCheck /> {s.expected}</div>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {caso.expectedResult && (
          <section className="case-detail-block">
            <h4>Resultado esperado</h4>
            <p>{caso.expectedResult}</p>
          </section>
        )}

        {customEntries.length > 0 && (
          <section className="case-detail-block">
            <h4>Informações adicionais</h4>
            <dl className="case-detail-custom">
              {customEntries.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </Modal>
  );
}

/* ── Editor de caso ── */
function CaseEditor({ mode, initial, suites, plans, cards, onClose, onSave }: {
  mode: 'create' | 'edit'; initial: TestCase; suites: TestSuite[]; plans: TestPlan[]; cards: Card[];
  onClose: () => void; onSave: (c: TestCase, isEdit: boolean) => void;
}) {
  const [c, setC] = useState<TestCase>(initial);
  const [tagsText, setTagsText] = useState(initial.tags.join(', '));
  const [custom, setCustom] = useState<{ key: string; value: string }[]>(
    Object.entries(initial.customFields || {}).map(([k, v]) => ({ key: k, value: String(v) })),
  );
  const [planSearch, setPlanSearch] = useState('');

  const set = <K extends keyof TestCase>(k: K, v: TestCase[K]) => setC((p) => ({ ...p, [k]: v }));
  const setStep = (i: number, k: keyof TestStep, v: string) =>
    setC((p) => ({ ...p, steps: p.steps.map((s, idx) => (idx === i ? { ...s, [k]: v } : s)) }));
  const addStep = () => setC((p) => ({ ...p, steps: [...p.steps, { action: '', expected: '' }] }));
  const delStep = (i: number) => setC((p) => ({ ...p, steps: p.steps.filter((_, idx) => idx !== i) }));

  const submit = () => {
    if (!c.title.trim()) { showToast('Informe o título do caso.', 'warning'); return; }
    const tags = tagsText.split(',').map((t) => t.trim()).filter(Boolean);
    const customFields: Record<string, unknown> = {};
    custom.forEach(({ key, value }) => { if (key.trim()) customFields[key.trim()] = value; });
    onSave({ ...c, title: c.title.trim(), tags, customFields, steps: c.steps.filter((s) => s.action.trim() || s.expected.trim()) }, mode === 'edit');
  };

  const filteredPlans = plans.filter((p) => {
    const q = planSearch.toLowerCase();
    return !q || p.name.toLowerCase().includes(q);
  });
  const selectedPlan = plans.find((p) => p.id === c.planId) ?? null;
  const planCard = selectedPlan ? (cards.find((cr) => cr.id === selectedPlan.cardId) ?? null) : null;

  return (
    <Modal xlarge title={mode === 'create' ? 'Novo Caso de Teste' : 'Editar Caso'} onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={submit}>{mode === 'create' ? 'Criar' : 'Salvar'}</button>
      </>
    }>
      <div style={{ display: 'flex', gap: 0, minHeight: 0 }}>
        {/* ── Painel esquerdo: formulário ── */}
        <div style={{ flex: 1, minWidth: 0, paddingRight: 20, borderRight: '1px solid var(--border)', overflowY: 'auto', maxHeight: '65vh' }}>
      <div className="form-group"><label>Título *</label><input value={c.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Login com credenciais válidas" /></div>
      <div className="form-row">
        <div className="form-group"><label>Suíte</label>
          <select value={c.suiteId ?? ''} onChange={(e) => set('suiteId', e.target.value || null)}>
            <option value="">— Sem suíte —</option>
            {suites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Tipo</label>
          <select value={c.type} onChange={(e) => set('type', e.target.value as TestType)}>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Prioridade</label>
          <select value={c.priority} onChange={(e) => set('priority', e.target.value as TestPriority)}>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Status</label>
          <select value={c.status} onChange={(e) => set('status', e.target.value as TestCaseStatus)}>
            {Object.entries(CASE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group"><label>Pré-condições</label><textarea value={c.preconditions} onChange={(e) => set('preconditions', e.target.value)} placeholder="Estado inicial necessário" /></div>

      <div className="form-group">
        <label>Passos da execução</label>
        <p className="form-hint">Liste o passo a passo: o que fazer e o que deve acontecer em cada etapa.</p>
        <div className="casos-steps">
          {c.steps.map((s, i) => (
            <div className="step-card" key={i}>
              <span className="step-num">{i + 1}</span>
              <div className="step-grid">
                <div className="step-field">
                  <span className="step-field-label">Ação</span>
                  <textarea className="casos-step-field" rows={2} placeholder="O que o testador faz" value={s.action} onChange={(e) => setStep(i, 'action', e.target.value)} />
                </div>
                <div className="step-field">
                  <span className="step-field-label">Resultado esperado</span>
                  <textarea className="casos-step-field" rows={2} placeholder="O que deve acontecer" value={s.expected} onChange={(e) => setStep(i, 'expected', e.target.value)} />
                </div>
              </div>
              <button className="tests-iconbtn danger" onClick={() => delStep(i)} title="Remover passo" aria-label="Remover passo"><IconX /></button>
            </div>
          ))}
        </div>
        <button className="btn-add" onClick={addStep}><IconPlus /> Adicionar passo</button>
      </div>

      <div className="form-group"><label>Resultado esperado (geral)</label><textarea value={c.expectedResult} onChange={(e) => set('expectedResult', e.target.value)} placeholder="Critério final de aprovação do caso" /></div>
      <div className="form-group">
        <label>Tags</label>
        <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Ex.: smoke, regressão, login" />
        <p className="form-hint">Separe por vírgula.</p>
      </div>

      <div className="form-group">
        <label>Informações adicionais <span className="form-label-opt">(opcional)</span></label>
        <div className="casos-custom">
          {custom.map((row, i) => (
            <div className="casos-custom-row" key={i}>
              <input placeholder="Nome do campo" value={row.key} onChange={(e) => setCustom((p) => p.map((r, idx) => idx === i ? { ...r, key: e.target.value } : r))} />
              <input placeholder="Valor" value={row.value} onChange={(e) => setCustom((p) => p.map((r, idx) => idx === i ? { ...r, value: e.target.value } : r))} />
              <button className="tests-iconbtn danger" onClick={() => setCustom((p) => p.filter((_, idx) => idx !== i))} title="Remover campo" aria-label="Remover campo"><IconX /></button>
            </div>
          ))}
          {custom.length === 0 && <p className="field-empty">Informações extras, se precisar — ex.: navegador, ambiente, endpoint.</p>}
        </div>
        <button className="btn-add" onClick={() => setCustom((p) => [...p, { key: '', value: '' }])}><IconPlus /> Adicionar campo</button>
      </div>
        </div>{/* fim painel esquerdo */}

        {/* ── Painel direito: planos de teste ── */}
        <div style={{ width: 380, flexShrink: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: '65vh' }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Plano de Teste</div>

          {/* busca + lista */}
          <input
            value={planSearch}
            onChange={(e) => setPlanSearch(e.target.value)}
            placeholder="Buscar plano…"
            style={{ padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filteredPlans.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', paddingTop: 8 }}>
                {plans.length === 0 ? 'Nenhum plano criado.' : 'Nenhum resultado.'}
              </div>
            )}
            {filteredPlans.map((p) => {
              const selected = c.planId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => set('planId', selected ? null : p.id)}
                  style={{
                    textAlign: 'left', padding: '8px 10px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                    border: `1.5px solid ${selected ? 'var(--accent, #4f6ef7)' : 'var(--border)'}`,
                    background: selected ? 'var(--accent-subtle, #eef2ff)' : 'var(--surface)',
                    fontWeight: selected ? 600 : 400,
                    color: selected ? 'var(--accent, #4f6ef7)' : 'var(--text-primary)',
                    transition: 'border-color 0.12s, background 0.12s',
                  }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>

          {/* preview dos campos do card vinculado ao plano */}
          {selectedPlan && (
            <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ height: 1, background: 'var(--border)' }} />
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                Base do plano selecionado
              </div>
              {planCard ? (
                <>
                  {[
                    { label: 'Objetivo e Valor', value: planCard.objetivo },
                    { label: 'Resumo da Demanda', value: planCard.resumo },
                    { label: 'Checklist com critérios de aceite', value: planCard.checklist },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>{label}</div>
                      <div style={{
                        whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6,
                        padding: '10px 12px', borderRadius: 7,
                        background: 'var(--surface-alt, #f7f8fa)',
                        border: '1px solid var(--border)',
                        color: value ? 'var(--text-primary)' : 'var(--text-muted)',
                        fontStyle: value ? 'normal' : 'italic',
                        minHeight: 48,
                      }}>
                        {value || 'Não informado'}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Este plano não tem card vinculado.
                </div>
              )}
            </div>
          )}
        </div>
      </div>{/* fim dois painéis */}
    </Modal>
  );
}

/* ── Histórico de versões ── */
const FIELD_LABELS: [keyof TestCase, string][] = [
  ['title', 'Título'], ['type', 'Tipo'], ['priority', 'Prioridade'], ['status', 'Status'],
  ['suiteId', 'Suíte'], ['preconditions', 'Pré-condições'], ['expectedResult', 'Resultado esperado'],
  ['tags', 'Tags'], ['steps', 'Passos'], ['customFields', 'Informações adicionais'],
];
function changedFields(before: Partial<TestCase>, after: Partial<TestCase>): string[] {
  const out: string[] = [];
  for (const [key, label] of FIELD_LABELS) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) out.push(label);
  }
  return out;
}

function VersionsModal({ caso, onClose }: { caso: TestCase; onClose: () => void }) {
  const { name: userName } = useUserNames();
  const [versions, setVersions] = useState<TestCaseVersion[] | null>(null);
  useEffect(() => { listCaseVersions(caso.id).then(setVersions); }, [caso.id]);
  return (
    <Modal title={`Histórico — ${caso.title}`} onClose={onClose}>
      {versions === null ? <p className="tests-muted">Carregando…</p>
        : versions.length === 0 ? <p className="tests-muted">Sem versões anteriores. As versões são geradas a cada edição.</p>
          : (
            <ul className="casos-versions">
              {versions.map((v, i) => {
                // estado "depois" da edição: a versão mais nova é comparada com o caso atual;
                // as demais, com a versão imediatamente mais nova.
                const after: Partial<TestCase> = i === 0 ? caso : versions[i - 1].snapshot;
                const changes = changedFields(v.snapshot, after);
                return (
                  <li key={v.id}>
                    <div className="version-head">
                      <strong>{formatDate(v.savedAt)}</strong>
                      <span className="version-author">por {userName(v.savedBy)}</span>
                    </div>
                    <div className="version-changes">
                      {changes.length === 0
                        ? <span className="tests-muted">Sem alterações detectadas</span>
                        : changes.map((f) => <span key={f} className="version-chip">{f}</span>)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
    </Modal>
  );
}

/* ── Importação massiva por Excel ── */
interface ParsedCase {
  title: string;
  preconditions: string;
  steps: TestStep[];
  expectedResult: string;
  tags: string[];
}

/** Normaliza cabeçalho: maiúsculo, sem acentos, sem espaços nas pontas. */
function normHeader(s: unknown): string {
  return String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Extrai casos de teste da planilha. Procura uma aba cujo cabeçalho tenha
 * a coluna CENARIO_TESTE e mapeia as colunas conhecidas. A coluna
 * RESULTADO_PASSO_A_PASSO é intencionalmente ignorada.
 */
function parseCasesFromWorkbook(wb: XLSX.WorkBook): ParsedCase[] {
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: '', blankrows: false });
    if (!rows.length) continue;
    const header = (rows[0] as unknown[]).map(normHeader);
    const col = {
      title: header.indexOf('CENARIO_TESTE'),
      pre: header.indexOf('PRE_CONDICAO'),
      passos: header.indexOf('PASSO_A_PASSO'),
      resPasso: header.indexOf('RESULTADO_PASSO_A_PASSO'),
      esperado: header.indexOf('RESULTADO_ESPERADO'),
      tag: header.indexOf('TAG'),
    };
    if (col.title === -1) continue; // não é a aba de casos

    const cell = (r: unknown[], i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '');
    const out: ParsedCase[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] as unknown[];
      const title = cell(r, col.title);
      if (!title) continue;
      // "|" separa cada passo; o RESULTADO_PASSO_A_PASSO usa o mesmo "|" e
      // alinha por índice com cada passo (passo[k] ↔ resultado[k]).
      const actions = cell(r, col.passos).split('|').map((s) => s.trim()).filter(Boolean);
      const results = cell(r, col.resPasso).split('|').map((s) => s.trim());
      const steps = actions.map<TestStep>((action, k) => ({ action, expected: results[k] ?? '' }));
      const tags = cell(r, col.tag)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      out.push({
        title,
        preconditions: cell(r, col.pre),
        steps: steps.length ? steps : [{ action: '', expected: '' }],
        expectedResult: cell(r, col.esperado),
        tags,
      });
    }
    return out;
  }
  return [];
}

function ImportCasesModal({ projectId, suites, existing, defaultSuiteId, onClose, onDone }: {
  projectId: string; suites: TestSuite[]; existing: TestCase[]; defaultSuiteId: string;
  onClose: () => void; onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedCase[] | null>(null);
  const [busy, setBusy] = useState(false);

  // defaults aplicados a TODOS os casos importados
  const [suiteId, setSuiteId] = useState(defaultSuiteId);
  const [type, setType] = useState<TestType>('manual');
  const [priority, setPriority] = useState<TestPriority>('medium');
  const [status, setStatus] = useState<TestCaseStatus>('draft');

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setParsed(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const cases = parseCasesFromWorkbook(wb);
      if (cases.length === 0) {
        showToast('Nenhum caso encontrado. Verifique se há uma aba com a coluna CENARIO_TESTE.', 'warning');
        setParsed([]);
        return;
      }
      setParsed(cases);
    } catch {
      showToast('Não foi possível ler o arquivo.', 'error');
    }
  };

  const doImport = async () => {
    if (!parsed || parsed.length === 0) { showToast('Selecione um arquivo válido para importar.', 'warning'); return; }
    setBusy(true);
    const now = new Date().toISOString();
    const creator = currentUserId();

    // casos já existentes neste projeto, indexados por título normalizado
    const byTitle = new Map(existing.map((c) => [normHeader(c.title), c]));

    // Monta as linhas colapsando duplicados do próprio arquivo (mesmo título →
    // mesma linha) e reaproveitando o id do caso existente para ATUALIZAR.
    const map = new Map<string, TestCase>();
    for (const p of parsed) {
      const key = normHeader(p.title);
      const match = byTitle.get(key);
      const prev = map.get(key);
      map.set(key, {
        id: prev?.id ?? match?.id ?? genId(),
        suiteId: suiteId || null, projectId, planId: match?.planId ?? null,
        title: p.title, type, priority, status,
        preconditions: p.preconditions, steps: p.steps, expectedResult: p.expectedResult,
        tags: p.tags, customFields: match?.customFields ?? {},
        createdBy: match?.createdBy ?? creator,
        createdAt: match?.createdAt ?? now,
        updatedAt: match ? now : (prev?.updatedAt ?? null),
      });
    }
    const rows = [...map.values()];
    const updated = [...map.keys()].filter((k) => byTitle.has(k)).length;
    const created = rows.length - updated;

    const ok = await bulkUpsertCases(rows);
    setBusy(false);
    if (!ok) return; // bulkUpsertCases já notificou o erro
    showToast(`Importação concluída: ${created} criado(s), ${updated} atualizado(s).`, 'success');
    onDone();
  };

  return (
    <Modal large title="Importar Casos por Excel" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn btn-primary" onClick={doImport} disabled={busy || !parsed || parsed.length === 0}>
          {busy ? 'Importando…' : `Importar ${parsed?.length ? `(${parsed.length})` : ''}`}
        </button>
      </>
    }>
      <div className="form-group">
        <label>Arquivo (.xlsx, .xls, .csv)</label>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onFile(e.target.files?.[0])} />
        {fileName && <p className="form-hint">{fileName}</p>}
        <p className="form-hint">
          Colunas lidas: <b>CENARIO_TESTE</b> (título), <b>PRE_CONDICAO</b>, <b>PASSO_A_PASSO</b> e
          {' '}<b>RESULTADO_PASSO_A_PASSO</b> (use “|” para separar cada passo / resultado, alinhados na ordem),
          {' '}<b>RESULTADO_ESPERADO</b> (geral) e <b>TAG</b> (separada por vírgula).
          {' '}Casos com título já existente são <b>atualizados</b> em vez de duplicados.
        </p>
      </div>

      <div className="form-row">
        <div className="form-group"><label>Suíte</label>
          <select value={suiteId} onChange={(e) => setSuiteId(e.target.value)}>
            <option value="">— Sem suíte —</option>
            {suites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Tipo</label>
          <select value={type} onChange={(e) => setType(e.target.value as TestType)}>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Prioridade</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as TestPriority)}>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as TestCaseStatus)}>
            {Object.entries(CASE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <p className="form-hint">Os valores acima são aplicados a todos os casos importados.</p>

      {parsed && parsed.length > 0 && (
        <div className="form-group">
          <label>Pré-visualização ({parsed.length} caso{parsed.length === 1 ? '' : 's'})</label>
          <div className="casos-table-wrap" style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table className="tests-table">
              <thead><tr><th>Título</th><th>Passos</th><th>Tags</th></tr></thead>
              <tbody>
                {parsed.slice(0, 50).map((p, i) => (
                  <tr key={i}>
                    <td>{p.title}</td>
                    <td className="tests-muted-cell">{p.steps.filter((s) => s.action).length}</td>
                    <td>{p.tags.length > 0 && <div className="casos-tags">{p.tags.map((t) => <span key={t} className="casos-tag">{t}</span>)}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.length > 50 && <p className="form-hint">Mostrando os primeiros 50 de {parsed.length}.</p>}
        </div>
      )}
    </Modal>
  );
}

/* ── Editar em lote ── */
const KEEP = '__keep__';
function BulkEditModal({ count, suites, onClose, onApply }: {
  count: number; suites: TestSuite[];
  onClose: () => void;
  onApply: (changes: Partial<Pick<TestCase, 'suiteId' | 'type' | 'priority' | 'status'>>) => void;
}) {
  const [suiteId, setSuiteId] = useState<string>(KEEP);
  const [type, setType] = useState<string>(KEEP);
  const [priority, setPriority] = useState<string>(KEEP);
  const [status, setStatus] = useState<string>(KEEP);

  const apply = () => {
    const changes: Partial<Pick<TestCase, 'suiteId' | 'type' | 'priority' | 'status'>> = {};
    if (suiteId !== KEEP) changes.suiteId = suiteId === '' ? null : suiteId;
    if (type !== KEEP) changes.type = type as TestType;
    if (priority !== KEEP) changes.priority = priority as TestPriority;
    if (status !== KEEP) changes.status = status as TestCaseStatus;
    if (Object.keys(changes).length === 0) { showToast('Selecione ao menos um campo para alterar.', 'warning'); return; }
    onApply(changes);
  };

  return (
    <Modal title={`Editar ${count} caso(s) em lote`} onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={apply}>Aplicar</button>
      </>
    }>
      <p className="form-hint">Só os campos alterados (≠ “Manter atual”) são aplicados aos casos selecionados.</p>
      <div className="form-group"><label>Suíte</label>
        <select value={suiteId} onChange={(e) => setSuiteId(e.target.value)}>
          <option value={KEEP}>— Manter atual —</option>
          <option value="">— Sem suíte —</option>
          {suites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Tipo</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value={KEEP}>— Manter atual —</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Prioridade</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value={KEEP}>— Manter atual —</option>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value={KEEP}>— Manter atual —</option>
            {Object.entries(CASE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
    </Modal>
  );
}

/* ── helpers ── */
function clone(c: TestCase): TestCase { return JSON.parse(JSON.stringify(c)); }
function snapshot(c: TestCase): Partial<TestCase> {
  const { id: _id, ...rest } = c;
  void _id;
  return rest;
}
