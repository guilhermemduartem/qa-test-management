ALTER TABLE public.qa_defects
  DROP CONSTRAINT IF EXISTS qa_defects_status_check;

ALTER TABLE public.qa_defects
  ADD CONSTRAINT qa_defects_status_check
    CHECK (status IN ('pending_azure', 'open', 'in_progress', 'resolved', 'closed'));
