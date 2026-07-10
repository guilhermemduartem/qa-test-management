/* ═══════════════════════════════════════════════════════════
   ReportDataPage — "Passo a Passo / Ações" (porta de
   dados-relatorios.html + report-data.js).
   ═══════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { PageLayout } from '../components/ui/PageLayout';
import { Modal } from '../components/Modal';
import { showToast } from '../lib/toast';
import { formatDate } from '../lib/utils';
import {
  loadEntries,
  saveEntries,
  pullEntriesFromSupabase,
  upsertEntryToSupabase,
  bulkInsertToSupabase,
  deleteEntryFromSupabase,
  getCurrentCreator,
  parseImportRows,
  normalizeText,
  uid,
} from '../lib/reportData';
import type { ReportDataEntry } from '../types';

type ModalState = { kind: 'editor'; item?: ReportDataEntry } | { kind: 'import' } | null;

function truncate(str: string, max: number): string {
  const s = String(str || '');
  return s.length > max ? s.slice(0, max) + '…' : s;
}

export function ReportDataPage() {
  const [entries, setEntries] = useState<ReportDataEntry[]>([]);
  const [qTexto, setQTexto] = useState('');
  const [qAcoes, setQAcoes] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setEntries(
      [...loadEntries()].sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      ),
    );
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await pullEntriesFromSupabase();
      refresh();
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        const mt = !qTexto || e.texto.toLowerCase().includes(qTexto.toLowerCase());
        const ma = !qAcoes || (e.acoes || '').toLowerCase().includes(qAcoes.toLowerCase());
        return mt && ma;
      }),
    [entries, qTexto, qAcoes],
  );

  const handleDelete = async (id: string) => {
    const item = loadEntries().find((x) => x.id === id);
    if (!item) {
      showToast('Registro não encontrado.', 'error');
      return;
    }
    saveEntries(loadEntries().filter((x) => x.id !== id));
    await deleteEntryFromSupabase(id);
    showToast('Passo a passo excluído com sucesso!', 'success');
    refresh();
  };

  return (
    <PageLayout module="admin" title="Passo a Passo" activeAdmin="dados" loading={loading}>
          <div className="admin-shell">
            <section className="admin-hero">
              <div>
                <h2>Passo a Passo</h2>
                <p>Gerencie os passos dos dados de relatório com rastreio de autor.</p>
              </div>
              <span className="admin-role-chip">Acesso: Administrador</span>
            </section>
            <section className="admin-content-card">
              <div className="admin-panel">
                <div className="rd-section">
                  <div className="rd-section-header">
                    <span className="rd-section-title">Filtros</span>
                    <div className="rd-header-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal({ kind: 'import' })}>Importar Arquivo</button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'editor' })}>+ Novo Passo a Passo</button>
                    </div>
                  </div>
                  <div className="rd-search-bar">
                    <div className="rd-search-wrap">
                      <label className="rd-search-label">Passo a passo</label>
                      <input type="text" className="rd-search-input" placeholder="Filtrar por passo a passo…" autoComplete="off" value={qTexto} onChange={(e) => setQTexto(e.target.value)} />
                    </div>
                    <div className="rd-search-wrap">
                      <label className="rd-search-label">Ações</label>
                      <input type="text" className="rd-search-input" placeholder="Filtrar por ações…" autoComplete="off" value={qAcoes} onChange={(e) => setQAcoes(e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="rd-section rd-section--table">
                  <div className="rd-section-header">
                    <span className="rd-section-title">Registros</span>
                    <span className="rd-count">{entries.length} {entries.length === 1 ? 'registro' : 'registros'}</span>
                  </div>
                  <div className="admin-table-wrap">
                    <table className="admin-table rd-table">
                      <colgroup>
                        <col style={{ width: '35%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '20%' }} />
                      </colgroup>
                      <thead>
                        <tr><th>Passo a passo</th><th>Ações</th><th>Criado por</th><th>Data de criação</th><th className="col-actions">Operações</th></tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 ? (
                          <tr><td colSpan={5} className="modal-empty">Nenhum texto cadastrado.</td></tr>
                        ) : (
                          filtered.map((item) => (
                            <tr key={item.id}>
                              <td className="rd-cell-text" title={item.texto}>{truncate(item.texto, 65)}</td>
                              <td className="rd-cell-text" title={item.acoes || ''}>{truncate(item.acoes || '—', 65)}</td>
                              <td>{item.createdByName || '—'}</td>
                              <td>{formatDate(item.createdAt)}</td>
                              <td className="col-actions">
                                <button className="btn btn-ghost btn-xs" onClick={() => setModal({ kind: 'editor', item })}>Editar</button>
                                <button className="btn btn-danger btn-xs" onClick={() => handleDelete(item.id)}>Excluir</button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>
          </div>

      {modal?.kind === 'editor' && (
        <EditorModal item={modal.item} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />
      )}
      {modal?.kind === 'import' && (
        <ImportModal onClose={() => setModal(null)} onDone={() => { setModal(null); refresh(); }} />
      )}
    </PageLayout>
  );
}

/* ── Editor (novo/editar) ── */
function EditorModal({ item, onClose, onSaved }: { item?: ReportDataEntry; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item;
  const [texto, setTexto] = useState(item?.texto || '');
  const [acoes, setAcoes] = useState(item?.acoes || '');
  const [textoErr, setTextoErr] = useState('');
  const [acoesErr, setAcoesErr] = useState('');

  const submit = async () => {
    const t = texto.trim();
    const a = acoes.trim();
    setTextoErr('');
    setAcoesErr('');

    if (!t) { setTextoErr('Informe o texto.'); return; }
    if (!a) { setAcoesErr('Informe as ações.'); return; }

    const all = loadEntries();
    const dup = all.find((x) => normalizeText(x.texto) === normalizeText(t) && x.id !== (item?.id || ''));
    if (dup) { setTextoErr('Já existe um passo a passo com este texto.'); return; }

    const entries = loadEntries();
    if (isEdit && item) {
      const idx = entries.findIndex((x) => x.id === item.id);
      if (idx === -1) { showToast('Registro não encontrado.', 'error'); return; }
      entries[idx].texto = t;
      entries[idx].acoes = a;
      entries[idx].updatedAt = new Date().toISOString();
      saveEntries(entries);
      await upsertEntryToSupabase(entries[idx]);
      showToast('Passo a passo atualizado com sucesso!', 'success');
    } else {
      const creator = getCurrentCreator();
      const newEntry: ReportDataEntry = {
        id: uid(),
        texto: t,
        acoes: a,
        createdById: creator.id,
        createdByName: creator.name,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
      entries.push(newEntry);
      saveEntries(entries);
      await upsertEntryToSupabase(newEntry);
      showToast('Passo a passo cadastrado com sucesso!', 'success');
    }
    onSaved();
  };

  return (
    <Modal
      title={isEdit ? 'Editar Passo a Passo' : 'Novo Passo a Passo'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit}>{isEdit ? 'Salvar Alterações' : 'Salvar Passo a Passo'}</button>
        </>
      }
    >
      <div className="report-data-form report-data-modal-form">
        <div className="form-row">
          <div className="form-group">
            <label>Passo a passo *</label>
            <textarea rows={4} autoFocus value={texto} placeholder="Digite o passo a passo para dados do relatório..." className={textoErr ? 'input-invalid' : ''} onChange={(e) => { setTexto(e.target.value); setTextoErr(''); }} />
            {textoErr ? <div className="uf-field-error" style={{ display: 'block' }}>{textoErr}</div> : null}
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Ações *</label>
            <textarea rows={3} value={acoes} placeholder="Digite as ações relacionadas ao passo a passo..." className={acoesErr ? 'input-invalid' : ''} onChange={(e) => { setAcoes(e.target.value); setAcoesErr(''); }} />
            {acoesErr ? <div className="uf-field-error" style={{ display: 'block' }}>{acoesErr}</div> : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ── Importação em massa (.xlsx/.xls/.csv) ── */
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { showToast('Selecione um arquivo para importar.', 'warning'); return; }

    let rows: unknown[][] = [];
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const firstSheet = wb.SheetNames && wb.SheetNames[0];
      if (!firstSheet) { showToast('Planilha sem abas válidas.', 'error'); return; }
      rows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], { header: 1, defval: '', blankrows: false });
    } catch {
      showToast('Não foi possível ler o arquivo.', 'error');
      return;
    }

    const importedRows = parseImportRows(rows);
    if (importedRows.length === 0) {
      showToast('Nenhuma linha válida encontrada para importar.', 'warning');
      return;
    }

    const creator = getCurrentCreator();
    const entries = loadEntries();
    const existing = new Set(entries.map((x) => normalizeText(x.texto)));
    const batch = new Set<string>();

    let created = 0;
    let skipped = 0;
    const createdEntries: ReportDataEntry[] = [];

    importedRows.forEach((r) => {
      const key = normalizeText(r.texto);
      const acoesKey = normalizeText(r.acoes);
      if (!key || !acoesKey || existing.has(key) || batch.has(key)) {
        skipped++;
        return;
      }
      const newEntry: ReportDataEntry = {
        id: uid(),
        texto: r.texto,
        acoes: r.acoes,
        createdById: creator.id,
        createdByName: creator.name,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
      entries.push(newEntry);
      createdEntries.push(newEntry);
      batch.add(key);
      created++;
    });

    if (!created) {
      showToast('Nada importado: passos duplicados ou sem ações.', 'warning');
      return;
    }

    saveEntries(entries);
    await bulkInsertToSupabase(createdEntries);
    showToast(`Importação concluída: ${created} criado(s), ${skipped} ignorado(s).`, 'success');
    onDone();
  };

  return (
    <Modal
      title="Importar Passo a Passo"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit}>Importar em Massa</button>
        </>
      }
    >
      <div className="report-data-form report-data-modal-form">
        <div className="modal-input-group">
          <label>Arquivo de importação (.xlsx, .xls, .csv)</label>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" />
          <small className="rd-import-help">Use duas colunas: <strong>Passo a passo</strong> e <strong>Ações</strong>.</small>
        </div>
        <div className="modal-input-group rd-import-map">
          <div className="rd-import-col">Coluna 1: Passo a passo</div>
          <div className="rd-import-col">Coluna 2: Ações</div>
        </div>
      </div>
    </Modal>
  );
}
