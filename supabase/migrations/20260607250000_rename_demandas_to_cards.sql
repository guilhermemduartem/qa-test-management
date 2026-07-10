-- Renomeia qa_demandas para qa_cards (se ainda existir com o nome antigo)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'qa_demandas') THEN
    ALTER TABLE public.qa_demandas RENAME TO qa_cards;
  END IF;
END $$;

-- Cria a tabela caso não exista (fresh install)
CREATE TABLE IF NOT EXISTS public.qa_cards (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  sprint_id TEXT REFERENCES public.qa_sprints(id) ON DELETE SET NULL,
  milestone_id TEXT REFERENCES public.qa_milestones(id) ON DELETE SET NULL,
  azure_id INTEGER,
  title TEXT NOT NULL,
  resumo TEXT,
  repro_steps TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluida')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Adiciona colunas novas (caso a tabela tenha vindo do rename)
ALTER TABLE public.qa_cards ADD COLUMN IF NOT EXISTS azure_id INTEGER;
ALTER TABLE public.qa_cards ADD COLUMN IF NOT EXISTS resumo TEXT;
ALTER TABLE public.qa_cards ADD COLUMN IF NOT EXISTS repro_steps TEXT;

-- Remove colunas do schema antigo de demandas
ALTER TABLE public.qa_cards DROP COLUMN IF EXISTS description;
ALTER TABLE public.qa_cards DROP COLUMN IF EXISTS external_key;

CREATE INDEX IF NOT EXISTS idx_qa_cards_project ON public.qa_cards(project_id);
CREATE INDEX IF NOT EXISTS idx_qa_cards_sprint  ON public.qa_cards(sprint_id);

ALTER TABLE public.qa_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qa_demandas_all ON public.qa_cards;
DROP POLICY IF EXISTS qa_cards_all    ON public.qa_cards;
CREATE POLICY qa_cards_all ON public.qa_cards FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
