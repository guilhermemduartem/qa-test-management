-- ═══════════════════════════════════════════════════════════════════════════
-- qa_defects.kind — distingue "bug" de "melhoria" na mesma tabela.
-- Registros existentes viram 'bug' (default). A tela de Bug filtra kind='bug'
-- e a de Melhoria filtra kind='improvement'.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.qa_defects add column if not exists kind text not null default 'bug';
create index if not exists qa_defects_kind_idx on public.qa_defects (kind);
