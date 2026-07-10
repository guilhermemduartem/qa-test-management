import { useEffect, useState } from 'react';
import { TestsLayout } from './TestsLayout';
import { ProjectBar } from '../../components/tests/ProjectBar';
import { Modal } from '../../components/Modal';
import { useActiveProject } from '../../hooks/useActiveProject';
import {
  listDefects, listCards, saveDefect, saveCard,
  genId, currentUserId,
} from '../../lib/testManagement';
import { listAzureConfigs, getMyAzureSettings } from '../../lib/azureManagement';
import { createWorkItem } from '../../lib/azureDevOps';
import type { AzureConfig } from '../../types/azure';
import type { Defect, Card } from '../../types/tests';
import { DEFECT_STATUS_LABEL } from '../../types/tests';
import { showToast } from '../../lib/toast';
import { IconPlus } from '../../components/tests/icons';
import { WorkItemModal, AzureItem, AZ_TYPE_COLOR } from '../../components/tests/AzureWorkItemModal';

const TYPE_COLOR = AZ_TYPE_COLOR;

export function AzureCardsPage() {
  const { projects, activeId, setActiveId, reload, loading } = useActiveProject();
  const [items, setItems]               = useState<AzureItem[]>([]);
  const [azureConfigs, setAzureConfigs] = useState<AzureConfig[]>([]);
  const [myPat, setMyPat]               = useState('');
  const [busy, setBusy]                 = useState(false);
  const [search, setSearch]             = useState('');
  const [viewing, setViewing]           = useState<AzureItem | null>(null);
  const [creating, setCreating]         = useState(false);

  useEffect(() => {
    listAzureConfigs().then(setAzureConfigs);
    getMyAzureSettings().then(s => { if (s?.pat) setMyPat(s.pat); });
  }, []);

  useEffect(() => {
    if (!activeId) { setItems([]); return; }
    setBusy(true);
    Promise.all([listDefects(activeId), listCards(activeId)])
      .then(([defects, cards]) => {
        const cardById = new Map(cards.map(c => [c.id, c]));
        const unified: AzureItem[] = [];

        // Bugs with Azure ID
        for (const d of defects) {
          if (d.azureWorkItemId == null || !d.azureConfigId) continue;
          const linkedCard = d.cardId ? cardById.get(d.cardId) : undefined;
          unified.push({
            azureId: d.azureWorkItemId,
            title: d.title,
            type: 'bug',
            configId: d.azureConfigId,
            defect: d,
            linkedItems: linkedCard?.azureId
              ? [{ azureId: linkedCard.azureId, title: linkedCard.title, type: 'card' }]
              : [],
          });
        }

        // Cards with Azure ID
        for (const c of cards) {
          if (c.azureId == null) continue;
          const linkedBugs = defects
            .filter(d => d.cardId === c.id && d.azureWorkItemId != null)
            .map(d => ({ azureId: d.azureWorkItemId!, title: d.title, type: 'bug' as const }));
          unified.push({
            azureId: c.azureId,
            title: c.title,
            type: 'card',
            configId: azureConfigs[0]?.id ?? '',
            card: c,
            linkedItems: linkedBugs,
          });
        }

        unified.sort((a, b) => {
          const closedA = (a.defect?.status === 'closed' || a.card?.status === 'concluida') ? 1 : 0;
          const closedB = (b.defect?.status === 'closed' || b.card?.status === 'concluida') ? 1 : 0;
          const so = closedA - closedB;
          return so !== 0 ? so : b.azureId - a.azureId;
        });
        setItems(unified);
      })
      .finally(() => setBusy(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, azureConfigs]);

  const filtered = items.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return String(i.azureId).includes(q) || i.title.toLowerCase().includes(q);
  });

  const filteredBugs         = filtered.filter(i => i.type === 'bug' && (i.defect?.kind ?? 'bug') === 'bug');
  const filteredImprovements = filtered.filter(i => i.type === 'bug' && i.defect?.kind === 'improvement');
  const filteredCards        = filtered.filter(i => i.type === 'card');

  const apiCfgFor = (configId: string) => {
    const cfg = azureConfigs.find(c => c.id === configId);
    return cfg && myPat ? { organization: cfg.organization, project: cfg.project, pat: myPat } : null;
  };

  const handleCreated = (item: AzureItem) => {
    setItems(prev => [item, ...prev]);
    setCreating(false);
  };

  const handleUpdated = (updated: AzureItem) => {
    setItems(prev => prev.map(i => i.azureId === updated.azureId && i.type === updated.type ? updated : i));
    setViewing(updated);
  };

  const actions = <ProjectBar projects={projects} activeId={activeId} onChange={setActiveId} onCreated={reload} />;

  return (
    <TestsLayout title="Comentários" activeTest="azure-cards" actions={actions} loading={loading || busy}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por ID ou título…"
          style={{ flex: 1, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
        />
        {azureConfigs.length > 0 && myPat && (
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconPlus width={14} height={14} /> Novo
          </button>
        )}
      </div>

      {/* 3 colunas lado a lado: Bugs | Melhorias | User Stories */}
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 14 }}>
          Nenhum work item Azure neste projeto.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, alignItems: 'start' }}>

          {/* Bugs */}
          <section className="tests-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="tests-panel-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                Bugs
              </h3>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', background: '#ef444418', border: '1px solid #ef444440', borderRadius: 99, padding: '1px 8px' }}>
                {filteredBugs.length}
              </span>
            </div>
            {filteredBugs.length === 0 ? (
              <p className="tests-muted">{search ? 'Nenhum resultado.' : 'Nenhum bug Azure.'}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredBugs.map(item => {
                  const isClosed = item.defect?.status === 'closed';
                  return (
                    <div key={`bug-${item.azureId}`} onClick={() => setViewing(item)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 9, border: '1px solid var(--border)', borderLeft: '4px solid #ef4444', cursor: 'pointer', opacity: isClosed ? 0.55 : 1, transition: 'background 0.12s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-input)')}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', flexShrink: 0 }}>#{item.azureId}</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                      {item.linkedItems.slice(0, 1).map(l => (
                        <span key={l.azureId} style={{ fontSize: 10, fontWeight: 700, color: TYPE_COLOR[l.type], background: `${TYPE_COLOR[l.type]}18`, border: `1px solid ${TYPE_COLOR[l.type]}40`, borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>
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
            )}
          </section>

          {/* Melhorias */}
          <section className="tests-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="tests-panel-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                Melhorias
              </h3>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#8b5cf6', background: '#8b5cf618', border: '1px solid #8b5cf640', borderRadius: 99, padding: '1px 8px' }}>
                {filteredImprovements.length}
              </span>
            </div>
            {filteredImprovements.length === 0 ? (
              <p className="tests-muted">{search ? 'Nenhum resultado.' : 'Nenhuma melhoria Azure.'}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredImprovements.map(item => {
                  const isClosed = item.defect?.status === 'closed';
                  return (
                    <div key={`imp-${item.azureId}`} onClick={() => setViewing(item)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 9, border: '1px solid var(--border)', borderLeft: '4px solid #8b5cf6', cursor: 'pointer', opacity: isClosed ? 0.55 : 1, transition: 'background 0.12s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-input)')}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#8b5cf6', flexShrink: 0 }}>#{item.azureId}</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                      {item.linkedItems.slice(0, 1).map(l => (
                        <span key={l.azureId} style={{ fontSize: 10, fontWeight: 700, color: TYPE_COLOR[l.type], background: `${TYPE_COLOR[l.type]}18`, border: `1px solid ${TYPE_COLOR[l.type]}40`, borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>
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
            )}
          </section>

          {/* User Stories */}
          <section className="tests-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="tests-panel-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                User Stories
              </h3>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#6366f1', background: '#6366f118', border: '1px solid #6366f140', borderRadius: 99, padding: '1px 8px' }}>
                {filteredCards.length}
              </span>
            </div>
            {filteredCards.length === 0 ? (
              <p className="tests-muted">{search ? 'Nenhum resultado.' : 'Nenhuma User Story Azure.'}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredCards.map(item => {
                  const isClosed = item.card?.status === 'concluida';
                  return (
                    <div key={`card-${item.azureId}`} onClick={() => setViewing(item)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 9, border: '1px solid var(--border)', borderLeft: '4px solid #6366f1', cursor: 'pointer', opacity: isClosed ? 0.55 : 1, transition: 'background 0.12s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-input)')}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', flexShrink: 0 }}>#{item.azureId}</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                      {item.linkedItems.slice(0, 2).map(l => (
                        <span key={l.azureId} style={{ fontSize: 10, fontWeight: 700, color: TYPE_COLOR[l.type], background: `${TYPE_COLOR[l.type]}18`, border: `1px solid ${TYPE_COLOR[l.type]}40`, borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>
                          #{l.azureId}
                        </span>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      )}

      {/* Detail modal */}
      {viewing && (
        <WorkItemModal
          item={viewing}
          apiCfg={apiCfgFor(viewing.configId) ?? (azureConfigs[0] && myPat ? { organization: azureConfigs[0].organization, project: azureConfigs[0].project, pat: myPat } : null)}
          onClose={() => setViewing(null)}
          onUpdated={handleUpdated}
          onCloseItem={async (item) => {
            // Close linked defects when closing a work item
            if (item.defect) {
              const updated = { ...item.defect, status: 'closed' as const };
              await saveDefect(updated);
              handleUpdated({ ...item, defect: updated });
            }
            if (item.card) {
              const updated = { ...item.card, status: 'concluida' as const };
              await saveCard(updated);
              // also close linked bugs
              for (const li of item.linkedItems) {
                const linked = items.find(i => i.type === 'bug' && i.azureId === li.azureId);
                if (linked?.defect) {
                  const updatedDefect = { ...linked.defect, status: 'closed' as const };
                  await saveDefect(updatedDefect);
                  setItems(prev => prev.map(i => i.azureId === li.azureId ? { ...i, defect: updatedDefect } : i));
                }
              }
              handleUpdated({ ...item, card: updated });
            }
          }}
        />
      )}

      {/* Create modal */}
      {creating && azureConfigs.length > 0 && myPat && (
        <CreateWorkItemModal
          azureConfigs={azureConfigs}
          myPat={myPat}
          projectId={activeId!}
          onClose={() => setCreating(false)}
          onCreated={handleCreated}
        />
      )}
    </TestsLayout>
  );
}

/* ════════════════════════════════════════════════
   Create Work Item Modal
   ════════════════════════════════════════════════ */
function CreateWorkItemModal({ azureConfigs, myPat, projectId, onClose, onCreated }: {
  azureConfigs: AzureConfig[];
  myPat: string;
  projectId: string;
  onClose: () => void;
  onCreated: (item: AzureItem) => void;
}) {
  const [type, setType]         = useState<'bug' | 'us'>('bug');
  const [configId, setConfigId] = useState(azureConfigs[0]?.id ?? '');
  const [title, setTitle]       = useState('');
  const [desc, setDesc]         = useState('');
  const [saving, setSaving]     = useState(false);

  const cfg = azureConfigs.find(c => c.id === configId);
  const apiCfg = cfg && myPat ? { organization: cfg.organization, project: cfg.project, pat: myPat } : null;

  const handleCreate = async () => {
    if (!title.trim() || !apiCfg) return;
    setSaving(true);
    try {
      const wiType = type === 'bug' ? 'Bug' : 'User Story';
      const fields: Record<string, unknown> = {
        'System.Title': title.trim(),
        'System.Description': desc.trim() || undefined,
      };
      const azureId = await createWorkItem(apiCfg, wiType, fields);

      if (type === 'bug') {
        const defect: Defect = {
          id: genId(), projectId, kind: 'bug', runResultId: null, cardId: null, planId: null,
          title: title.trim(), description: desc.trim(), severity: 'medium', status: 'open',
          externalKey: null, createdBy: currentUserId(), createdAt: new Date().toISOString(),
          evidence: [], azureWorkItemId: azureId, azureConfigId: configId,
          azureTemplateId: null, azureState: null, azureSyncedAt: null, azureCustomFields: {},
        };
        await saveDefect(defect);
        onCreated({ azureId, title: title.trim(), type: 'bug', configId, defect, linkedItems: [] });
      } else {
        onCreated({ azureId, title: title.trim(), type: 'card', configId, linkedItems: [] });
      }

      showToast(`${wiType} #${azureId} criado no Azure.`, 'success');
    } catch (e) {
      showToast(`Erro: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Novo Work Item Azure" onClose={onClose} footer={
      <><span style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => void handleCreate()} disabled={saving || !title.trim() || !apiCfg}>
          {saving ? 'Criando…' : 'Criar no Azure'}
        </button>
      </>
    }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {azureConfigs.length > 1 && (
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Config Azure</label>
            <select value={configId} onChange={e => setConfigId(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13 }}>
              {azureConfigs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tipo</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['bug', 'us'] as const).map(t => {
              const active = type === t;
              const col = t === 'bug' ? '#ef4444' : '#6366f1';
              return (
                <button key={t} onClick={() => setType(t)}
                  style={{ flex: 1, padding: '8px', borderRadius: 8, border: `2px solid ${active ? col : 'var(--border)'}`, background: active ? `${col}18` : 'var(--bg-input)', color: active ? col : 'var(--text-muted)', fontWeight: active ? 700 : 400, cursor: 'pointer', fontSize: 13 }}>
                  {t === 'bug' ? '🐛 Bug' : '📋 User Story'}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Título *</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Título do work item…"
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Descrição</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4} placeholder="Descrição…"
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>
    </Modal>
  );
}
