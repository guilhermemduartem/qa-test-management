/* ═══════════════════════════════════════════════════════════
   AzureConfigPage — Admin: gerenciar conexões Azure DevOps.
   ═══════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { Modal } from '../components/Modal';
import { showToast } from '../lib/toast';
import { genAzureId, listAzureConfigs, saveAzureConfig, deleteAzureConfig, getMyAzureSettings } from '../lib/azureManagement';
import { testConnection } from '../lib/azureDevOps';
import { currentUserId } from '../lib/testManagement';
import type { AzureConfig } from '../types/azure';

function emptyConfig(): AzureConfig {
  return { id: genAzureId(), name: '', organization: '', project: '', createdBy: currentUserId(), createdAt: new Date().toISOString() };
}

type ModalState = { kind: 'create' | 'edit'; data: AzureConfig } | { kind: 'delete'; data: AzureConfig } | null;

export function AzureConfigPage() {
  const [configs, setConfigs] = useState<AzureConfig[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => { setBusy(true); setConfigs(await listAzureConfigs()); setBusy(false); };
  useEffect(() => { refresh(); }, []);

  return (
    <PageLayout module="admin" title="Conexões Azure DevOps" activeAdmin="azure" loading={busy}>
          <div className="admin-shell">
            <section className="admin-hero">
              <div>
                <h2>Integrações Azure DevOps</h2>
                <p>Cadastre as conexões org/projeto do Azure DevOps. Cada usuário configura seu próprio PAT no Perfil.</p>
              </div>
              <span className="admin-role-chip">Acesso: Administrador</span>
            </section>
            <section className="admin-content-card">
              <div className="admin-panel">
                <div className="admin-toolbar">
                  <span className="admin-count">{configs.length} conexão{configs.length !== 1 ? 'ões' : ''}</span>
                  <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'create', data: emptyConfig() })}>+ Nova Conexão</button>
                </div>
                <div className="admin-table-wrap">
                  {busy ? (
                    <p style={{ padding: 16, color: 'var(--text-secondary)' }}>Carregando…</p>
                  ) : (
                    <table className="admin-table">
                      <thead>
                        <tr><th>Nome</th><th>Organização</th><th>Projeto</th><th>Ações</th></tr>
                      </thead>
                      <tbody>
                        {configs.length === 0 ? (
                          <tr><td colSpan={4} className="modal-empty">Nenhuma conexão cadastrada.</td></tr>
                        ) : configs.map((cfg) => (
                          <tr key={cfg.id}>
                            <td><strong>{cfg.name}</strong></td>
                            <td>{cfg.organization}</td>
                            <td>{cfg.project}</td>
                            <td className="col-actions">
                              <button className="btn btn-ghost btn-xs" onClick={() => setModal({ kind: 'edit', data: { ...cfg } })}>Editar</button>
                              <button className="btn btn-danger btn-xs" onClick={() => setModal({ kind: 'delete', data: cfg })}>Excluir</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </section>
          </div>

      {(modal?.kind === 'create' || modal?.kind === 'edit') && (
        <ConfigFormModal
          mode={modal.kind}
          initial={modal.data}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); refresh(); }}
        />
      )}

      {modal?.kind === 'delete' && (
        <Modal title="Excluir Conexão" onClose={() => setModal(null)} footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn btn-danger" onClick={async () => {
              if (await deleteAzureConfig(modal.data.id)) { showToast('Conexão excluída.', 'success'); setModal(null); refresh(); }
            }}>Excluir</button>
          </>
        }>
          <p style={{ color: 'var(--text-secondary)' }}>
            Excluir a conexão <strong style={{ color: 'var(--text-primary)' }}>{modal.data.name}</strong>?{' '}
            Todos os templates vinculados serão excluídos. Esta ação não pode ser desfeita.
          </p>
        </Modal>
      )}
    </PageLayout>
  );
}

function ConfigFormModal({ mode, initial, onClose, onSaved }: {
  mode: 'create' | 'edit'; initial: AzureConfig; onClose: () => void; onSaved: () => void;
}) {
  const [v, setV] = useState<AzureConfig>(initial);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const set = <K extends keyof AzureConfig>(k: K, val: AzureConfig[K]) => setV((p) => ({ ...p, [k]: val }));

  const onTest = async () => {
    if (!v.organization || !v.project) { showToast('Preencha organização e projeto antes de testar.', 'warning'); return; }
    setTesting(true); setTestResult(null);
    const settings = await getMyAzureSettings();
    if (!settings?.pat) {
      setTesting(false);
      setTestResult({ ok: false, msg: 'Configure seu PAT no Perfil antes de testar.' });
      return;
    }
    const r = await testConnection({ organization: v.organization, project: v.project, pat: settings.pat });
    setTesting(false);
    setTestResult(r.ok ? { ok: true, msg: 'Conexão bem-sucedida!' } : { ok: false, msg: r.error ?? 'Falha na conexão.' });
  };

  const submit = async () => {
    if (!v.name.trim()) { showToast('Informe o nome da conexão.', 'warning'); return; }
    if (!v.organization.trim()) { showToast('Informe a organização.', 'warning'); return; }
    if (!v.project.trim()) { showToast('Informe o projeto.', 'warning'); return; }
    if (await saveAzureConfig({ ...v, name: v.name.trim(), organization: v.organization.trim(), project: v.project.trim() })) {
      showToast(mode === 'create' ? 'Conexão criada.' : 'Conexão salva.', 'success');
      onSaved();
    }
  };

  return (
    <Modal title={mode === 'create' ? 'Nova Conexão Azure' : 'Editar Conexão Azure'} onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={submit}>{mode === 'create' ? 'Criar' : 'Salvar'}</button>
      </>
    }>
      <div className="form-group">
        <label>Nome da Conexão *</label>
        <input type="text" value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Projeto Polaris" />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Organização *</label>
          <input type="text" value={v.organization} onChange={(e) => set('organization', e.target.value)} placeholder="minhaorg" />
        </div>
        <div className="form-group">
          <label>Projeto *</label>
          <input type="text" value={v.project} onChange={(e) => set('project', e.target.value)} placeholder="MeuProjeto" />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 20, padding: '16px', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)', background: 'var(--bg-input)' }}>
        <button className="btn btn-primary" onClick={onTest} disabled={testing} style={{ minWidth: 180 }}>
          {testing ? 'Testando…' : 'Testar Conexão'}
        </button>
        {testResult && (
          <span style={{ fontSize: 13, fontWeight: 600, color: testResult.ok ? 'var(--success)' : 'var(--error)' }}>
            {testResult.ok ? '✓' : '✗'} {testResult.msg}
          </span>
        )}
      </div>
    </Modal>
  );
}
