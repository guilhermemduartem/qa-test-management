create table if not exists public.qa_templates (
  id text primary key,
  name text not null,
  saved_at timestamptz not null default now(),
  criteria_count integer not null default 0,
  snapshot jsonb not null,
  created_by text
);

create index if not exists idx_qa_templates_saved_at
  on public.qa_templates (saved_at desc);

create index if not exists idx_qa_templates_name
  on public.qa_templates (name);

alter table public.qa_templates enable row level security;

drop policy if exists qa_templates_select on public.qa_templates;
create policy qa_templates_select
on public.qa_templates
for select
to anon, authenticated
using (true);

drop policy if exists qa_templates_insert on public.qa_templates;
create policy qa_templates_insert
on public.qa_templates
for insert
to anon, authenticated
with check (true);

drop policy if exists qa_templates_update on public.qa_templates;
create policy qa_templates_update
on public.qa_templates
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists qa_templates_delete on public.qa_templates;
create policy qa_templates_delete
on public.qa_templates
for delete
to anon, authenticated
using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.qa_templates to anon, authenticated;
