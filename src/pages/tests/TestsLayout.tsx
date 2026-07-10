/* ═══════════════════════════════════════════════════════════
   TestsLayout — wrapper fino sobre PageLayout (module="tests").
   Mantido para não tocar nos call sites; novas telas devem usar
   PageLayout diretamente.
   ═══════════════════════════════════════════════════════════ */
import type { ReactNode } from 'react';
import type { TestKey } from '../../components/Sidebar';
import { PageLayout, type AdminKey } from '../../components/ui/PageLayout';

interface TestsLayoutProps {
  title: string;
  activeTest?: TestKey;
  activeAdmin?: AdminKey;
  loading?: boolean;
  actions?: ReactNode;
  help?: ReactNode;
  fluid?: boolean;
  children: ReactNode;
}

export function TestsLayout(props: TestsLayoutProps) {
  return <PageLayout module="tests" {...props} />;
}
