-- Denormaliza a contagem de critérios por status (ex.: {"pending":5,"approved":3})
-- para exibir a divisão no card da listagem sem carregar o snapshot completo.

alter table public.qa_templates
  add column if not exists criteria_status jsonb;

grant select, insert, update, delete on public.qa_templates to anon, authenticated;
