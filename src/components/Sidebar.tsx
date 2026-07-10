/* ═══════════════════════════════════════════════════════════
   Sidebar — navegação lateral compartilhada (Relatórios + Admin).
   No ReportPage recebe reportActions; nas páginas admin, os itens
   de Relatórios navegam para "/".
   ═══════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { Auth } from '../lib/auth';
import type { Role } from '../types';
import { useTheme } from '../hooks/useTheme';

const ROLE_LABEL: Record<Role, string> = {
  viewer: 'Leitor', intern: 'Estagiário', qa: 'QA',
  developer: 'Dev', senior_developer: 'Dev Sênior', tech_lead: 'Tech Lead',
  devops: 'DevOps', architect: 'Arquiteto', scrum_master: 'Scrum Master',
  product_owner: 'PO', product_manager: 'PM',
  engineering_manager: 'Eng. Manager', director_engineering: 'Diretor Eng.',
  admin: 'Admin', master_admin: 'Master Admin',
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

export interface ReportActions {
  scrollTo: (id: string) => void;
  saveTemplate: () => void;
  loadTemplate: () => void;
  history: () => void;
  importJSON: () => void;
  exportJSON: () => void;
}

export type ToolKey =
  | 'cpf' | 'cnpj' | 'rg' | 'cartao' | 'fileid'
  | 'ofx' | 'endereco' | 'validador-nf' | 'collection';

export type TestKey =
  | 'dashboard' | 'casos' | 'runs' | 'planos' | 'rastreabilidade'
  | 'defeitos' | 'melhorias' | 'exploratorio' | 'relatorios' | 'azure-cards';

export type ApiKey = 'healthcheck' | 'runner' | 'config' | 'bulk-import' | 'bulk-import-runs';

interface SidebarProps {
  reportActions?: ReportActions;
  activeAdmin?: 'usuarios' | 'dados' | 'azure' | 'perfil' | 'azure-templates';
  activeTool?: ToolKey;
  activeTest?: TestKey;
  activeApi?: ApiKey;
  canWrite?: boolean;
}

/* ── Ícones ── */
const Chevron = () => (
  <svg className="nav-parent-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const IcoTests = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
    <rect x="9" y="3" width="6" height="4" rx="1" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
const IcoReport = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);
const IcoAdmin = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const IcoTools = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  </svg>
);
const IcoApis = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);
const IcoChevronLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const IcoChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

interface ToolItem { key: ToolKey; label: string; path: string }
const TOOL_CATEGORIES: { label: string; items: ToolItem[] }[] = [
  {
    label: 'Geradores',
    items: [
      { key: 'cpf',    label: 'CPF',             path: '/ferramentas/cpf' },
      { key: 'cnpj',   label: 'CNPJ',            path: '/ferramentas/cnpj' },
      { key: 'rg',     label: 'RG',              path: '/ferramentas/rg' },
      { key: 'cartao', label: 'Cartão de Crédito', path: '/ferramentas/cartao' },
    ],
  },
  {
    label: 'Utilitários',
    items: [
      { key: 'fileid',   label: 'FileID Formatter', path: '/ferramentas/fileid' },
      { key: 'ofx',      label: 'OFX → Base64',     path: '/ferramentas/ofx' },
      { key: 'endereco', label: 'Endereço EUA',      path: '/ferramentas/endereco' },
    ],
  },
  {
    label: 'Validador',
    items: [{ key: 'validador-nf', label: 'CNAB/NF-e', path: '/ferramentas/validador-nf' }],
  },
  {
    label: 'Collection',
    items: [{ key: 'collection', label: 'Motor de Busca', path: '/ferramentas/collection' }],
  },
];

const TEST_ITEMS: { key: TestKey; label: string; path: string }[] = [
  { key: 'dashboard',      label: 'Dashboard',      path: '/testes' },
  { key: 'planos',         label: 'Planejamento',   path: '/testes/planos' },
  { key: 'casos',          label: 'Casos de Teste', path: '/testes/casos' },
  { key: 'runs',           label: 'Execuções',      path: '/testes/runs' },
  { key: 'exploratorio',   label: 'Exploratório',   path: '/testes/exploratorio' },
  { key: 'defeitos',       label: 'Bug',            path: '/testes/defeitos' },
  { key: 'melhorias',      label: 'Melhoria',       path: '/testes/melhorias' },
  { key: 'azure-cards',    label: 'Comentários',    path: '/testes/azure-cards' },
  { key: 'rastreabilidade',label: 'Rastreabilidade',path: '/testes/rastreabilidade' },
  { key: 'relatorios',     label: 'Relatórios',     path: '/testes/relatorios' },
];

