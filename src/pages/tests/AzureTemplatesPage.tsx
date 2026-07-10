/* ═══════════════════════════════════════════════════════════
   AzureTemplatesPage — Templates dinâmicos de bug Azure DevOps.
   ═══════════════════════════════════════════════════════════ */
import { useEffect, useState, useMemo } from 'react';
import { TestsLayout } from './TestsLayout';
import { Modal } from '../../components/Modal';
import { showToast } from '../../lib/toast';
import { can } from '../../lib/auth';
import { currentUserId } from '../../lib/testManagement';
import {
  listAzureTemplates, saveAzureTemplate, deleteAzureTemplate, listAzureConfigs, genAzureId,
  getMyAzureSettings,
} from '../../lib/azureManagement';
import { fetchBugFields } from '../../lib/azureDevOps';
import type { AzureTemplate, AzureTemplateField, AzureConfig, AzureFieldType, AzureWorkItemField } from '../../types/azure';
import { IconPlus, IconPencil, IconTrash } from '../../components/tests/icons';

/* Campos padrão que quase todo projeto Azure usa */
const QUICK_FIELDS: AzureTemplateField[] = [
  { referenceName: 'System.State', label: 'Estado', type: 'dropdown', options: [], required: false, defaultValue: 'New' },
  { referenceName: 'System.Reason', label: 'Motivo', type: 'text', options: [], required: false, defaultValue: 'New' },
  { referenceName: 'System.AreaPath', label: 'Área', type: 'dropdown', options: [], required: false, defaultValue: '' },
  { referenceName: 'System.IterationPath', label: 'Iteração', type: 'dropdown', options: [], required: false, defaultValue: '' },
  { referenceName: 'System.AssignedTo', label: 'Responsável', type: 'dropdown', options: [], required: false, defaultValue: '' },
  { referenceName: 'Microsoft.VSTS.Common.Priority', label: 'Prioridade', type: 'dropdown', options: ['1', '2', '3', '4'], required: false, defaultValue: '3' },
  { referenceName: 'Microsoft.VSTS.Common.Severity', label: 'Severidade', type: 'dropdown', options: ['1 - Critical', '2 - High', '3 - Medium', '4 - Low'], required: false, defaultValue: '3 - Medium' },
  { referenceName: 'Microsoft.VSTS.Scheduling.StoryPoints', label: 'Story Points', type: 'integer', options: [], required: false, defaultValue: '' },
  { referenceName: 'Microsoft.VSTS.TCM.ReproSteps', label: 'Repro Steps', type: 'textarea', options: [], required: false, defaultValue: '' },
  { referenceName: 'Microsoft.VSTS.Common.Activity', label: 'Activity', type: 'dropdown', options: ['Development', 'Testing', 'Requirements', 'Deployment'], required: false, defaultValue: 'Testing' },
];

const FIELD_TYPE_LABEL: Record<AzureFieldType, string> = {
  text: 'Texto', textarea: 'Texto longo', dropdown: 'Seleção', integer: 'Número',
};

const HELP = (
  <>
    <strong>Templates Azure DevOps</strong>
    <ul>
      <li>Um <b>template</b> define quais campos aparecem ao criar um bug no Azure DevOps.</li>
      <li>Selecione uma <b>conexão</b>, insira seu <b>PAT</b> e clique em <b>Buscar campos</b> para carregar os campos customizados do seu projeto.</li>
      <li>Use os <b>atalhos</b> para adicionar os campos mais comuns com um clique.</li>
    </ul>
  </>
);

function emptyTemplate(cfgs: AzureConfig[]): AzureTemplate {
  return { id: genAzureId(), name: '', azureConfigId: cfgs[0]?.id ?? '', fields: [], createdBy: currentUserId(), createdAt: new Date().toISOString() };
}

