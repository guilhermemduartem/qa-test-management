import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom';
import './styles/styles.css';
import { AuthProvider } from './context/AuthProvider';
import { ToastProvider } from './context/ToastProvider';
import { LoadingProvider } from './context/LoadingProvider';
import { MobileBlock } from './components/MobileBlock';
import { LoginPage } from './pages/LoginPage';
import { ReportPage } from './pages/ReportPage';
import { AdminPage } from './pages/AdminPage';
import { ReportDataPage } from './pages/ReportDataPage';
import { GeradorCpfPage, GeradorCnpjPage, GeradorRgPage } from './pages/tools/generatorPages';
import { GeradorCartaoPage } from './pages/tools/GeradorCartaoPage';
import { FileIdFormatterPage } from './pages/tools/FileIdFormatterPage';
import { OfxBase64Page } from './pages/tools/OfxBase64Page';
import { EnderecoEuaPage } from './pages/tools/EnderecoEuaPage';
import { ValidadorNfPage } from './pages/tools/ValidadorNfPage';
import { CollectionPage } from './pages/tools/CollectionPage';
import { DashboardPage } from './pages/tests/DashboardPage';
import { CasosPage } from './pages/tests/CasosPage';
import { RunsPage } from './pages/tests/RunsPage';
import { PlanosPage } from './pages/tests/PlanosPage';
import { RastreabilidadePage } from './pages/tests/RastreabilidadePage';
import { DefectsPage } from './pages/tests/DefectsPage';
import { ExploratorioPage } from './pages/tests/ExploratorioPage';
import { RelatoriosPage } from './pages/tests/RelatoriosPage';
import { AzureTemplatesPage } from './pages/tests/AzureTemplatesPage';
import { AzureCardsPage } from './pages/tests/AzureCardsPage';
import { AzureConfigPage } from './pages/AzureConfigPage';
import { ProfilePage } from './pages/ProfilePage';
import { HealthCheckPage } from './pages/apis/HealthCheckPage';
import { ApisConfigPage } from './pages/apis/ApisConfigPage';
import { ApisRunnerPage } from './pages/apis/ApisRunnerPage';
import { BulkImportPage, BulkImportRunsPage } from './pages/apis/BulkImportPage';
import { FloatingToolsWidget } from './components/FloatingToolsWidget';
import type { ReactNode } from 'react';
import { isAuthenticated, currentUser } from './lib/auth';

function RequireAuth({ children }: { children: ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  if (!['admin','master_admin'].includes(currentUser()?.role ?? '')) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const user = currentUser();
  if (user?.role === 'qa') return <Navigate to="/testes" replace />;
  return <Navigate to="/testes/relatorios" replace />;
}

const router = createHashRouter(
  [
    { path: '/login', element: <LoginPage /> },
    { path: '/', element: <RequireAuth><HomeRedirect /></RequireAuth> },
    { path: '/relatorio', element: <RequireAuth><ReportPage /></RequireAuth> },
    { path: '/relatorio/sessao/:sessionId', element: <RequireAuth><ReportPage /></RequireAuth> },
    { path: '/admin', element: <RequireAdmin><AdminPage /></RequireAdmin> },
    { path: '/dados-relatorios', element: <RequireAdmin><ReportDataPage /></RequireAdmin> },
    { path: '/ferramentas/cpf', element: <RequireAuth><GeradorCpfPage /></RequireAuth> },
    { path: '/ferramentas/cnpj', element: <RequireAuth><GeradorCnpjPage /></RequireAuth> },
    { path: '/ferramentas/rg', element: <RequireAuth><GeradorRgPage /></RequireAuth> },
    { path: '/ferramentas/cartao', element: <RequireAuth><GeradorCartaoPage /></RequireAuth> },
    { path: '/ferramentas/fileid', element: <RequireAuth><FileIdFormatterPage /></RequireAuth> },
    { path: '/ferramentas/ofx', element: <RequireAuth><OfxBase64Page /></RequireAuth> },
    { path: '/ferramentas/endereco', element: <RequireAuth><EnderecoEuaPage /></RequireAuth> },
    { path: '/ferramentas/validador-nf', element: <RequireAuth><ValidadorNfPage /></RequireAuth> },
    { path: '/ferramentas/collection', element: <RequireAuth><CollectionPage /></RequireAuth> },
    { path: '/testes', element: <RequireAuth><DashboardPage /></RequireAuth> },
    { path: '/testes/casos', element: <RequireAuth><CasosPage /></RequireAuth> },
    { path: '/testes/runs', element: <RequireAuth><RunsPage /></RequireAuth> },
    { path: '/testes/planos', element: <RequireAuth><PlanosPage /></RequireAuth> },
    { path: '/testes/rastreabilidade', element: <RequireAuth><RastreabilidadePage /></RequireAuth> },
    { path: '/testes/defeitos', element: <RequireAuth><DefectsPage kind="bug" /></RequireAuth> },
    { path: '/testes/melhorias', element: <RequireAuth><DefectsPage kind="improvement" /></RequireAuth> },
    { path: '/testes/azure-cards', element: <RequireAuth><AzureCardsPage /></RequireAuth> },
    { path: '/testes/azure-templates', element: <RequireAuth><AzureTemplatesPage /></RequireAuth> },
    { path: '/testes/exploratorio', element: <RequireAuth><ExploratorioPage /></RequireAuth> },
    { path: '/testes/relatorios', element: <RequireAuth><RelatoriosPage /></RequireAuth> },
    { path: '/admin/azure', element: <RequireAdmin><AzureConfigPage /></RequireAdmin> },
    { path: '/apis/healthcheck', element: <RequireAuth><HealthCheckPage /></RequireAuth> },
    { path: '/apis/runner', element: <RequireAuth><ApisRunnerPage /></RequireAuth> },
    { path: '/apis/config', element: <RequireAuth><ApisConfigPage /></RequireAuth> },
    { path: '/apis/suporte/importacao-massiva', element: <RequireAdmin><BulkImportPage /></RequireAdmin> },
    { path: '/apis/suporte/runs', element: <RequireAuth><BulkImportRunsPage /></RequireAuth> },
    { path: '/perfil', element: <RequireAuth><ProfilePage /></RequireAuth> },
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { future: { v7_relativeSplatPath: true } },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MobileBlock />
    <AuthProvider>
      <ToastProvider>
        <LoadingProvider>
          <RouterProvider router={router} />
          <FloatingToolsWidget />
        </LoadingProvider>
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
);
