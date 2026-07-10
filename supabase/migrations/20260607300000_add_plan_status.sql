ALTER TABLE public.qa_test_plans
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pendente';