export function AzureTemplatesPage() {
  const [templates, setTemplates] = useState<AzureTemplate[]>([]);
  const [configs, setConfigs] = useState<AzureConfig[]>([]);
  const [busy, setBusy] = useState(true);
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; data: AzureTemplate } | null>(null);
  const [confirmDel, setConfirmDel] = useState<AzureTemplate | null>(null);
  const canWrite = can('create');

  const load = async () => {
    setBusy(true);
    const [tmpl, cfgs] = await Promise.all([listAzureTemplates(), listAzureConfigs()]);
    setTemplates(tmpl); setConfigs(cfgs); setBusy(false);
  };
  useEffect(() => { load(); }, []);

  const configName = (id: string) => configs.find((c) => c.id === id)?.name ?? id;

  return (
    <TestsLayout title="Templates Azure" activeAdmin="azure-templates" help={HELP} loading={busy}>
      <div className="casos-searchblock">
        <div className="casos-searchblock-top">
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {templates.length} template{templates.length !== 1 ? 's' : ''}
          </span>
          {canWrite && configs.length > 0 && (
            <button className="btn btn-primary btn-sm casos-new-btn" onClick={() => setEditor({ mode: 'create', data: emptyTemplate(configs) })}>
              <IconPlus /> Novo Template
            </button>
          )}
          {configs.length === 0 && !busy && (
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Nenhuma conexão Azure configurada. Admin deve cadastrar em <strong>Administração → Azure DevOps</strong>.
            </span>
          )}
        </div>
      </div>

      <div className="casos-table-wrap">
        {busy ? (
          <p className="tests-muted" style={{ padding: 16 }}>Carregando…</p>
        ) : templates.length === 0 ? (
          <div className="tests-empty">
            <h2>Nenhum template</h2>
            <p>Crie um template para definir os campos Azure que aparecem ao registrar um bug.</p>
          </div>
        ) : (
          <table className="tests-table">
            <thead><tr><th>Nome</th><th>Conexão</th><th>Campos</th><th></th></tr></thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.name}</strong></td>
                  <td>{configName(t.azureConfigId)}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{t.fields.length} campo{t.fields.length !== 1 ? 's' : ''}</td>
                  <td className="casos-actions-cell">
                    <div className="casos-rowactions">
                      {canWrite && (
                        <button className="tests-iconbtn" onClick={() => setEditor({ mode: 'edit', data: JSON.parse(JSON.stringify(t)) })} title="Editar">
                          <IconPencil />
                        </button>
                      )}
                      {can('delete', t.createdBy ?? undefined) && (
                        <button className="tests-iconbtn danger" onClick={() => setConfirmDel(t)} title="Excluir">
                          <IconTrash />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editor && (
        <TemplateEditor
          mode={editor.mode}
          initial={editor.data}
          configs={configs}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); load(); }}
        />
      )}

      {confirmDel && (
        <Modal title="Excluir Template" onClose={() => setConfirmDel(null)} footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Cancelar</button>
            <button className="btn btn-danger" onClick={async () => {
              if (await deleteAzureTemplate(confirmDel.id)) { showToast('Template excluído.', 'success'); setConfirmDel(null); load(); }
            }}>Excluir</button>
          </>
        }>
          <p style={{ color: 'var(--text-secondary)' }}>
            Excluir <strong style={{ color: 'var(--text-primary)' }}>{confirmDel.name}</strong>?
          </p>
        </Modal>
      )}
    </TestsLayout>
  );
}

/* ════════════════════════════════════════════════════════
   Editor de Template
   ════════════════════════════════════════════════════════ */
