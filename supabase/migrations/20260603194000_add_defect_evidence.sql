-- ═══════════════════════════════════════════════════════════════════════════
-- Evidências (fotos/anexos) nos defeitos
-- ═══════════════════════════════════════════════════════════════════════════
-- Mesma estrutura das evidências de execução: array JSON de { name, url } no
-- bucket público qa-evidence.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.qa_defects add column if not exists evidence jsonb not null default '[]'::jsonb;
