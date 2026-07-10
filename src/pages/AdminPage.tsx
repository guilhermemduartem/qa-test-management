/* ═══════════════════════════════════════════════════════════
   AdminPage — gestão de usuários (porta de admin.html + admin.js).
   ═══════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { Modal } from '../components/Modal';
import { showToast } from '../lib/toast';
import { Auth } from '../lib/auth';
import type { Role, User } from '../types';

const initials = (nome: string) =>
  nome.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

const ROLE_LABEL: Record<Role, string> = {
  viewer:               'Leitor',
  intern:               'Estagiário',
  qa:                   'QA',
  developer:            'Dev',
  senior_developer:     'Dev Sênior',
  tech_lead:            'Tech Lead',
  devops:               'DevOps',
  architect:            'Arquiteto',
  scrum_master:         'Scrum Master',
  product_owner:        'PO',
  product_manager:      'PM',
  engineering_manager:  'Eng. Manager',
  director_engineering: 'Diretor Eng.',
  admin:                'Admin',
  master_admin:         'Master Admin',
};
const ROLE_CLS: Record<Role, string> = {
  viewer:               'badge-viewer',
  intern:               'badge-qa-role',
  qa:                   'badge-qa-role',
  developer:            'badge-dev',
  senior_developer:     'badge-dev',
  tech_lead:            'badge-tech',
  devops:               'badge-tech',
  architect:            'badge-tech',
  scrum_master:         'badge-product',
  product_owner:        'badge-product',
  product_manager:      'badge-product',
  engineering_manager:  'badge-mgmt',
  director_engineering: 'badge-mgmt',
  admin:                'badge-admin',
  master_admin:         'badge-admin',
};

interface FormValues {
  nome: string;
  email: string;
  senha: string;
  role: Role;
  ativo: boolean;
}

type ModalState =
  | { kind: 'create' }
  | { kind: 'edit'; user: User }
  | { kind: 'delete'; user: User }
  | null;

const EMPTY_FORM: FormValues = { nome: '', email: '', senha: '', role: 'viewer', ativo: true };

export function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    Auth.listUsers().then((list) => setUsers([...list])).finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const topbarActions = (
    <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'create' })}>
      + Novo Usuário
    </button>
  );

  return (
    <PageLayout module="admin" title="Gerenciar Usuários" activeAdmin="usuarios" loading={loading} actions={topbarActions}>
      <div className="casos-table-wrap">
        <table className="tests-table">
          <thead>
            <tr><th>Nome</th><th>Email</th><th>Perfil</th><th>Status</th><th>Ações</th></tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={5} className="modal-empty">Nenhum usuário cadastrado.</td></tr>
            ) : (
              users.map((u) => {
                const avatar = u.avatarUrl || localStorage.getItem(`prof-avatar-${u.id}`) || '';
                return (
                  <tr key={u.id} className={u.ativo ? '' : 'row-inactive'}>
                    <td>
                      <div className="admin-user-cell">
                        <div className="admin-user-avatar">
                          {avatar
                            ? <img src={avatar} alt="" />
                            : <span>{initials(u.nome)}</span>
                          }
                        </div>
                        {u.nome}
                      </div>
                    </td>
                    <td className="col-email">{u.email || '—'}</td>
                    <td><span className={`role-badge ${ROLE_CLS[u.role] || ''}`}>{ROLE_LABEL[u.role] || u.role}</span></td>
                    <td><span className={`status-pill ${u.ativo ? 'pill-active' : 'pill-inactive'}`}>{u.ativo ? 'Ativo' : 'Inativo'}</span></td>
                    <td className="col-actions">
                      <button className="btn btn-ghost btn-xs" onClick={() => setModal({ kind: 'edit', user: u })}>Editar</button>
                      <button className="btn btn-danger btn-xs" onClick={() => setModal({ kind: 'delete', user: u })}>Excluir</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {(modal?.kind === 'create' || modal?.kind === 'edit') && (
        <UserFormModal
          mode={modal.kind}
          user={modal.kind === 'edit' ? modal.user : undefined}
          existingUsers={users}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); refresh(); }}
        />
      )}

      {modal?.kind === 'delete' && (
        <Modal
          title="Confirmar Exclusão"
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  const result = await Auth.deleteUser(modal.user.id);
                  if (!result.ok) { showToast(result.error || 'Erro.', 'error'); return; }
                  showToast('Usuário excluído.', 'success');
                  setModal(null);
                  refresh();
                }}
              >
                Excluir
              </button>
            </>
          }
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
            Deseja excluir o usuário <strong style={{ color: 'var(--text-primary)' }}>{modal.user.nome}</strong>? Esta ação não pode ser desfeita.
          </p>
        </Modal>
      )}
    </PageLayout>
  );
}

/* ── Formulário de usuário (criar/editar) ── */
function UserFormModal({
  mode,
  user,
  existingUsers,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  user?: User;
  existingUsers: User[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = mode === 'edit';
  const [v, setV] = useState<FormValues>(
    user
      ? { nome: user.nome, email: user.email, senha: '', role: user.role, ativo: user.ativo }
      : EMPTY_FORM,
  );
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');

  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) => {
    setV((prev) => ({ ...prev, [k]: val }));
    setErrors((prev) => {
      const { [k]: _omit, ...rest } = prev;
      return rest;
    });
    setFormError('');
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    const nome = v.nome.trim();
    const email = v.email.trim();
    const senha = v.senha;
    const normEmail = email.toLowerCase();

    if (!nome) e.nome = 'Informe o nome completo.';
    if (mode === 'create') {
      if (!email) e.email = 'Informe o email.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Email inválido.';
      else if (existingUsers.some((u) => (u.email || '').trim().toLowerCase() === normEmail)) e.email = 'Este email já está em uso.';
    }

    if (mode === 'create' && !senha) e.senha = 'Informe a senha.';
    if (senha && senha.length < 6) e.senha = 'A senha deve ter no mínimo 6 caracteres.';

    setErrors(e);
    if (Object.keys(e).length) {
      setFormError('Revise os campos destacados para continuar.');
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (!validate()) return;
    if (mode === 'create') {
      const result = await Auth.createUser({ nome: v.nome, email: v.email, senha: v.senha, role: v.role, ativo: v.ativo });
      if (!result.ok) { setFormError(result.error || 'Erro.'); return; }
      showToast('Usuário criado com sucesso!', 'success');
      onSaved();
    } else if (user) {
      const fields: { nome: string; role: Role; ativo: boolean; senha?: string } = { nome: v.nome, role: v.role, ativo: v.ativo };
      if (v.senha) fields.senha = v.senha;
      const result = await Auth.updateUser(user.id, fields);
      if (!result.ok) { setFormError(result.error || 'Erro.'); return; }
      showToast('Usuário atualizado!', 'success');
      onSaved();
    }
  };

  const fieldError = (k: string) =>
    errors[k] ? <div className="uf-field-error" style={{ display: 'block' }}>{errors[k]}</div> : null;

  return (
    <Modal
      title={isEdit ? 'Editar Usuário' : 'Novo Usuário'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit}>{isEdit ? 'Salvar' : 'Criar Usuário'}</button>
        </>
      }
    >
      <div className="user-form">
        <div className="user-form-section">
          <h4 className="user-form-title">Dados principais</h4>
          <p className="user-form-subtitle">Preencha as informações de identificação e acesso.</p>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Nome completo *</label>
            <input type="text" value={v.nome} placeholder="Nome completo" className={errors.nome ? 'input-invalid' : ''} onChange={(e) => set('nome', e.target.value)} />
            <div className="uf-hint">Nome exibido no sistema.</div>
            {fieldError('nome')}
          </div>
          <div className="form-group">
            <label>Email *</label>
            <input
              type="email"
              value={v.email}
              placeholder="email@exemplo.com"
              readOnly={isEdit}
              style={isEdit ? { opacity: 0.6 } : undefined}
              className={errors.email ? 'input-invalid' : ''}
              onChange={(e) => set('email', e.target.value)}
            />
            <div className="uf-hint">{isEdit ? 'O e-mail (login) não pode ser alterado aqui.' : 'Será o login de acesso do usuário.'}</div>
            {fieldError('email')}
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Senha{isEdit ? '' : ' *'}</label>
            <div className="uf-password-wrap">
              <input
                type={showPass ? 'text' : 'password'}
                autoComplete="new-password"
                value={v.senha}
                placeholder={isEdit ? 'Deixe em branco para manter a atual' : 'Mínimo 6 caracteres'}
                className={errors.senha ? 'input-invalid' : ''}
                onChange={(e) => set('senha', e.target.value)}
              />
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowPass((s) => !s)}>{showPass ? 'Ocultar' : 'Mostrar'}</button>
            </div>
            <div className="uf-hint">{isEdit ? 'Preencha apenas se quiser trocar a senha.' : 'Senha com no mínimo 6 caracteres.'}</div>
            {fieldError('senha')}
          </div>
        </div>
        <div className="user-form-section user-form-section-tight">
          <h4 className="user-form-title">Permissões</h4>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Perfil</label>
            <select value={v.role} onChange={(e) => set('role', e.target.value as Role)}>
              <optgroup label="Somente leitura">
                <option value="viewer">Leitor</option>
              </optgroup>
              <optgroup label="Membros">
                <option value="intern">Estagiário</option>
                <option value="qa">QA</option>
                <option value="developer">Dev</option>
                <option value="senior_developer">Dev Sênior</option>
                <option value="tech_lead">Tech Lead</option>
                <option value="devops">DevOps</option>
                <option value="architect">Arquiteto</option>
                <option value="scrum_master">Scrum Master</option>
                <option value="product_owner">PO</option>
                <option value="product_manager">PM</option>
                <option value="engineering_manager">Eng. Manager</option>
                <option value="director_engineering">Diretor Eng.</option>
              </optgroup>
              <optgroup label="Administração">
                <option value="admin">Admin</option>
                <option value="master_admin">Master Admin</option>
              </optgroup>
            </select>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={v.ativo ? '1' : '0'} onChange={(e) => set('ativo', e.target.value === '1')}>
              <option value="1">Ativo</option>
              <option value="0">Inativo</option>
            </select>
          </div>
        </div>
        {formError ? <div className="uf-error" style={{ display: 'block' }}>{formError}</div> : null}
      </div>
    </Modal>
  );
}
