-- Denormaliza o Status Final da User Story no template para exibir na
-- listagem (pastas/cards) sem precisar carregar o snapshot completo.

alter table public.qa_templates
  add column if not exists final_status text;

grant select, insert, update, delete on public.qa_templates to anon, authenticated;
