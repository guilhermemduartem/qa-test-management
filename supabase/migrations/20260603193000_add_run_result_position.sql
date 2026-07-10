-- ═══════════════════════════════════════════════════════════════════════════
-- Ordem de execução dos casos dentro de uma execução
-- ═══════════════════════════════════════════════════════════════════════════
-- `position` define a sequência em que os casos são executados no runner.
-- A ordem é definida na criação/edição da execução (arrastar-e-soltar).
-- Linhas existentes ficam com 0 (mantêm a ordem atual de inserção/consulta).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.qa_test_run_results add column if not exists position integer not null default 0;