const initials = (nome: string) =>
  nome.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

export function Sidebar({ reportActions, activeAdmin, activeTool, activeTest, activeApi, canWrite = true }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isAdmin = session?.role === 'admin' || session?.role === 'master_admin';

  const [rail, setRail] = useState(() => localStorage.getItem('sidebar-rail') === '1');
  const toggleRail = () => setRail((v) => { localStorage.setItem('sidebar-rail', v ? '0' : '1'); return !v; });

  const avatarKey = session ? `prof-avatar-${session.id}` : '';
  const [avatarUrl, setAvatarUrl] = useState(() => (session ? (localStorage.getItem(`prof-avatar-${session.id}`) ?? '') : ''));
  useEffect(() => {
    if (!session?.id) return;
    Auth.getAvatar(session.id).then((url) => {
      if (url !== null) { setAvatarUrl(url); localStorage.setItem(avatarKey, url); }
    });
  }, [session?.id]);

  const isReportRoute = location.pathname.startsWith('/relatorio');
  const [relOpen, setRelOpen]         = useState(isReportRoute);
  const [admOpen, setAdmOpen]         = useState(Boolean(activeAdmin));
  const [admDadosOpen, setAdmDadosOpen] = useState(activeAdmin === 'dados');
  const [admIntOpen, setAdmIntOpen]   = useState(activeAdmin === 'azure' || activeAdmin === 'azure-templates');
  const [admAzureOpen, setAdmAzureOpen] = useState(activeAdmin === 'azure' || activeAdmin === 'azure-templates');
  const [toolsOpen, setToolsOpen]     = useState(Boolean(activeTool));
  const [testsOpen, setTestsOpen]     = useState(Boolean(activeTest));
  const [apisOpen, setApisOpen]       = useState(Boolean(activeApi));
  const [suporteOpen, setSuporteOpen] = useState(activeApi === 'bulk-import' || activeApi === 'bulk-import-runs');
  const activeCategory = TOOL_CATEGORIES.find((c) => c.items.some((i) => i.key === activeTool))?.label ?? null;
  const [openCategory, setOpenCategory] = useState<string | null>(activeCategory);

  useEffect(() => { setRelOpen(isReportRoute); }, [isReportRoute]);

  const goReport = () => navigate('/relatorio');
  const ra = reportActions;

  return (
    <aside className={`sidebar${rail ? ' rail' : ''}`} id="sidebar">

      {/* ── Logo + toggle ── */}
      <div className="sidebar-logo">
        <div className="logo-icon">
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <span className="logo-text">QA<strong>Reporter</strong></span>
        <button className="sidebar-rail-toggle" onClick={toggleRail} title={rail ? 'Expandir menu' : 'Recolher menu'}>
          {rail ? <IcoChevronRight /> : <IcoChevronLeft />}
        </button>
      </div>

      {/* ── Gestão de Testes ── */}
      <div className="sidebar-group">
        <button
          className={`nav-parent${testsOpen && !rail ? ' open' : ''}${activeTest ? ' group-active' : ''}`}
          onClick={() => { if (rail) { setRail(false); localStorage.setItem('sidebar-rail','0'); setTestsOpen(true); } else setTestsOpen((v) => !v); }}
          title="Gestão de Testes"
        >
          <span className="nav-parent-icon"><IcoTests /></span>
          <span className="nav-parent-label">Gestão de Testes</span>
          <Chevron />
        </button>
        <div className={`nav-submenu${testsOpen && !rail ? ' open' : ''}`}>
          {TEST_ITEMS.map((item) => (
            <button key={item.key} data-navpath={item.path} className={`nav-btn${activeTest === item.key ? ' active' : ''}`} onClick={() => navigate(item.path)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Relatórios ── */}
      <div className="sidebar-group">
        <button
          className={`nav-parent${relOpen && !rail ? ' open' : ''}${isReportRoute ? ' group-active' : ''}`}
          onClick={() => { if (rail) { setRail(false); localStorage.setItem('sidebar-rail','0'); setRelOpen(true); } else { setRelOpen((v) => !v); goReport(); } }}
          title="Relatórios"
        >
          <span className="nav-parent-icon"><IcoReport /></span>
          <span className="nav-parent-label">Relatórios</span>
          <Chevron />
        </button>
        <div className={`nav-submenu${relOpen && !rail ? ' open' : ''}`}>
          <button data-navpath="/relatorio" className="nav-btn" onClick={() => (ra ? ra.scrollTo('section-company') : goReport())}>Empresa</button>
          <button data-navpath="/relatorio" className="nav-btn" onClick={() => (ra ? ra.scrollTo('section-story') : goReport())}>User Story</button>
          <button data-navpath="/relatorio" className="nav-btn" onClick={() => (ra ? ra.scrollTo('section-criteria') : goReport())}>Critérios</button>
          <button data-navpath="/relatorio" className="nav-btn" onClick={() => (ra ? ra.scrollTo('section-additional') : goReport())}>Dados Adicionais</button>
          <div className="nav-submenu-divider" />
          {canWrite && <button data-navpath="/relatorio" className="nav-btn" onClick={() => (ra ? ra.saveTemplate() : goReport())}>Salvar Template</button>}
          <button data-navpath="/relatorio" className="nav-btn" onClick={() => (ra ? ra.loadTemplate() : goReport())}>Carregar Template</button>
          <button data-navpath="/relatorio" className="nav-btn" onClick={() => (ra ? ra.history() : goReport())}>Histórico</button>
          <div className="nav-submenu-divider" />
          {canWrite && <button data-navpath="/relatorio" className="nav-btn" onClick={() => (ra ? ra.importJSON() : goReport())}>Importar JSON</button>}
          {canWrite && <button data-navpath="/relatorio" className="nav-btn" onClick={() => (ra ? ra.exportJSON() : goReport())}>Exportar JSON</button>}
        </div>
      </div>

      {/* ── Administração ── */}
      {isAdmin && (
        <div className="sidebar-group">
          <button
            className={`nav-parent${admOpen && !rail ? ' open' : ''}${activeAdmin ? ' group-active' : ''}`}
            onClick={() => { if (rail) { setRail(false); localStorage.setItem('sidebar-rail','0'); setAdmOpen(true); } else setAdmOpen((v) => !v); }}
            title="Administração"
          >
            <span className="nav-parent-icon"><IcoAdmin /></span>
            <span className="nav-parent-label">Administração</span>
            <Chevron />
          </button>
          <div className={`nav-submenu${admOpen && !rail ? ' open' : ''}`}>
            <button data-navpath="/admin" className={`nav-btn${activeAdmin === 'usuarios' ? ' active' : ''}`} onClick={() => navigate('/admin')}>Usuários</button>
            <button className={`nav-parent nav-parent-nested${admIntOpen ? ' open' : ''}`} onClick={() => setAdmIntOpen((v) => !v)}>
              Integrações<Chevron />
            </button>
            <div className={`nav-submenu nav-submenu-nested${admIntOpen ? ' open' : ''}`}>
              <button className={`nav-parent nav-parent-nested2${admAzureOpen ? ' open' : ''}`} onClick={() => setAdmAzureOpen((v) => !v)}>
                Azure<Chevron />
              </button>
              <div className={`nav-submenu nav-submenu-nested2${admAzureOpen ? ' open' : ''}`}>
                <button data-navpath="/admin/azure" className={`nav-btn${activeAdmin === 'azure' ? ' active' : ''}`} onClick={() => navigate('/admin/azure')}>Azure DevOps</button>
                <button data-navpath="/testes/azure-templates" className={`nav-btn${activeAdmin === 'azure-templates' ? ' active' : ''}`} onClick={() => navigate('/testes/azure-templates')}>Templates Azure</button>
              </div>
            </div>
            <button className="nav-parent nav-parent-nested" onClick={() => setAdmDadosOpen((v) => !v)}>
              Dados do Relatórios<Chevron />
            </button>
            <div className={`nav-submenu nav-submenu-nested${admDadosOpen ? ' open' : ''}`}>
              <button data-navpath="/dados-relatorios" className={`nav-btn${activeAdmin === 'dados' ? ' active' : ''}`} onClick={() => navigate('/dados-relatorios')}>Passo a Passo</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Ferramentas ── */}
      <div className="sidebar-group">
        <button
          className={`nav-parent${toolsOpen && !rail ? ' open' : ''}${activeTool ? ' group-active' : ''}`}
          onClick={() => { if (rail) { setRail(false); localStorage.setItem('sidebar-rail','0'); setToolsOpen(true); } else setToolsOpen((v) => !v); }}
          title="Ferramentas"
        >
          <span className="nav-parent-icon"><IcoTools /></span>
          <span className="nav-parent-label">Ferramentas</span>
          <Chevron />
        </button>
        <div className={`nav-submenu${toolsOpen && !rail ? ' open' : ''}`}>
          {TOOL_CATEGORIES.map((cat) => {
            const catOpen = openCategory === cat.label;
            return (
              <div key={cat.label}>
                <button className={`nav-parent nav-parent-nested${catOpen ? ' open' : ''}`} onClick={() => setOpenCategory((cur) => (cur === cat.label ? null : cat.label))}>
                  {cat.label}<Chevron />
                </button>
                <div className={`nav-submenu nav-submenu-nested${catOpen ? ' open' : ''}`}>
                  {cat.items.map((item) => (
                    <button key={item.key} data-navpath={item.path} className={`nav-btn${activeTool === item.key ? ' active' : ''}`} onClick={() => navigate(item.path)}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── APIs ── */}
      <div className="sidebar-group">
        <button
          className={`nav-parent${apisOpen && !rail ? ' open' : ''}${activeApi ? ' group-active' : ''}`}
          onClick={() => { if (rail) { setRail(false); localStorage.setItem('sidebar-rail','0'); setApisOpen(true); } else setApisOpen((v) => !v); }}
          title="APIs"
        >
          <span className="nav-parent-icon"><IcoApis /></span>
          <span className="nav-parent-label">APIs</span>
          <Chevron />
        </button>
        <div className={`nav-submenu${apisOpen && !rail ? ' open' : ''}`}>
          <button data-navpath="/apis/healthcheck" className={`nav-btn${activeApi === 'healthcheck' ? ' active' : ''}`} onClick={() => navigate('/apis/healthcheck')}>Health Check</button>
          <button data-navpath="/apis/runner" className={`nav-btn${activeApi === 'runner' ? ' active' : ''}`} onClick={() => navigate('/apis/runner')}>APIs</button>
          <button data-navpath="/apis/config" className={`nav-btn${activeApi === 'config' ? ' active' : ''}`} onClick={() => navigate('/apis/config')}>Configuração</button>
          <button className={`nav-parent nav-parent-nested${suporteOpen ? ' open' : ''}`} onClick={() => setSuporteOpen((v) => !v)}>
            Suporte<Chevron />
          </button>
          <div className={`nav-submenu nav-submenu-nested${suporteOpen ? ' open' : ''}`}>
            {isAdmin && (
              <button data-navpath="/apis/suporte/importacao-massiva" className={`nav-btn${activeApi === 'bulk-import' ? ' active' : ''}`} onClick={() => navigate('/apis/suporte/importacao-massiva')}>Importação Massiva</button>
            )}
            <button data-navpath="/apis/suporte/runs" className={`nav-btn${activeApi === 'bulk-import-runs' ? ' active' : ''}`} onClick={() => navigate('/apis/suporte/runs')}>Runs</button>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="sidebar-footer">
        {session && (
          <div data-navpath="/perfil" className="user-info-badge" style={{ cursor: 'pointer' }} onClick={() => navigate('/perfil')} title={`${session.nome} — ${ROLE_LABEL[session.role] ?? session.role}`}>
            {avatarUrl
              ? <img src={avatarUrl} alt="" className="user-avatar user-avatar-img" />
              : <span className="user-avatar">{initials(session.nome)}</span>
            }
            <span className="user-info-name">{session.nome}</span>
          </div>
        )}
        <button className="theme-toggle" title="Sair" style={{ marginBottom: 6 }} onClick={() => { logout(); navigate('/login', { replace: true }); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          <span>Sair</span>
        </button>
        <button className="theme-toggle" title={theme === 'dark' ? 'Tema Claro' : 'Tema Escuro'} onClick={toggleTheme}>
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx={12} cy={12} r={5} />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          )}
          <span>{theme === 'dark' ? 'Tema Claro' : 'Tema Escuro'}</span>
        </button>
      </div>
    </aside>
  );
}
