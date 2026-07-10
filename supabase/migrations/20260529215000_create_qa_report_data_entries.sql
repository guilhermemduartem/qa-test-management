create table if not exists public.qa_report_data_entries (
  id text primary key,
  texto text not null,
  acoes text not null,
  created_by_id text,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_qa_report_data_entries_created_at
  on public.qa_report_data_entries (created_at desc);

alter table public.qa_report_data_entries enable row level security;

drop policy if exists qa_report_data_entries_select on public.qa_report_data_entries;
create policy qa_report_data_entries_select
on public.qa_report_data_entries
for select
to anon, authenticated
using (true);

drop policy if exists qa_report_data_entries_insert on public.qa_report_data_entries;
create policy qa_report_data_entries_insert
on public.qa_report_data_entries
for insert
to anon, authenticated
with check (true);

drop policy if exists qa_report_data_entries_update on public.qa_report_data_entries;
create policy qa_report_data_entries_update
on public.qa_report_data_entries
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists qa_report_data_entries_delete on public.qa_report_data_entries;
create policy qa_report_data_entries_delete
on public.qa_report_data_entries
for delete
to anon, authenticated
using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.qa_report_data_entries to anon, authenticated;
