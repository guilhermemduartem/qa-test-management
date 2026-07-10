/* ═══════════════════════════════════════════════════════════
   ToolLayout — wrapper fino sobre PageLayout (module="tools").
   Mantido para não tocar nos call sites; novas telas devem usar
   PageLayout diretamente.
   ═══════════════════════════════════════════════════════════ */
import type { ReactNode } from 'react';
import type { ToolKey } from '../Sidebar';
import { PageLayout } from '../ui/PageLayout';

interface ToolLayoutProps {
  title: string;
  subtitle?: string;
  activeTool: ToolKey;
  help?: ReactNode;
  children: ReactNode;
}

export function ToolLayout(props: ToolLayoutProps) {
  return <PageLayout module="tools" {...props} />;
}
