/* ═══════════════════════════════════════════════════════════
   PageLayout — shell único de tela (Sidebar + topbar + content-area).
   Substitui TestsLayout/ApisLayout/ToolLayout e as topbars manuais
   das páginas de administração. Visual idêntico aos shells antigos.
   ═══════════════════════════════════════════════════════════ */
import { useEffect, type ReactNode } from 'react';
import { Sidebar, type TestKey, type ApiKey, type ToolKey } from '../Sidebar';
import { HelpTooltip } from '../tests/HelpTooltip';
import { showLoading, hideLoading } from '../../lib/loading';

export type AdminKey = 'usuarios' | 'dados' | 'azure' | 'perfil' | 'azure-templates';
export type PageModule = 'tests' | 'apis' | 'tools' | 'admin';

const MODULE_CFG: Record<PageModule, { breadcrumb: string; pageClass: string }> = {
  tests: { breadcrumb: 'Gestão de Testes', pageClass: 'tests-page' },
  apis:  { breadcrumb: 'APIs',             pageClass: 'tests-page' },
  tools: { breadcrumb: 'Ferramentas',      pageClass: 'tool-page' },
  admin: { breadcrumb: 'Administração',    pageClass: 'admin-page' },
};

interface PageLayoutProps {
  module: PageModule;
  title: string;
  /** sobrescreve o breadcrumb padrão do módulo (ex.: "Conta" no perfil) */
  breadcrumb?: string;
  /** subtítulo dentro do tool-shell (somente module="tools") */
  subtitle?: string;
  /** texto/JSX de ajuda exibido no "?" ao lado do título */
  help?: ReactNode;
  /** ações exibidas à direita da topbar (seletor de projeto, botões) */
  actions?: ReactNode;
  /** quando true, exibe o overlay de carregamento global (tests/apis) */
  loading?: boolean;
  /** quando true, o conteúdo ocupa toda a área sem o wrapper rolável central */
  fluid?: boolean;
  activeTest?: TestKey;
  activeApi?: ApiKey;
  activeTool?: ToolKey;
  activeAdmin?: AdminKey;
  children: ReactNode;
}

export function PageLayout({
  module, title, breadcrumb, subtitle, help, actions, loading, fluid,
  activeTest, activeApi, activeTool, activeAdmin, children,
}: PageLayoutProps) {
  // Overlay global de carregamento: tests/apis/admin. Tools (geradores
  // síncronos) não usam overlay.
  const hasLoadingOverlay = module === 'tests' || module === 'apis' || module === 'admin';
  useEffect(() => {
    if (!hasLoadingOverlay) return;
    if (loading) {
      showLoading('Carregando...');
      return;
    }
    const t = setTimeout(hideLoading, 500);
    return () => clearTimeout(t);
  }, [hasLoadingOverlay, loading]);

  const cfg = MODULE_CFG[module];

  const content = module === 'tools' ? (
    <div className="tool-scroll">
      <div className="tool-shell">
        {subtitle && <p className="tool-subtitle">{subtitle}</p>}
        {children}
      </div>
    </div>
  ) : module === 'admin' ? (
    children
  ) : (
    <div className={fluid ? 'tests-fluid' : 'tests-scroll'}>{children}</div>
  );

  return (
    <div className={`app ${cfg.pageClass}`} id="app">
      <Sidebar activeTest={activeTest} activeApi={activeApi} activeTool={activeTool} activeAdmin={activeAdmin} />
      <div className="main" id="main">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-title">
              <span className="breadcrumb">{breadcrumb ?? cfg.breadcrumb}</span>
              <div className="topbar-title-row">
                <h1>{title}</h1>
                {help && <HelpTooltip>{help}</HelpTooltip>}
              </div>
            </div>
          </div>
          <div className="topbar-actions">{actions}</div>
        </header>
        <div className="content-area">
          {content}
        </div>
      </div>
    </div>
  );
}