function TemplateEditor({ mode, initial, configs, onClose, onSaved }: {
  mode: 'create' | 'edit'; initial: AzureTemplate; configs: AzureConfig[];
  onClose: () => void; onSaved: () => void;
}) {
  const [t, setT] = useState<AzureTemplate>(initial);
  const [azureFields, setAzureFields] = useState<AzureWorkItemField[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [fieldSearch, setFieldSearch] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const selectedCfg = configs.find((c) => c.id === t.azureConfigId);

  const onConfigChange = (id: string) => {
    setT((p) => ({ ...p, azureConfigId: id, fields: [] }));
    setAzureFields([]);
    setFieldSearch('');
  };

  const loadFields = async () => {
    if (!selectedCfg) { showToast('Selecione uma conexão.', 'warning'); return; }
    setLoadingFields(true);
    try {
      const settings = await getMyAzureSettings();
      if (!settings?.pat) { showToast('Configure seu PAT no Perfil antes de buscar campos.', 'warning'); setLoadingFields(false); return; }
      const fields = await fetchBugFields({ organization: selectedCfg.organization, project: selectedCfg.project, pat: settings.pat });
      setAzureFields(fields);
      showToast(`${fields.length} campos carregados.`, 'success');
    } catch (e) {
      showToast(`Erro: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
    setLoadingFields(false);
  };

  const isAdded = (ref: string) => t.fields.some((f) => f.referenceName === ref);

  const addField = (field: AzureTemplateField) => {
    if (isAdded(field.referenceName)) { showToast('Campo já adicionado.', 'warning'); return; }
    setT((p) => ({ ...p, fields: [...p.fields, { ...field }] }));
  };

  const addFromAzure = (af: AzureWorkItemField) => {
    if (isAdded(af.referenceName)) { showToast('Campo já adicionado.', 'warning'); return; }
    const type: AzureFieldType = af.allowedValues.length > 0 ? 'dropdown' : af.type === 'integer' ? 'integer' : 'text';
    addField({ referenceName: af.referenceName, label: af.name, type, options: af.allowedValues, required: false, defaultValue: '' });
  };

  const removeField = (idx: number) => setT((p) => ({ ...p, fields: p.fields.filter((_, i) => i !== idx) }));

  const moveField = (idx: number, dir: -1 | 1) => {
    const fields = [...t.fields];
    const target = idx + dir;
    if (target < 0 || target >= fields.length) return;
    [fields[idx], fields[target]] = [fields[target], fields[idx]];
    setT((p) => ({ ...p, fields }));
  };

  const updateField = (idx: number, updated: AzureTemplateField) => {
    setT((p) => { const fields = [...p.fields]; fields[idx] = updated; return { ...p, fields }; });
    setEditingIdx(null);
  };

  const filteredAzureFields = useMemo(() => {
    const q = fieldSearch.trim().toLowerCase();
    return q ? azureFields.filter((f) => f.name.toLowerCase().includes(q) || f.referenceName.toLowerCase().includes(q)) : azureFields;
  }, [azureFields, fieldSearch]);

  const submit = async () => {
    if (!t.name.trim()) { showToast('Informe o nome do template.', 'warning'); return; }
    if (!t.azureConfigId) { showToast('Selecione uma conexão.', 'warning'); return; }
    if (t.fields.length === 0) { showToast('Adicione ao menos um campo.', 'warning'); return; }
    if (await saveAzureTemplate({ ...t, name: t.name.trim() })) {
      showToast(mode === 'create' ? 'Template criado.' : 'Template salvo.', 'success');
      onSaved();
    }
  };

  return (
    <Modal large title={mode === 'create' ? 'Novo Template Azure' : 'Editar Template'} onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={submit}>{mode === 'create' ? 'Criar Template' : 'Salvar'}</button>
      </>
    }>
      {/* ── Configuração básica ── */}
      <div className="form-row">
        <div className="form-group">
          <label>Nome do Template *</label>
          <input type="text" autoComplete="off" value={t.name} onChange={(e) => setT((p) => ({ ...p, name: e.target.value }))} placeholder="Ex.: Bug Padrão Polaris" />
        </div>
        <div className="form-group">
          <label>Conexão Azure *</label>
          <select value={t.azureConfigId} onChange={(e) => onConfigChange(e.target.value)}>
            {configs.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.organization}/{c.project}</option>)}
          </select>
        </div>
      </div>

      {/* ── Buscar campos ── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 24, padding: '14px', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)', background: 'var(--bg-input)' }}>
        <button className="btn btn-primary" onClick={loadFields} disabled={loadingFields} style={{ minWidth: 180 }}>
          {loadingFields ? 'Buscando…' : 'Buscar campos'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Carrega os campos do tipo Bug da conexão selecionada usando o seu PAT do Perfil.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* ── Coluna esquerda: campos no template ── */}
        <div>
          <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
            Campos no Template ({t.fields.length})
          </p>
          {t.fields.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              Nenhum campo. Use os <strong>atalhos</strong> ou <strong>busca</strong> à direita.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {t.fields.map((f, i) => (
                <div key={f.referenceName} style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 10px' }}>
                  {editingIdx === i ? (
                    <InlineFieldEditor
                      field={f}
                      onSave={(updated) => updateField(i, updated)}
                      onCancel={() => setEditingIdx(null)}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{f.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{f.referenceName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{FIELD_TYPE_LABEL[f.type]}{f.required ? ' · Obrigatório' : ''}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        <button className="tests-iconbtn" onClick={() => moveField(i, -1)} disabled={i === 0} title="Subir" style={{ fontSize: 11 }}>↑</button>
                        <button className="tests-iconbtn" onClick={() => moveField(i, 1)} disabled={i === t.fields.length - 1} title="Descer" style={{ fontSize: 11 }}>↓</button>
                        <button className="tests-iconbtn" onClick={() => setEditingIdx(i)} title="Editar"><IconPencil /></button>
                        <button className="tests-iconbtn danger" onClick={() => removeField(i)} title="Remover"><IconTrash /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Coluna direita: adicionar campos ── */}
        <div>
          {/* Atalhos para campos comuns */}
          <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Atalhos (campos comuns)</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {QUICK_FIELDS.map((qf) => (
              <button
                key={qf.referenceName}
                className={`btn btn-xs ${isAdded(qf.referenceName) ? 'btn-ghost' : 'btn-ghost'}`}
                style={{ opacity: isAdded(qf.referenceName) ? 0.4 : 1, fontSize: 12 }}
                onClick={() => addField(qf)}
                disabled={isAdded(qf.referenceName)}
                title={qf.referenceName}
              >
                + {qf.label}
              </button>
            ))}
          </div>

          {/* Campos carregados da API Azure */}
          {azureFields.length > 0 && (
            <>
              <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                Campos do Azure ({azureFields.length})
              </p>
              <input
                type="text"
                autoComplete="off"
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                placeholder="Filtrar por nome ou referenceName…"
                style={{ marginBottom: 8 }}
              />
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                {filteredAzureFields.length === 0 ? (
                  <p style={{ padding: 8, fontSize: 13, color: 'var(--text-secondary)' }}>Nenhum campo encontrado.</p>
                ) : filteredAzureFields.map((af) => {
                  const added = isAdded(af.referenceName);
                  return (
                    <div key={af.referenceName} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13 }}>{af.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{af.referenceName}</div>
                      </div>
                      <button className="btn btn-ghost btn-xs" onClick={() => addFromAzure(af)} disabled={added}>
                        {added ? '✓' : '+ Add'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {azureFields.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Clique em <strong>"Buscar campos"</strong> para carregar todos os campos do tipo Bug (incluindo custom fields).
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ── Editor inline de um campo individual ── */
function InlineFieldEditor({ field, onSave, onCancel }: {
  field: AzureTemplateField; onSave: (f: AzureTemplateField) => void; onCancel: () => void;
}) {
  const [f, setF] = useState<AzureTemplateField>(field);
  const [optionsText, setOptionsText] = useState(f.options.join('\n'));
  const set = <K extends keyof AzureTemplateField>(k: K, v: AzureTemplateField[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="form-row" style={{ margin: 0 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: 12 }}>Label</label>
          <input type="text" autoComplete="off" value={f.label} onChange={(e) => set('label', e.target.value)} style={{ fontSize: 13 }} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: 12 }}>Tipo</label>
          <select value={f.type} onChange={(e) => set('type', e.target.value as AzureFieldType)} style={{ fontSize: 13 }}>
            {(Object.entries(FIELD_TYPE_LABEL) as [AzureFieldType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      {f.type === 'dropdown' && (
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: 12 }}>Opções (uma por linha)</label>
          <textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)} rows={3} style={{ fontSize: 12 }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={f.required} onChange={(e) => set('required', e.target.checked)} />
          Obrigatório
        </label>
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-xs" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-primary btn-xs" onClick={() => onSave({ ...f, options: optionsText.split('\n').map((s) => s.trim()).filter(Boolean) })}>OK</button>
      </div>
    </div>
  );
}
