import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import type { SVGProps } from 'react';
import { useNavigate as useRRNavigate, useSearchParams } from 'react-router-dom';
import { IconUpload, IconX, IconBug, IconNote, IconLightbulb, IconAlertTriangle, IconPlay, IconPause, IconImprovement, IconCheck } from '../../components/tests/icons';
import { TestsLayout } from './TestsLayout';
import { ProjectBar } from '../../components/tests/ProjectBar';
import { Modal } from '../../components/Modal';
import { useActiveProject } from '../../hooks/useActiveProject';
import { can } from '../../lib/auth';
import { showToast } from '../../lib/toast';
import { formatDate } from '../../lib/utils';
import {
  genId, currentUserId,
  listSessions, saveSession, deleteSession,
  listPlans, listCards, listSprints, listMilestones, listDefects, saveDefect,
  uploadEvidence,
} from '../../lib/testManagement';
import { listAzureConfigs, getMyAzureSettings } from '../../lib/azureManagement';
import { getComments, getMyAzureId, inlineCommentImages } from '../../lib/azureDevOps';
import type { AzureComment } from '../../types/azure';
import {
  type ExploratorySession, type ExploratoryNote, type ExploratoryNoteType,
  type TestPlan, type Card, type Sprint, type Milestone, type Defect, type DefectSeverity,
  type Evidence,
  DEFECT_STATUS_LABEL,
  DEFECT_SEVERITY_LABEL,
  SESSION_STATUS_LABEL, SESSION_STATUS_COLOR,
} from '../../types/tests';

