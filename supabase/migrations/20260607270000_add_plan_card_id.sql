ALTER TABLE public.qa_test_plans ADD COLUMN IF NOT EXISTS card_id TEXT REFERENCES public.qa_cards(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_qa_test_plans_card ON public.qa_test_plans(card_id);
