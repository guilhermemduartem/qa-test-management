/* ═══════════════════════════════════════════════════════════
   ProfilePage — Perfil do usuário: foto, senha segura, PAT Azure.
   ═══════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { showToast } from '../lib/toast';
import { Auth, currentUser } from '../lib/auth';
import {
  getMyAzureSettings, getMyAzureSettingsMeta,
  saveMyAzureSettings, deleteMyAzureSettings, listAzureConfigs,
} from '../lib/azureManagement';
import { testConnection } from '../lib/azureDevOps';
import type { AzureConfig } from '../types/azure';
import type { Role } from '../types';

/* ── Mapas de role ── */
const ROLE_LABEL: Record<Role, string> = {
  viewer: 'Leitor', intern: 'Estagiário', qa: 'QA',
  developer: 'Dev', senior_developer: 'Dev Sênior', tech_lead: 'Tech Lead',
  devops: 'DevOps', architect: 'Arquiteto', scrum_master: 'Scrum Master',
  product_owner: 'PO', product_manager: 'PM',
  engineering_manager: 'Eng. Manager', director_engineering: 'Diretor Eng.',
  admin: 'Administrador', master_admin: 'Master Admin',
};
const ROLE_CLS: Record<Role, string> = {
  viewer: 'badge-viewer', intern: 'badge-qa-role', qa: 'badge-qa-role',
  developer: 'badge-dev', senior_developer: 'badge-dev',
  tech_lead: 'badge-tech', devops: 'badge-tech', architect: 'badge-tech',
  scrum_master: 'badge-product', product_owner: 'badge-product', product_manager: 'badge-product',
  engineering_manager: 'badge-mgmt', director_engineering: 'badge-mgmt',
  admin: 'badge-admin', master_admin: 'badge-admin',
};

const initials = (nome: string) =>
  nome.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

/* ── Validação de força de senha ── */
interface PasswordChecks {
  minLen: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}
const checkPassword = (p: string): PasswordChecks => ({
  minLen:     p.length >= 8,
  hasUpper:   /[A-Z]/.test(p),
  hasLower:   /[a-z]/.test(p),
  hasNumber:  /[0-9]/.test(p),
  hasSpecial: /[^A-Za-z0-9]/.test(p),
});
const strengthScore = (c: PasswordChecks) =>
  [c.minLen, c.hasUpper, c.hasLower, c.hasNumber, c.hasSpecial].filter(Boolean).length;

const STRENGTH_LABELS = ['', 'Muito fraca', 'Fraca', 'Média', 'Forte', 'Muito forte'];
const STRENGTH_COLORS = ['', '#EF4444', '#F97316', '#EAB308', '#3B82F6', '#22C55E'];

