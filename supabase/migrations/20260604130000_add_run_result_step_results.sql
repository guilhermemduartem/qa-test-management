-- ═══════════════════════════════════════════════════════════════════════════
-- Resultado por passo nas execuções (qa_test_run_results.step_results)
-- ═══════════════════════════════════════════════════════════════════════════
-- Cada execução de caso passa a guardar também o resultado de cada PASSO do
-- cenário: status, comentário e evidências por passo. Armazenado como JSONB
-- (array alinhado por índice aos steps do caso):
--   [{ "status": "passed", "comment": "...", "evidence": [{name,url}] }, ...]
--
-- Idempotente (add column if not exists). Default '[]' para linhas existentes.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.qa_test_run_results
  add column if not exists step_results jsonb not null default '[]'::jsonb;

-- Recarrega o schema cache do PostgREST para o novo campo aparecer na API.
notify pgrst, 'reload schema';
