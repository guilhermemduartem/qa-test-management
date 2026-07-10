ALTER TABLE public.qa_defects ADD COLUMN IF NOT EXISTS card_id TEXT REFERENCES public.qa_cards(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_qa_defects_card ON public.qa_defects(card_id);
