/* ═══════════════════════════════════════════════════════════
   useActiveProject — carrega os projetos de teste e mantém o
   projeto ativo selecionado (persistido em localStorage).
   ═══════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from 'react';
import { listProjects } from '../lib/testManagement';
import type { TestProject } from '../types/tests';

const ACTIVE_KEY = 'qa_test_active_project';

export function useActiveProject() {
  const [projects, setProjects] = useState<TestProject[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(() => localStorage.getItem(ACTIVE_KEY));
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const list = await listProjects();
    setProjects(list);
    setActiveIdState((cur) => {
      if (cur && list.some((p) => p.id === cur)) return cur;
      return list[0]?.id ?? null;
    });
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  }, []);

  const activeProject = projects.find((p) => p.id === activeId) ?? null;

  return { projects, activeProject, activeId, setActiveId, loading, reload };
}
