CREATE TABLE IF NOT EXISTS public.qa_demandas (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  sprint_id TEXT REFERENCES public.qa_sprints(id) ON DELETE SET NULL,
  milestone_id TEXT REFERENCES public.qa_milestones(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  external_key TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluida')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_demandas_project ON public.qa_demandas(project_id);
CREATE INDEX IF NOT EXISTS idx_qa_demandas_sprint ON public.qa_demandas(sprint_id);

ALTER TABLE public.qa_demandas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qa_demandas_all ON public.qa_demandas;
CREATE POLICY qa_demandas_all ON public.qa_demandas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
