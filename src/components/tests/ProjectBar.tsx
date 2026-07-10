/* ═══════════════════════════════════════════════════════════
   ProjectBar — seletor de projeto ativo + criação rápida.
   Usado na topbar das telas do módulo de Testes.
   ═══════════════════════════════════════════════════════════ */
import { useState } from 'react';
import { Modal } from '../Modal';
import { can } from '../../lib/auth';
import { showToast } from '../../lib/toast';
import { genId, currentUserId, saveProject } from '../../lib/testManagement';
import type { TestProject } from '../../types/tests';

interface ProjectBarProps {
  projects: TestProject[];
  activeId: string | null;
  onChange: (id: string) => void;
  onCreated: () => void;
}

export function ProjectBar({ projects, activeId, onChange, onCreated }: ProjectBarProps) {
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const podeCriar = can('create');

  const criar = async () => {
    if (!name.trim()) { showToast('Informe o nome do projeto.', 'warning'); return; }
    const proj: TestProject = {
      id: genId(), name: name.trim(), description: desc.trim(),
      createdBy: currentUserId(), createdAt: new Date().toISOString(),
    };
    const ok = await saveProject(proj);
    if (!ok) return;
    showToast('Projeto criado.', 'success');
    setModal(false); setName(''); setDesc('');
    onCreated();
  };

  return (
    <div className="tests-projectbar">
      <select
        className="tests-project-select"
        value={activeId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={projects.length === 0}
      >
        {projects.length === 0 ? (
          <option value="">Nenhum projeto</option>
        ) : (
          projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)
        )}
      </select>
      {podeCriar && (
        <button className="btn btn-primary btn-sm" onClick={() => setModal(true)}>+ Novo Projeto</button>
      )}

      {modal && (
        <Modal
          title="Novo Projeto de Teste"
          onClose={() => setModal(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={criar}>Criar</button>
            </>
          }
        >
          <div className="form-group">
            <label>Nome *</label>
            <input type="text" value={name} placeholder="Ex.: Portal de Vendas" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Descrição</label>
            <textarea value={desc} placeholder="Objetivo / escopo do projeto" onChange={(e) => setDesc(e.target.value)} />
          </div>
        </Modal>
      )}
    </div>
  );
}