export function ProfilePage() {
  const session = currentUser();
  const fileRef = useRef<HTMLInputElement>(null);

  /* Foto de perfil — cache local + persistência no banco */
  const avatarKey = `prof-avatar-${session?.id ?? 'anon'}`;
  const [avatarUrl, setAvatarUrl] = useState<string>(() => localStorage.getItem(avatarKey) ?? '');

  /* Azure */
  const [hasPat, setHasPat]             = useState(false);
  const [azureEmail, setAzureEmail]     = useState('');
  const [newEmail, setNewEmail]         = useState('');
  const [newPat, setNewPat]             = useState('');
  const [showNewPat, setShowNewPat]     = useState(false);
  const [configs, setConfigs]           = useState<AzureConfig[]>([]);
  const [loadingAzure, setLoadingAzure] = useState(true);
  const [savingAzure, setSavingAzure]   = useState(false);
  const [deletingAzure, setDeletingAzure] = useState(false);
  const [testing, setTesting]           = useState<string | null>(null);
  const [testResults, setTestResults]   = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [confirmRemove, setConfirmRemove] = useState(false);

  /* Senha */
  const [newPassword, setNewPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPass, setShowNewPass]       = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [savingPass, setSavingPass]         = useState(false);

  useEffect(() => {
    Promise.all([getMyAzureSettingsMeta(), listAzureConfigs()]).then(([meta, cfgs]) => {
      if (meta) { setHasPat(meta.hasSettings); setAzureEmail(meta.azureEmail); }
      setConfigs(cfgs);
      setLoadingAzure(false);
    });
    if (session?.id) {
      Auth.getAvatar(session.id).then((url) => {
        if (url) { setAvatarUrl(url); localStorage.setItem(avatarKey, url); }
      });
    }
  }, []);

  /* Foto */
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Imagem muito grande (máx 2 MB).', 'warning'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const url = reader.result as string;
      setAvatarUrl(url);
      if (session?.id) {
        const r = await Auth.updateAvatar(session.id, url);
        if (!r.ok) { showToast('Erro ao salvar foto.', 'error'); return; }
      }
      showToast('Foto atualizada.', 'success');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  const removeAvatar = async () => {
    setAvatarUrl('');
    localStorage.removeItem(avatarKey);
    if (session?.id) await Auth.updateAvatar(session.id, '');
  };

  /* Azure */
  const savePat = async () => {
    if (!newEmail.trim() || !newPat.trim()) { showToast('Preencha o e-mail e o PAT.', 'warning'); return; }
    setSavingAzure(true);
    const ok = await saveMyAzureSettings(newEmail.trim(), newPat.trim());
    if (ok) { setHasPat(true); setAzureEmail(newEmail.trim()); setNewEmail(''); setNewPat(''); }
    setSavingAzure(false);
    showToast(ok ? 'PAT salvo.' : 'Erro ao salvar.', ok ? 'success' : 'error');
  };
  const removePat = async () => {
    setDeletingAzure(true);
    const ok = await deleteMyAzureSettings();
    if (ok) { setHasPat(false); setAzureEmail(''); setTestResults({}); setConfirmRemove(false); }
    setDeletingAzure(false);
    showToast(ok ? 'PAT removido.' : 'Erro ao remover.', ok ? 'success' : 'error');
  };
  const testCfg = async (cfg: AzureConfig) => {
    setTesting(cfg.id);
    const settings = await getMyAzureSettings();
    if (!settings?.pat) { showToast('Configure seu PAT antes de testar.', 'warning'); setTesting(null); return; }
    const r = await testConnection({ organization: cfg.organization, project: cfg.project, pat: settings.pat });
    setTestResults((prev) => ({ ...prev, [cfg.id]: r.ok ? { ok: true, msg: 'OK' } : { ok: false, msg: r.error ?? 'Falha' } }));
    setTesting(null);
  };

  /* Senha */
  const checks  = checkPassword(newPassword);
  const score   = newPassword ? strengthScore(checks) : 0;
  const allMet  = score === 5;
  const matches = newPassword === confirmPassword;

  const savePassword = async () => {
    if (!allMet) { showToast('A senha não atende os requisitos de segurança.', 'warning'); return; }
    if (!matches) { showToast('As senhas não coincidem.', 'warning'); return; }
    if (!session) return;
    setSavingPass(true);
    const r = await Auth.updateUser(session.id, { senha: newPassword });
    setSavingPass(false);
    if (r.ok) { setNewPassword(''); setConfirmPassword(''); showToast('Senha alterada com sucesso.', 'success'); }
    else showToast(r.error ?? 'Erro ao alterar senha.', 'error');
  };

  if (!session) return null;

  return (
    <PageLayout module="admin" title="Meu Perfil" breadcrumb="Conta" activeAdmin="perfil" loading={loadingAzure}>
      <div className="prof-page">

        {/* ── Hero ── */}
        <div className="prof-hero">
          {/* Avatar clicável */}
          <div className="prof-avatar-wrap" onClick={() => fileRef.current?.click()} title="Clique para alterar a foto">
            {avatarUrl
              ? <img src={avatarUrl} alt="Avatar" className="prof-hero-avatar prof-avatar-img" />
              : <div className="prof-hero-avatar">{initials(session.nome)}</div>
            }
            <span className="prof-avatar-overlay">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </span>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
          </div>

          <div className="prof-hero-info">
            <div className="prof-hero-name">{session.nome}</div>
            <div className="prof-hero-email">{session.login}</div>
            {avatarUrl && (
              <button className="prof-remove-photo" onClick={removeAvatar}>Remover foto</button>
            )}
          </div>
          <span className={`role-badge prof-hero-badge ${ROLE_CLS[session.role] ?? 'badge-viewer'}`}>
            {ROLE_LABEL[session.role] ?? session.role}
          </span>
        </div>

        {/* ── Segurança ── */}
        <div className="prof-card">
          <div className="prof-card-header">
            <span className="prof-card-icon prof-icon-security">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </span>
            <span className="prof-card-title">Segurança</span>
          </div>
          <div className="prof-card-body">
            <p className="prof-hint">Para alterar nome ou e-mail, contate um administrador.</p>

            <div className="prof-pass-fields">
              {/* Nova senha */}
              <div className="form-group">
                <label>Nova Senha</label>
                <div className="uf-password-wrap">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPassword}
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowNewPass((s) => !s)}>
                    {showNewPass ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>

                {/* Barra de força */}
                {newPassword && (
                  <div className="prof-strength">
                    <div className="prof-strength-bar">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="prof-strength-seg"
                          style={{ background: i <= score ? STRENGTH_COLORS[score] : undefined }} />
                      ))}
                    </div>
                    <span className="prof-strength-label" style={{ color: STRENGTH_COLORS[score] }}>
                      {STRENGTH_LABELS[score]}
                    </span>
                  </div>
                )}

                {/* Critérios em linha */}
                {newPassword && (
                  <div className="prof-criteria-grid">
                    <span className={checks.minLen    ? 'met' : ''}>8+ caracteres</span>
                    <span className={checks.hasUpper  ? 'met' : ''}>Maiúscula (ex: A, B)</span>
                    <span className={checks.hasLower  ? 'met' : ''}>Minúscula (ex: a, b)</span>
                    <span className={checks.hasNumber ? 'met' : ''}>Número (ex: 1, 2)</span>
                    <span className={checks.hasSpecial? 'met' : ''}>Especial (ex: !@#$)</span>
                  </div>
                )}
              </div>

              {/* Confirmar senha */}
              <div className="form-group">
                <label>Confirmar Senha</label>
                <div className="uf-password-wrap">
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    value={confirmPassword}
                    placeholder="Repita a senha"
                    autoComplete="new-password"
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && savePassword()}
                    style={confirmPassword ? { borderColor: matches ? 'var(--success)' : 'var(--error)' } : undefined}
                  />
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowConfirmPass((s) => !s)}>
                    {showConfirmPass ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                {confirmPassword && !matches && (
                  <div className="prof-field-error">As senhas não coincidem</div>
                )}
              </div>

              {/* Botão — coluna 2, linha seguinte */}
              <button
                className="btn btn-primary btn-sm"
                style={{ gridColumn: '1 / -1', justifySelf: 'center' }}
                onClick={savePassword}
                disabled={savingPass || !newPassword || !confirmPassword || !allMet || !matches}
              >
                {savingPass ? 'Salvando…' : 'Alterar Senha'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Azure DevOps ── */}
        <div className="prof-card">
          <div className="prof-card-header">
            <span className="prof-card-icon prof-icon-azure">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12.5l-10 6-10-6V7l10 6 10-6v5.5z" /><path d="M2 7l10-5 10 5" />
              </svg>
            </span>
            <span className="prof-card-title">Azure DevOps</span>
            {hasPat && (
              <span className="prof-pat-status">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                PAT ativo
              </span>
            )}
          </div>
          <div className="prof-card-body">
            <p className="prof-hint">
              O PAT (Personal Access Token) é sua credencial pessoal no Azure DevOps — necessário para criar e sincronizar bugs.
              Gere-o em <strong>Azure DevOps → User Settings → Personal Access Tokens</strong>.
            </p>

            {hasPat ? (
              <div className="prof-pat-configured">
                <div className="prof-pat-info">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="prof-pat-label">Identidade Azure</div>
                    <div className="prof-pat-value">{azureEmail || '—'}</div>
                  </div>
                  {!confirmRemove ? (
                    <button className="btn btn-danger btn-xs" onClick={() => setConfirmRemove(true)}>
                      Remover PAT
                    </button>
                  ) : (
                    <div className="prof-pat-confirm">
                      <span className="prof-pat-confirm-msg">Tem certeza?</span>
                      <button className="btn btn-danger btn-xs" onClick={removePat} disabled={deletingAzure}>
                        {deletingAzure ? '…' : 'Sim, remover'}
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={() => setConfirmRemove(false)}>
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="prof-pat-form">
                <div className="form-group">
                  <label>E-mail / Identidade Azure</label>
                  <input type="text" autoComplete="off" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="seu@email.azure.com" />
                </div>
                <div className="form-group">
                  <label>Personal Access Token (PAT)</label>
                  <div className="uf-password-wrap">
                    <input
                      type={showNewPat ? 'text' : 'password'}
                      value={newPat}
                      onChange={(e) => setNewPat(e.target.value)}
                      placeholder="Cole seu PAT aqui"
                      autoComplete="off"
                    />
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowNewPat((s) => !s)}>
                      {showNewPat ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={savePat} disabled={savingAzure}>
                  {savingAzure ? 'Salvando…' : 'Salvar PAT'}
                </button>
              </div>
            )}

            {configs.length > 0 && (
              <div className="prof-connections">
                <div className="prof-connections-title">Testar conexões disponíveis</div>
                {!hasPat && <p className="prof-hint" style={{ marginBottom: 10 }}>Configure um PAT para testar as conexões.</p>}
                <div className="prof-connections-list">
                  {configs.map((cfg) => {
                    const r = testResults[cfg.id];
                    return (
                      <div key={cfg.id} className="prof-connection-row">
                        <div className="prof-connection-info">
                          <span className="prof-connection-name">{cfg.name}</span>
                          <span className="prof-connection-sub">{cfg.organization} / {cfg.project}</span>
                        </div>
                        <div className="prof-connection-actions">
                          {r && (
                            <span className={`prof-connection-result ${r.ok ? 'ok' : 'fail'}`}>
                              {r.ok ? '✓ OK' : `✗ ${r.msg}`}
                            </span>
                          )}
                          <button className="btn btn-ghost btn-xs" onClick={() => testCfg(cfg)} disabled={!!testing || !hasPat}>
                            {testing === cfg.id ? '…' : 'Testar'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {configs.length === 0 && !loadingAzure && (
              <p className="prof-hint" style={{ marginTop: 16 }}>
                Nenhuma conexão Azure configurada. Peça ao administrador para cadastrar uma.
              </p>
            )}
          </div>
        </div>

      </div>
    </PageLayout>
  );
}
