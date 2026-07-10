/* ═══════════════════════════════════════════════════════════
   ApisLayout — wrapper fino sobre PageLayout (module="apis").
   Mantido para não tocar nos call sites; novas telas devem usar
   PageLayout diretamente.
   ═══════════════════════════════════════════════════════════ */
import type { ReactNode } from 'react';
import type { ApiKey } from '../../components/Sidebar';
import { PageLayout } from '../../components/ui/PageLayout';

interface ApisLayoutProps {
  title: string;
  activeApi?: ApiKey;
  loading?: boolean;
  actions?: ReactNode;
  help?: ReactNode;
  fluid?: boolean;
  children: ReactNode;
}

export function ApisLayout(props: ApisLayoutProps) {
  return <PageLayout module="apis" {...props} />;
}
