CREATE TABLE IF NOT EXISTS public.qa_sprints (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  milestone_id TEXT REFERENCES public.qa_milestones(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.qa_test_plans ADD COLUMN IF NOT EXISTS sprint_id TEXT REFERENCES public.qa_sprints(id) ON DELETE SET NULL;

ALTER TABLE public.qa_sprints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qa_sprints_all ON public.qa_sprints;
CREATE POLICY qa_sprints_all ON public.qa_sprints FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
