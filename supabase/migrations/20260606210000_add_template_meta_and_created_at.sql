-- Adiciona data de criação separada e campos de metadados da User Story
-- (sistema/módulo/sprint/ambiente) para exibir na listagem de templates
-- sem precisar carregar o snapshot completo.

alter table public.qa_templates
  add column if not exists created_at  timestamptz,
  add column if not exists system      text,
  add column if not exists module      text,
  add column if not exists sprint      text,
  add column if not exists environment text;

-- Backfill: templates existentes passam a ter created_at = saved_at.
update public.qa_templates
  set created_at = saved_at
  where created_at is null;

grant select, insert, update, delete on public.qa_templates to anon, authenticated;