function fmtDur(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (h ? `${h}h ` : '') + `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

type NoteOpt = { key: ExploratoryNoteType; label: string; Icon: (p: SVGProps<SVGSVGElement>) => JSX.Element; color: string };
const NOTE_OPTS: NoteOpt[] = [
  { key: 'note',        label: 'Observação', Icon: IconNote,          color: 'var(--text-muted)' },
  { key: 'idea',        label: 'Ideia',      Icon: IconLightbulb,     color: '#f59e0b' },
  { key: 'bug',         label: 'Bug',        Icon: IconBug,           color: 'var(--error)' },
  { key: 'blocker',     label: 'Bloqueio',   Icon: IconAlertTriangle, color: '#f97316' },
  { key: 'improvement', label: 'Melhoria',   Icon: IconImprovement,   color: '#10b981' },
];

/* ══════════════ MAIN PAGE ══════════════ */
export function ExploratorioPage() {
  const { projects, activeId, setActiveId, reload, loading } = useActiveProject();
  const [sessions, setSessions] = useState<ExploratorySession[]>([]);
  const [active, setActive] = useState<ExploratorySession | null>(null);
  const [newModal, setNewModal] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [initializing, setInitializing] = useState(!!searchParams.get('session'));
  const [listSearch, setListSearch] = useState('');
  const [listFilter, setListFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [allPlans, setAllPlans] = useState<TestPlan[]>([]);
  const podeEscrever = can('create');

  const load = async (pid: string, skipRestore = false) => {
    const [all, plans] = await Promise.all([listSessions(pid), listPlans(pid)]);
    setSessions(all);
    setAllPlans(plans);
    if (!skipRestore) {
      const urlSession = searchParams.get('session');
      if (urlSession) {
        const found = all.find((s) => s.id === urlSession);
        if (found) setActive(found);
      }
    }
    setInitializing(false);
  };

  useEffect(() => {
    if (activeId) load(activeId);
    else { setSessions([]); setAllPlans([]); setActive(null); setInitializing(false); }
  }, [activeId]);

  const openSession = (s: ExploratorySession) => {
    setActive(s);
    setSearchParams({ session: s.id }, { replace: true });
  };

  const closeSession = () => {
    setActive(null);
    setSearchParams({}, { replace: true });
    if (activeId) load(activeId, true);
  };

  const actions = <ProjectBar projects={projects} activeId={activeId} onChange={setActiveId} onCreated={reload} />;

  if (initializing) return null;

  if (active) {
    return (
      <TestsLayout title="Sessão Exploratória" activeTest="exploratorio" actions={actions} fluid loading={loading}>
        <SessionRunner
          session={active}
          onBack={closeSession}
          onSaved={(updated) => setActive(updated)}
        />
      </TestsLayout>
    );
  }

  const sortedSessions = [...sessions].sort((a, b) => {
    const so = (a.status === 'closed' ? 1 : 0) - (b.status === 'closed' ? 1 : 0);
    return so !== 0 ? so : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const filteredSessions = sortedSessions.filter(s => {
    if (listFilter === 'open'   && s.status !== 'open')   return false;
    if (listFilter === 'closed' && s.status !== 'closed') return false;
    if (listSearch) {
      const q = listSearch.toLowerCase();
      return (s.charter ?? '').toLowerCase().includes(q) || (s.ambiente ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const totalBugs = sessions.reduce((n, s) => n + s.notes.filter(x => x.noteType === 'bug' || x.bugId).length, 0);
  const openCount   = sessions.filter(s => s.status !== 'closed').length;
  const closedCount = sessions.filter(s => s.status === 'closed').length;

  return (
    <TestsLayout title="Sessões Exploratórias" activeTest="exploratorio" actions={actions} loading={loading}>
      {!activeId ? (
        <div className="tests-empty"><h2>Selecione um projeto</h2><p>Escolha ou crie um projeto no seletor acima.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {[
              { label: 'Total',        value: sessions.length, color: 'var(--accent)',   icon: <IconNote width={20} height={20} /> },
              { label: 'Abertas',      value: openCount,       color: '#10b981',         icon: <IconPlay width={20} height={20} /> },
              { label: 'Fechadas',     value: closedCount,     color: '#94a3b8',         icon: <IconCheck width={20} height={20} /> },
              { label: 'Bugs criados', value: totalBugs,       color: totalBugs > 0 ? '#ef4444' : '#10b981', icon: <IconBug width={20} height={20} /> },
            ].map(({ label, value, color, icon }) => (
              <div key={label} className="tests-card" style={{ position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 8, right: 10, width: 34, height: 34, borderRadius: 10, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
                  {icon}
                </div>
                <span className="tests-card-label">{label}</span>
                <span className="tests-card-value" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Painel */}
          <section className="tests-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="tests-panel-header" style={{ flexShrink: 0 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <IconNote width={14} height={14} style={{ color: 'var(--accent)' } as React.CSSProperties} />
                Sessões
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {(['all', 'open', 'closed'] as const).map(f => {
                  const active = listFilter === f;
                  const col = f === 'open' ? '#10b981' : f === 'closed' ? '#94a3b8' : 'var(--accent)';
                  const cnt = f === 'all' ? sessions.length : f === 'open' ? openCount : closedCount;
                  return (
                    <button key={f} onClick={() => setListFilter(f)}
                      style={{ fontSize: 11, padding: '2px 10px', borderRadius: 99, border: `1px solid ${active ? col : 'var(--border)'}`, background: active ? col : 'transparent', color: active ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: active ? 700 : 500 }}>
                      {f === 'all' ? 'Todas' : SESSION_STATUS_LABEL[f as 'open' | 'closed']} {cnt}
                    </button>
                  );
                })}
                {podeEscrever && (
                  <button className="btn btn-primary btn-sm" style={{ marginLeft: 4 }} onClick={() => setNewModal(true)}>
                    + Nova Sessão
                  </button>
                )}
              </div>
            </div>

            {/* Busca */}
            <div style={{ flexShrink: 0, marginBottom: 12 }}>
              <input type="text" value={listSearch} onChange={e => setListSearch(e.target.value)}
                placeholder="Buscar por charter ou ambiente…"
                style={{ width: '100%', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {sessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 14 }}>
                <p style={{ marginBottom: 12 }}>Nenhuma sessão registrada.</p>
                {podeEscrever && <button className="btn btn-primary btn-sm" onClick={() => setNewModal(true)}>+ Nova Sessão</button>}
              </div>
            ) : filteredSessions.length === 0 ? (
              <p className="tests-muted">Nenhuma sessão encontrada.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredSessions.map(s => {
                  const isClosed = s.status === 'closed';
                  const borderCol = isClosed ? '#94a3b8' : '#10b981';
                  const statusCol = SESSION_STATUS_COLOR[s.status ?? 'open'];
                  const bugs      = s.notes.filter(n => n.noteType === 'bug' || n.bugId).length;
                  const blockers  = s.notes.filter(n => n.noteType === 'blocker').length;
                  const ideas     = s.notes.filter(n => n.noteType === 'idea' || n.noteType === 'improvement').length;
                  const observations = s.notes.filter(n => n.noteType === 'note').length;
                  return (
                    <div key={s.id}
                      style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 10, border: '1px solid var(--border)', borderLeft: `4px solid ${borderCol}`, opacity: isClosed ? 0.65 : 1, cursor: 'pointer', transition: 'background 0.12s' }}
                      onClick={() => openSession(s)}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-input)')}>

                      {/* Linha 1: charter + status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.charter || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: 400 }}>Sem charter</span>}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: statusCol, background: `${statusCol}18`, border: `1px solid ${statusCol}40`, borderRadius: 5, padding: '2px 8px', flexShrink: 0 }}>
                          {SESSION_STATUS_LABEL[s.status ?? 'open']}
                        </span>
                      </div>

                      {/* Linha 2: meta */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(s.createdAt)}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>·</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>⏱ {fmtDur(s.durationSeconds)}</span>
                        {s.ambiente && (
                          <span className="run-ambiente" style={{ fontSize: 10 }}>{s.ambiente}</span>
                        )}
                        {s.company && (
                          <span className="run-company" style={{ fontSize: 10 }}>
                            {({ '7': 'Bedsonline', '8': 'Cativa', '10': 'Flot', '12': 'Smiles', '17': 'Azul' } as Record<string, string>)[s.company] ?? s.company}
                          </span>
                        )}
                        {s.versaoBackoffice && (
                          <span style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 7px' }}>BO {s.versaoBackoffice}</span>
                        )}
                        {s.versaoB2b && (
                          <span style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 7px' }}>B2B {s.versaoB2b}</span>
                        )}
                        {s.planId && (() => { const p = allPlans.find(x => x.id === s.planId); return p ? <span style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--accent-soft, #6366f118)', border: '1px solid #6366f130', borderRadius: 5, padding: '1px 7px', fontWeight: 600 }}>{p.name}</span> : null; })()}
                      </div>

                      {/* Linha 3: badges de notas + excluir */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        {bugs > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: '#ef444418', border: '1px solid #ef444440', borderRadius: 5, padding: '1px 7px' }}>
                            {bugs} bug{bugs > 1 ? 's' : ''}
                          </span>
                        )}
                        {blockers > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#f97316', background: '#f9731618', border: '1px solid #f9731630', borderRadius: 5, padding: '1px 7px' }}>
                            {blockers} bloq.
                          </span>
                        )}
                        {ideas > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: '#f59e0b', background: '#f59e0b18', border: '1px solid #f59e0b30', borderRadius: 5, padding: '1px 7px' }}>
                            {ideas} ideia{ideas > 1 ? 's' : ''}
                          </span>
                        )}
                        {observations > 0 && (
                          <span style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 7px' }}>
                            {observations} obs.
                          </span>
                        )}
                        {can('delete') && (
                          <button className="btn btn-danger btn-xs" style={{ marginLeft: 'auto' }}
                            onClick={async e => {
                              e.stopPropagation();
                              if (await deleteSession(s.id)) { showToast('Sessão removida.', 'success'); if (activeId) load(activeId, true); }
                            }}>
                            <IconX width={10} height={10} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
      {newModal && activeId && (
        <NewSessionModal
          projectId={activeId}
          onClose={() => setNewModal(false)}
          onCreated={(s) => { setNewModal(false); openSession(s); }}
        />
      )}
    </TestsLayout>
  );
}

const AMBIENTES = [
  { label: 'DEV ORION',  value: 'DEV ORION'  },
  { label: 'DEV POLARIS',value: 'DEV POLARIS' },
  { label: 'TST',        value: 'TST'         },
  { label: 'QA',         value: 'QA'          },
  { label: 'STG',        value: 'STG'         },
  { label: 'PROD',       value: 'PROD'        },
];

const COMPANIES = [
  { label: 'Bedsonline', value: '7'  },
  { label: 'Cativa',     value: '8'  },
  { label: 'Flot',       value: '10' },
  { label: 'Smiles',     value: '12' },
  { label: 'Azul',       value: '17' },
];

/* ══════════════ NEW SESSION MODAL ══════════════ */
function NewSessionModal({ projectId, onClose, onCreated }: {
  projectId: string; onClose: () => void; onCreated: (s: ExploratorySession) => void;
}) {
  const [charter, setCharter] = useState('');
  const [planId, setPlanId] = useState('');
  const [ambiente, setAmbiente] = useState('');
  const [company, setCompany] = useState('');
  const [bo, setBo] = useState('');
  const [b2b, setB2b] = useState('');
  const [plans, setPlans] = useState<TestPlan[]>([]);

  useEffect(() => { listPlans(projectId).then(setPlans); }, [projectId]);

  const criar = async () => {
    if (!charter.trim()) { showToast('Descreva o charter da sessão.', 'warning'); return; }
    const s: ExploratorySession = {
      id: genId(), projectId, charter: charter.trim(),
      planId: planId || null,
      ambiente: ambiente.trim() || null,
      company: company || null,
      versaoBackoffice: bo.trim() || null,
      versaoB2b: b2b.trim() || null,
      notes: [], durationSeconds: 0, status: 'open',
      createdBy: currentUserId(), createdAt: new Date().toISOString(),
    };
    if (await saveSession(s)) { showToast('Sessão criada.', 'success'); onCreated(s); }
  };

  return (
    <Modal title="Nova Sessão Exploratória" onClose={onClose} footer={
      <><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={criar}>Iniciar</button></>
    }>
      <div className="form-group">
        <label>Charter *</label>
        <textarea value={charter} onChange={(e) => setCharter(e.target.value)}
          placeholder="Explorar o fluxo de checkout buscando inconsistências de preço…" rows={3} />
      </div>
      <div className="form-group">
        <label>Vincular Plano de Teste <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span></label>
        <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">— Nenhum —</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Ambiente</label>
          <select value={ambiente} onChange={(e) => setAmbiente(e.target.value)}>
            <option value="">— Nenhum —</option>
            {AMBIENTES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Company</label>
          <select value={company} onChange={(e) => setCompany(e.target.value)}>
            <option value="">— Nenhuma —</option>
            {COMPANIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Backoffice</label>
          <input type="text" value={bo} onChange={(e) => setBo(e.target.value)} placeholder="versão…" />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Portal B2B</label>
          <input type="text" value={b2b} onChange={(e) => setB2b(e.target.value)} placeholder="versão…" />
        </div>
      </div>
    </Modal>
  );
}

/* ══════════════ SESSION RUNNER ══════════════ */
function SessionRunner({ session, onBack, onSaved }: {
  session: ExploratorySession; onBack: () => void; onSaved: (u: ExploratorySession) => void;
}) {
  const [notes, setNotes] = useState<ExploratoryNote[]>(session.notes);
  const [text, setText] = useState('');
  const [noteType, setNoteType] = useState<ExploratoryNoteType>('note');
  const [feedFilter, setFeedFilter] = useState<ExploratoryNoteType | 'all'>('all');
  const [pendingEvidence, setPendingEvidence] = useState<Evidence[]>([]);
  const [uploadingNote, setUploadingNote] = useState(false);
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(session.durationSeconds);
  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [openFields, setOpenFields] = useState<Set<string>>(new Set());
  const [defectModal, setDefectModal] = useState<{ description: string; evidence: Evidence[] } | null>(null);
  const [lightbox, setLightbox] = useState<Evidence | null>(null);
  const [showEviDrop, setShowEviDrop] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [azureApiCfg, setAzureApiCfg] = useState<{ organization: string; project: string; pat: string } | null>(null);
  const startRef = useRef(0);
  const baseRef = useRef(session.durationSeconds);
  const pendingNavRef = useRef<string | null>(null);
  const notesRef = useRef(notes);
  const timelineEndRef = useRef<HTMLDivElement>(null);
  const navNavigate = useRRNavigate();
  const podeEscrever = can('create');

  // manter ref sincronizada para uso nos handlers de evento
  useEffect(() => { notesRef.current = notes; }, [notes]);

  // scroll para o fim ao adicionar nota
  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [notes.length]);

  const toggleField = (label: string) =>
    setOpenFields((p) => { const n = new Set(p); n.has(label) ? n.delete(label) : n.add(label); return n; });

  useEffect(() => {
    const pid = session.projectId;
    listPlans(pid).then(setPlans);
    listCards(pid).then(setCards);
    listSprints(pid).then(setSprints);
    listMilestones(pid).then(setMilestones);
    listDefects(pid).then(setDefects);
    Promise.all([listAzureConfigs(), getMyAzureSettings()]).then(([cfgs, settings]) => {
      const cfg = cfgs[0] ?? null;
      const pat = settings?.pat ?? null;
      if (cfg && pat) setAzureApiCfg({ organization: cfg.organization, project: cfg.project, pat });
    });
  }, [session.projectId]);

  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => setSeconds(baseRef.current + Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(i);
  }, [running]);

  // intercepta cliques no sidebar quando o cronômetro está rodando
  useEffect(() => {
    if (!running) return;
    const onCapture = (e: MouseEvent) => {
      const btn = (e.target as Element).closest('[data-navpath]');
      if (!btn) return;
      const path = btn.getAttribute('data-navpath');
      if (!path) return;
      e.stopPropagation(); e.preventDefault();
      pendingNavRef.current = path;
      setConfirmLeave(true);
    };
    document.addEventListener('click', onCapture, true);
    return () => document.removeEventListener('click', onCapture, true);
  }, [running]);

  const currentDur = useCallback(() =>
    running ? baseRef.current + Math.floor((Date.now() - startRef.current) / 1000) : seconds,
    [running, seconds]);

  const commitSave = useCallback(async () => {
    const dur = running ? baseRef.current + Math.floor((Date.now() - startRef.current) / 1000) : seconds;
    const updated: ExploratorySession = { ...session, notes: notesRef.current, durationSeconds: dur };
    await saveSession(updated);
    onSaved(updated);
  }, [running, seconds, session, onSaved]);

  const toggle = () => {
    if (running) { baseRef.current = seconds; setRunning(false); }
    else { startRef.current = Date.now(); setRunning(true); }
  };

  // back: se timer ligado → pede confirmação; senão → salva silenciosamente e sai
  const handleBack = useCallback(async () => {
    if (running) { setConfirmLeave(true); return; }
    await commitSave();
    onBack();
  }, [running, commitSave, onBack]);

  // salvar explícito (botão "Salvar sessão")
  const salvar = async () => {
    await commitSave();
    showToast('Sessão salva.', 'success');
    onBack();
  };

  const addNote = async () => {
    if (!text.trim() && pendingEvidence.length === 0) return;
    const note: ExploratoryNote = {
      at: new Date().toISOString(), text: text.trim(), noteType,
      evidence: pendingEvidence.length > 0 ? [...pendingEvidence] : undefined,
    };
    setNotes((p) => [...p, note]);
    setText('');
    setPendingEvidence([]);
  };

  const removeNote = (idx: number) => setNotes((p) => p.filter((_, i) => i !== idx));

  const handleFiles = async (fileList: FileList | null, fileArr: File[] | null) => {
    const arr = fileArr ?? (fileList ? Array.from(fileList) : []);
    if (arr.length === 0) return;
    setUploadingNote(true);
    const uploaded: Evidence[] = [];
    for (const f of arr) {
      const ev = await uploadEvidence(session.id, f);
      if (ev) uploaded.push(ev);
    }
    setPendingEvidence((p) => [...p, ...uploaded]);
    setShowEviDrop(false);
    setUploadingNote(false);
  };

  const linkedPlan      = useMemo(() => plans.find((p) => p.id === session.planId) ?? null, [plans, session.planId]);
  const linkedCard      = useMemo(() => cards.find((c) => c.id === linkedPlan?.cardId) ?? null, [cards, linkedPlan]);
  const linkedSprint    = useMemo(() => sprints.find((s) => s.id === (linkedCard?.sprintId ?? linkedPlan?.sprintId)) ?? null, [sprints, linkedCard, linkedPlan]);
  const linkedMilestone = useMemo(() => milestones.find((m) => m.id === (linkedCard?.milestoneId ?? linkedPlan?.milestoneId)) ?? null, [milestones, linkedCard, linkedPlan]);
  const sessionBugs     = useMemo(() => defects.filter((d) =>
    d.externalKey === `explor:${session.id}` ||
    (session.planId && d.planId === session.planId) ||
    (linkedCard && d.cardId === linkedCard.id)
  ), [defects, session.id, session.planId, linkedCard]);


  const onDefectSaved = (d: Defect) => {
    setDefects((prev) => [d, ...prev.filter((x) => x.id !== d.id)]);
    const bugNote: ExploratoryNote = { at: new Date().toISOString(), text: `Bug registrado: ${d.title}`, noteType: 'bug', bugId: d.id };
    const newNotes = [...notesRef.current, bugNote];
    notesRef.current = newNotes;
    setNotes(newNotes);
    const dur = running ? baseRef.current + Math.floor((Date.now() - startRef.current) / 1000) : seconds;
    const updated: ExploratorySession = { ...session, notes: newNotes, durationSeconds: dur };
    saveSession(updated).then(() => onSaved(updated));
    setDefectModal(null);
  };

  return (
    <div className="runner">
      {/* barra superior */}
      <div className="runner-bar">
        <button className="btn btn-ghost btn-sm" onClick={handleBack}>← Voltar</button>
        <div className="runner-progress">
          <span className={`runner-timer${running ? ' on' : ''}`} style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.04em', minWidth: 80, textAlign: 'center' }}>{fmtDur(seconds)}</span>
          {podeEscrever && (
            <button
              className={`btn btn-sm${running ? ' btn-ghost' : ' btn-primary'}`}
              style={{ display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 12, paddingRight: 14, fontWeight: 600 }}
              onClick={toggle}
            >
              {running
                ? <><IconPause width={14} height={14} /> Pausar</>
                : <><IconPlay width={14} height={14} /> Iniciar</>}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {podeEscrever && session.status !== 'closed' && (
            <button className="btn btn-sm" disabled={changingStatus}
              style={{ background: '#10b981', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 5 }}
              onClick={async () => {
                setChangingStatus(true);
                const dur = running ? baseRef.current + Math.floor((Date.now() - startRef.current) / 1000) : seconds;
                if (running) { setRunning(false); baseRef.current = dur; }
                const updated: ExploratorySession = { ...session, notes, durationSeconds: dur, status: 'closed' };
                await saveSession(updated);
                onSaved(updated);
                setChangingStatus(false);
                showToast('Sessão fechada.', 'success');
              }}>
              <IconCheck width={13} height={13} />
              {changingStatus ? 'Fechando…' : 'Fechar sessão'}
            </button>
          )}
          {podeEscrever && session.status === 'closed' && (
            <button className="btn btn-sm" disabled={changingStatus}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 5 }}
              onClick={async () => {
                setChangingStatus(true);
                const updated: ExploratorySession = { ...session, notes, status: 'open' };
                await saveSession(updated);
                onSaved(updated);
                setChangingStatus(false);
                showToast('Sessão reaberta.', 'success');
              }}>
              <IconPlay width={13} height={13} />
              {changingStatus ? 'Reabrindo…' : 'Reabrir sessão'}
            </button>
          )}
          {podeEscrever && <button className="btn btn-primary btn-sm" onClick={salvar}>Salvar sessão</button>}
        </div>
      </div>

      <div className="runner-body">

        {/* ── SIDEBAR ESQUERDA (igual ao runner de execução) ── */}
        <div className="runner-sidebar">

            {/* Charter */}
            <div className="runner-sidebar-field">
              <span className="runner-sidebar-label">Charter</span>
              <span className="runner-sidebar-value" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 13 }}>
                {session.charter || <em style={{ color: 'var(--text-muted)' }}>Sem charter</em>}
              </span>
            </div>

            {/* Card */}
            {linkedCard && (
              <div className="runner-sidebar-field">
                <span className="runner-sidebar-label">Card</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {linkedCard.azureId && <span className="casos-tag" style={{ fontSize: 13, fontWeight: 700 }}>#{linkedCard.azureId}</span>}
                  <span className="runner-sidebar-value">{linkedCard.title}</span>
                </div>
              </div>
            )}

            {/* Plano de Teste */}
            {linkedPlan && (
              <div className="runner-sidebar-field">
                <span className="runner-sidebar-label">Plano de Teste</span>
                <span className="runner-sidebar-value" style={{ color: 'var(--text-secondary)' }}>{linkedPlan.name}</span>
              </div>
            )}

            {/* Sprint + Marco */}
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

            {/* Ambiente + Company */}
            {(session.ambiente || session.company) && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {session.ambiente && (
                  <div className="runner-sidebar-field" style={{ flex: 1, minWidth: 80 }}>
                    <span className="runner-sidebar-label">Ambiente</span>
                    <span className="run-ambiente" style={{ alignSelf: 'flex-start' }}>{AMBIENTES.find((a) => a.value === session.ambiente)?.label ?? session.ambiente}</span>
                  </div>
                )}
                {session.company && (
                  <div className="runner-sidebar-field" style={{ flex: 1, minWidth: 80 }}>
                    <span className="runner-sidebar-label">Company</span>
                    <span className="run-company" style={{ alignSelf: 'flex-start' }}>{COMPANIES.find((c) => c.value === session.company)?.label ?? session.company}</span>
                  </div>
                )}
              </div>
            )}

            {/* Backoffice + Portal B2B */}
            {session.versaoBackoffice && (
              <div className="runner-sidebar-field">
                <span className="runner-sidebar-label">Backoffice</span>
                <span className="runner-sidebar-value">{session.versaoBackoffice}</span>
              </div>
            )}
            {session.versaoB2b && (
              <div className="runner-sidebar-field">
                <span className="runner-sidebar-label">Portal B2B</span>
                <span className="runner-sidebar-value">{session.versaoB2b}</span>
              </div>
            )}

            {/* Detalhes do card — objetivo / resumo / checklist */}
            {linkedCard && (linkedCard.objetivo || linkedCard.resumo || linkedCard.checklist) && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="runner-sidebar-label" style={{ marginBottom: 6 }}>Detalhes do Card</span>
                {[
                  { label: 'Objetivo e Valor',                  value: linkedCard.objetivo  },
                  { label: 'Resumo da Demanda',                 value: linkedCard.resumo    },
                  { label: 'Checklist com critérios de aceite', value: linkedCard.checklist },
                ].map(({ label, value }) => {
                  const open = openFields.has(label);
                  return (
                    <div key={label} style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                      <button onClick={() => toggleField(label)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--surface-alt)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, textAlign: 'left', color: 'var(--text-primary)' }}>
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

            {/* Contadores por tipo */}
            <div style={{ display: 'flex', gap: 10 }}>
              {NOTE_OPTS.map((opt) => {
                const count = notes.filter(n => n.noteType === opt.key).length;
                const ac = opt.color === 'var(--text-muted)' ? 'var(--accent)' : opt.color;
                return (
                  <div key={opt.key} className="runner-sidebar-field" style={{ flex: 1, minWidth: 0 }}>
                    <span className="runner-sidebar-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <opt.Icon width={10} height={10} style={{ color: ac } as React.CSSProperties} />
                      {opt.label}
                    </span>
                    <span className="runner-sidebar-value" style={{ color: count > 0 ? ac : undefined }}>{count}</span>
                  </div>
                );
              })}
            </div>

            {/* Lista de bugs — expande inline com comentários Azure */}
            {sessionBugs.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="runner-sidebar-label" style={{ marginBottom: 2 }}>Bugs criados</span>
                {sessionBugs.map((bug) => (
                  <ExploratoryBugRow
                    key={bug.id}
                    bug={bug}
                    azureApiCfg={azureApiCfg}
                    onLightbox={setLightbox}
                    session={session}
                    plans={plans}
                    cards={cards}
                    sprints={sprints}
                    milestones={milestones}
                  />
                ))}
              </div>
            )}
          </div>

        {/* ── PAINEL DIREITO — chat de anotações ── */}
        <div className="session-chat-panel">

          {/* cabeçalho + filtros por tipo */}
          <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 18px 8px' }}>
              <IconNote width={14} height={14} style={{ color: 'var(--text-muted)', flexShrink: 0 } as React.CSSProperties} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', flex: 1 }}>Anotações</span>
              {notes.length > 0 && (
                <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--bg-input)', color: 'var(--text-muted)', borderRadius: 99, padding: '2px 8px', border: '1px solid var(--border)' }}>
                  {notes.length}
                </span>
              )}
            </div>
            {notes.length > 0 && (
              <div style={{ display: 'flex', gap: 6, padding: '0 14px 10px', flexWrap: 'wrap' }}>
                {/* pill Todos */}
                <button onClick={() => setFeedFilter('all')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, border: `1.5px solid ${feedFilter === 'all' ? 'var(--accent)' : 'var(--border)'}`, background: 'transparent', color: feedFilter === 'all' ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: feedFilter === 'all' ? 700 : 400 }}>
                  Todos <span style={{ fontSize: 11, opacity: 0.8 }}>{notes.length}</span>
                </button>
                {NOTE_OPTS.map((opt) => {
                  const count = notes.filter(n => n.noteType === opt.key).length;
                  const sel = feedFilter === opt.key;
                  const optAc = opt.color === 'var(--text-muted)' ? 'var(--accent)' : opt.color;
                  return (
                    <button key={opt.key} onClick={() => setFeedFilter(opt.key)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, border: `1.5px solid ${sel ? optAc : 'var(--border)'}`, background: 'transparent', color: sel ? optAc : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: sel ? 700 : 400 }}>
                      <opt.Icon width={11} height={11} />
                      {opt.label} <span style={{ fontSize: 11, opacity: 0.8 }}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* feed scrollável */}
          <div className="session-chat-feed">
            {notes.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, minHeight: '60%', color: 'var(--text-muted)', padding: '48px 24px' }}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25 }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <div style={{ textAlign: 'center', lineHeight: 1.7 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Nenhuma anotação ainda</div>
                  <div style={{ fontSize: 12 }}>Registre observações, bugs e ideias abaixo.</div>
                </div>
              </div>
            ) : notes.filter(n => feedFilter === 'all' || n.noteType === feedFilter).map((n, i) => {
              const opt = NOTE_OPTS.find((o) => o.key === n.noteType) ?? NOTE_OPTS[0];
              const accent = opt.color === 'var(--text-muted)' ? 'var(--accent)' : opt.color;
              return (
                <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `3px solid ${accent}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface-alt)', borderBottom: (n.text || (n.evidence && n.evidence.length > 0)) ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ color: accent, display: 'flex' }}><opt.Icon width={14} height={14} /></span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: accent, flex: 1 }}>{opt.label}</span>
                    {podeEscrever && (
                      <button className="btn btn-ghost btn-xs"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--error)', borderColor: 'rgba(239,68,68,0.25)', padding: '2px 8px', fontSize: 11 }}
                        onClick={() => setDefectModal({ description: n.text ?? '', evidence: n.evidence ?? [] })}>
                        <IconBug width={11} height={11} /> Criar Bug
                      </button>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {new Date(n.at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {podeEscrever && (
                      <button onClick={() => removeNote(i)} title="Remover"
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '0 3px', lineHeight: 1, opacity: 0.5 }}>×</button>
                    )}
                  </div>
                  {(n.text || (n.evidence && n.evidence.length > 0)) && (
                    <div style={{ padding: '9px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {n.text && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{n.text}</p>}
                      {n.evidence && n.evidence.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {n.evidence.map((ev, ei) => (
                            <button key={ei} type="button" onClick={() => setLightbox(ev)}
                              style={{ padding: 0, border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden', cursor: 'zoom-in', background: 'none', flexShrink: 0 }}>
                              <img src={ev.url} alt={ev.name} style={{ display: 'block', height: 72, width: 108, objectFit: 'cover' }} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={timelineEndRef} />
          </div>

          {/* composer */}
          {podeEscrever && (() => {
            const activeOpt = NOTE_OPTS.find(o => o.key === noteType) ?? NOTE_OPTS[0];
            const ac = activeOpt.color === 'var(--text-muted)' ? 'var(--accent)' : activeOpt.color;
            return (
              <div className="session-chat-composer" style={{ borderTop: `2px solid ${ac}`, boxShadow: '0 -2px 10px rgba(0,0,0,0.07)' }}>

                {/* tipo + evidência toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px 10px', borderBottom: '1px solid var(--border)' }}>
                  {NOTE_OPTS.map((opt) => {
                    const sel = noteType === opt.key;
                    const optAc = opt.color === 'var(--text-muted)' ? 'var(--accent)' : opt.color;
                    return (
                      <button key={opt.key} onClick={() => setNoteType(opt.key)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${sel ? optAc : 'var(--border)'}`, background: 'transparent', color: sel ? optAc : 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: sel ? 700 : 400, transition: 'all 0.12s', whiteSpace: 'nowrap' }}>
                        <opt.Icon width={14} height={14} />
                        {opt.label}
                      </button>
                    );
                  })}
                  <div style={{ flex: 1 }} />
                  <button
                    className={`btn btn-ghost btn-sm${showEviDrop ? ' on' : ''}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: showEviDrop ? ac : undefined }}
                    title="Anexar evidência"
                    onClick={() => setShowEviDrop((v) => !v)}>
                    <IconUpload width={14} height={14} /> Evidência
                  </button>
                </div>

                {/* evidence drop */}
                {showEviDrop && (
                  <div style={{ padding: '8px 14px 0' }}>
                    <EvidenceDrop uploading={uploadingNote} onFiles={(f) => { handleFiles(f instanceof FileList ? f : null, Array.isArray(f) ? f : null); }} />
                  </div>
                )}

                {/* thumbnails pendentes */}
                {pendingEvidence.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 14px 0' }}>
                    {pendingEvidence.map((ev, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <button type="button" onClick={() => setLightbox(ev)}
                          style={{ padding: 0, border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden', cursor: 'zoom-in', background: 'none', display: 'block' }}>
                          <img src={ev.url} alt={ev.name} style={{ height: 56, width: 80, objectFit: 'cover', display: 'block' }} />
                        </button>
                        <button onClick={() => setPendingEvidence((p) => p.filter((_, j) => j !== i))}
                          style={{ position: 'absolute', top: -5, right: -5, background: 'var(--error)', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* textarea + botão enviar */}
                <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, padding: '12px 16px 14px' }}>
                  <textarea
                    className="explor-textarea"
                    placeholder={`${activeOpt.label}… (Enter para enviar)`}
                    value={text} rows={3}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); } }}
                    style={{ flex: 1, border: `1.5px solid var(--border)`, borderRadius: 10, background: 'var(--bg-input)', padding: '10px 14px', resize: 'none', fontSize: 14, lineHeight: 1.6, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.15s' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = ac; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                  />
                  <button
                    onClick={addNote}
                    disabled={!text.trim() && pendingEvidence.length === 0}
                    title="Enviar anotação"
                    style={{ flexShrink: 0, width: 52, alignSelf: 'stretch', borderRadius: 10, background: ac, border: `1.5px solid ${ac}`, color: '#fff', cursor: (!text.trim() && pendingEvidence.length === 0) ? 'not-allowed' : 'pointer', opacity: (!text.trim() && pendingEvidence.length === 0) ? 0.45 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.15s' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 2 11 13M22 2 15 22 11 13 2 9l20-7z" />
                    </svg>
                  </button>
                </div>

              </div>
            );
          })()}

        </div>
      </div>

      {defectModal && (
        <ExploratoryDefectModal
          projectId={session.projectId}
          sessionId={session.id}
          planId={session.planId}
          cardId={linkedCard?.id ?? null}
          session={session}
          initialDescription={defectModal.description}
          initialEvidence={defectModal.evidence}
          onClose={() => setDefectModal(null)}
          onSaved={onDefectSaved}
        />
      )}

      {confirmLeave && (
        <Modal title="Sair da sessão?" onClose={() => { setConfirmLeave(false); pendingNavRef.current = null; }} footer={
          <>
            <button className="btn btn-ghost" onClick={() => { setConfirmLeave(false); pendingNavRef.current = null; }}>Continuar sessão</button>
            <button className="btn btn-primary" onClick={async () => {
              await commitSave();
              setConfirmLeave(false);
              const nav = pendingNavRef.current;
              pendingNavRef.current = null;
              if (nav) navNavigate(nav);
              else onBack();
            }}>Salvar e sair</button>
          </>
        }>
          <p style={{ color: 'var(--text-secondary)' }}>
            O <strong style={{ color: 'var(--text-primary)' }}>cronômetro está rodando</strong>. Ao sair, o tempo e as anotações serão salvos automaticamente.
          </p>
        </Modal>
      )}

      {lightbox && <Lightbox ev={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

const COMPANY_LABEL_EX: Record<string, string> = {
  '7': 'Bedsonline', '8': 'Cativa', '10': 'Flot', '12': 'Smiles', '17': 'Azul',
};

/* ══════════════ EXPLORATORY BUG ROW ══════════════ */
function ExploratoryBugRow({ bug, azureApiCfg, onLightbox, session, plans, cards, sprints, milestones }: {
  bug: Defect;
  azureApiCfg: { organization: string; project: string; pat: string } | null;
  onLightbox: (ev: Evidence) => void;
  session: ExploratorySession;
  plans: TestPlan[];
  cards: Card[];
  sprints: Sprint[];
  milestones: Milestone[];
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<AzureComment[]>([]);
  const [loadingCmts, setLoadingCmts] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [myAzureId, setMyAzureId] = useState<string | null>(null);
  const objectUrls = useRef<string[]>([]);
  useEffect(() => () => { objectUrls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);
  const onImgClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'IMG') { e.preventDefault(); const img = t as HTMLImageElement; onLightbox({ name: img.alt || 'Imagem', url: img.src }); }
  };

  const linkedCard      = bug.cardId  ? cards.find((c) => c.id === bug.cardId)   : null;
  const linkedPlan      = bug.planId  ? plans.find((p) => p.id === bug.planId)   : null;
  const linkedSprint    = linkedPlan?.sprintId    ? sprints.find((s) => s.id === linkedPlan.sprintId)        : linkedCard?.sprintId    ? sprints.find((s) => s.id === linkedCard.sprintId)    : null;
  const linkedMilestone = linkedPlan?.milestoneId ? milestones.find((m) => m.id === linkedPlan.milestoneId)  : linkedSprint?.milestoneId ? milestones.find((m) => m.id === linkedSprint.milestoneId) : null;

  const cf = bug.azureCustomFields as Record<string, string | undefined>;
  const amb = session.ambiente       ?? cf._s_amb ?? null;
  const co  = session.company        ?? cf._s_co  ?? null;
  const bo  = session.versaoBackoffice ?? cf._s_bo  ?? null;
  const b2b = session.versaoB2b      ?? cf._s_b2b ?? null;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded && bug.azureWorkItemId && azureApiCfg) {
      setLoadingCmts(true);
      try {
        const [cms, azId] = await Promise.all([
          getComments(azureApiCfg, bug.azureWorkItemId),
          getMyAzureId(azureApiCfg),
        ]);
        setComments(await inlineCommentImages(azureApiCfg, cms, (u) => objectUrls.current.push(u)));
        setMyAzureId(azId);
      } catch { /* ignore */ }
      setLoaded(true);
      setLoadingCmts(false);
    }
  };

  const initials = (name: string) =>
    name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12 }}>
      <span style={{ fontWeight: 600, minWidth: 100, color: 'var(--text-secondary)', fontSize: 11, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{children}</span>
    </div>
  );

  return (
    <div style={{ border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, overflow: 'hidden' }}>
      {/* cabeçalho clicável */}
      <button onClick={toggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(239,68,68,0.07)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#c0392b', flexShrink: 0 }}>
          {bug.azureWorkItemId ? `#${bug.azureWorkItemId}` : '—'}
        </span>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bug.title}</span>
        <span className={`tests-badge def-${bug.status}`} style={{ flexShrink: 0, fontSize: 11 }}>{DEFECT_STATUS_LABEL[bug.status]}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', transition: 'transform 0.15s', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>▼</span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.02)', display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* facts: severidade + status */}
          <div style={{ display: 'flex', gap: 8, padding: '10px 12px 8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className={`tests-chip prio-${bug.severity}`} style={{ fontSize: 11 }}>{DEFECT_SEVERITY_LABEL[bug.severity]}</span>
            <span className={`tests-badge def-${bug.status}`} style={{ fontSize: 11 }}>{DEFECT_STATUS_LABEL[bug.status]}</span>
            {bug.azureState && <span className="casos-tag" style={{ fontSize: 11 }}>Azure: {bug.azureState}</span>}
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{formatDate(bug.createdAt)}</span>
          </div>

          {/* contexto: card, plano, sprint, marco, ambiente, company, bo, b2b */}
          {(linkedCard || linkedPlan || linkedSprint || linkedMilestone || amb || co || bo || b2b) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, margin: '0 12px 10px', padding: '8px 10px', background: 'var(--surface-alt)', borderRadius: 6, border: '1px solid var(--border)' }}>
              {linkedCard && (
                <Row label="Card">
                  {linkedCard.azureId && <span className="casos-tag" style={{ marginRight: 4 }}>#{linkedCard.azureId}</span>}
                  {linkedCard.title}
                </Row>
              )}
              {linkedPlan      && <Row label="Plano de Teste">{linkedPlan.name}</Row>}
              {linkedSprint    && <Row label="Sprint">{linkedSprint.name}</Row>}
              {linkedMilestone && <Row label="Marco">{linkedMilestone.name}</Row>}
              {amb && <Row label="Ambiente"><span className="run-ambiente">{amb}</span></Row>}
              {co  && <Row label="Company"><span className="run-company">{COMPANY_LABEL_EX[co] ?? co}</span></Row>}
              {bo  && <Row label="Backoffice">{bo}</Row>}
              {b2b && <Row label="Portal B2B">{b2b}</Row>}
            </div>
          )}

          {/* descrição */}
          <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bug.description
              ? (/<[a-z!/][\s\S]*>/i.test(bug.description)
                  ? <div className="defect-desc-html" onClick={onImgClick} style={{ fontSize: 12 }} dangerouslySetInnerHTML={{ __html: bug.description }} />
                  : <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, color: 'var(--text-primary)', margin: 0, fontSize: 12 }}>{bug.description}</p>)
              : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 12 }}>Sem descrição.</span>}

            {/* evidências */}
            {bug.evidence && bug.evidence.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {bug.evidence.map((ev, i) =>
                  /\.(png|jpe?g|gif|webp|svg|bmp)(\?.*)?$/i.test(ev.url) ? (
                    <button key={i} type="button" onClick={() => onLightbox(ev)} title={ev.name}
                      style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', padding: 0, cursor: 'zoom-in', background: 'none', flexShrink: 0 }}>
                      <img src={ev.url} alt={ev.name} style={{ display: 'block', maxHeight: 100, maxWidth: 140, objectFit: 'cover' }} />
                    </button>
                  ) : (
                    <a key={i} href={ev.url} target="_blank" rel="noreferrer"
                      style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'underline' }}>{ev.name}</a>
                  )
                )}
              </div>
            )}

            {/* comentários Azure */}
            {bug.azureWorkItemId && azureApiCfg && (
              <div style={{ borderTop: '1px solid rgba(239,68,68,0.12)', paddingTop: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Comentários Azure
                </div>
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
                                {formatDate(cm.createdDate)}
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
        </div>
      )}
    </div>
  );
}

/* ══════════════ DEFECT MODAL ══════════════ */
function ExploratoryDefectModal({ projectId, sessionId, planId, cardId, session, initialDescription, initialEvidence, onClose, onSaved }: {
  projectId: string; sessionId: string; planId: string | null; cardId: string | null;
  session: ExploratorySession;
  initialDescription: string; initialEvidence: Evidence[];
  onClose: () => void; onSaved: (d: Defect) => void;
}) {
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<DefectSeverity>('medium');
  const [description, setDescription] = useState(initialDescription);
  const [steps, setSteps] = useState('');
  const [resultado, setResultado] = useState('');
  const [evidence, setEvidence] = useState<Evidence[]>(initialEvidence);
  const [lightbox, setLightbox] = useState<Evidence | null>(null);

  const salvar = async () => {
    if (!title.trim()) { showToast('Informe o título do defeito.', 'warning'); return; }
    const fullDesc = [
      description.trim(),
      steps.trim() && `Passos para reproduzir:\n${steps.trim()}`,
      resultado.trim() && `Resultado obtido:\n${resultado.trim()}`,
    ].filter(Boolean).join('\n\n');
    const d: Defect = {
      id: genId(), projectId, kind: 'bug', runResultId: null, cardId, planId,
      title: title.trim(), description: fullDesc, severity, status: 'pending_azure',
      externalKey: `explor:${sessionId}`, createdBy: currentUserId(), createdAt: new Date().toISOString(),
      evidence, azureWorkItemId: null, azureConfigId: null,
      azureTemplateId: null, azureState: null, azureSyncedAt: null,
      azureCustomFields: {
        _s_charter: session.charter || undefined,
        _s_amb: session.ambiente ?? undefined,
        _s_co:  session.company ?? undefined,
        _s_bo:  session.versaoBackoffice ?? undefined,
        _s_b2b: session.versaoB2b ?? undefined,
      },
    };
    if (await saveDefect(d)) { showToast('Bug registrado.', 'success'); onSaved(d); }
  };

  return (
    <>
      <Modal large title="Registrar Bug" onClose={onClose} footer={
        <><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-danger" onClick={salvar}>Registrar</button></>
      }>
        <div className="form-group">
          <label>Título *</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resumo do problema encontrado" />
        </div>
        <div className="form-group">
          <label>Severidade</label>
          <select value={severity} onChange={(e) => setSeverity(e.target.value as DefectSeverity)}>
            <option value="low">Baixa</option><option value="medium">Média</option>
            <option value="high">Alta</option><option value="critical">Crítica</option>
          </select>
        </div>
        <div className="form-group">
          <label>Descrição / Contexto</label>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva o problema…" />
        </div>
        <div className="form-group">
          <label>Passos para reproduzir</label>
          <textarea rows={3} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder={'1. Acesse…\n2. Clique em…\n3. Observe…'} />
        </div>
        <div className="form-group">
          <label>Resultado obtido</label>
          <textarea rows={2} value={resultado} onChange={(e) => setResultado(e.target.value)} placeholder="O que aconteceu…" />
        </div>
        {evidence.length > 0 && (
          <div className="form-group">
            <label>Evidências</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {evidence.map((ev, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <button type="button" onClick={() => setLightbox(ev)}
                    style={{ padding: 0, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', cursor: 'zoom-in', background: 'none', display: 'block' }}>
                    <img src={ev.url} alt={ev.name} style={{ display: 'block', height: 80, width: 120, objectFit: 'cover' }} />
                  </button>
                  <button onClick={() => setEvidence((p) => p.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: -5, right: -5, background: 'var(--error)', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
      {lightbox && <Lightbox ev={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}

/* ══════════════ EVIDENCE DROP ══════════════ */
function EvidenceDrop({ uploading, onFiles }: { uploading: boolean; onFiles: (f: FileList | File[]) => void }) {
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div
      ref={ref}
      className={`evi-drop${over ? ' over' : ''}`}
      tabIndex={0}
      onClick={() => ref.current?.focus()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); }}
      onPaste={(e) => { const files = Array.from(e.clipboardData?.files || []); if (files.length) { e.preventDefault(); onFiles(files); } }}
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

/* ══════════════ LIGHTBOX ══════════════ */
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
