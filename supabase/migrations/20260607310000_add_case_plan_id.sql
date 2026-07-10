ALTER TABLE public.qa_test_cases
  ADD COLUMN IF NOT EXISTS plan_id TEXT REFERENCES public.qa_test_plans(id) ON DELETE SET NULL;
