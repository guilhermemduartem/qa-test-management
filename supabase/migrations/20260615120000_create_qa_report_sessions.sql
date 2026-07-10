-- ═══════════════════════════════════════════════════════════════════════════
-- Sessões compartilhadas de relatório (colaboração em tempo real)
-- ═══════════════════════════════════════════════════════════════════════════
-- Cada linha guarda um SNAPSHOT completo do relatório (jsonb) + dono + revisão.
-- Dois ou mais QAs editam o mesmo `id` ao vivo via Supabase Realtime
-- (postgres_changes na linha) + canal de presença para "quem está online".
--
-- Imagens NÃO ficam em base64 aqui: o app sobe os prints no bucket `qa-evidence`
-- e grava só a URL pública no jsonb, para o payload do Realtime ficar leve.
--
-- Acesso restrito a usuários autenticados (o link só funciona logado).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.qa_report_sessions (
  id              text primary key,
  owner_id        text not null,
  owner_name      text not null,
  story_id        text,
  story_title     text,
  report          jsonb not null,
  rev             bigint not null default 0,
  updated_by_id   text,
  updated_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_qa_report_sessions_updated_at
  on public.qa_report_sessions (updated_at desc);

alter table public.qa_report_sessions enable row level security;

drop policy if exists qa_report_sessions_select on public.qa_report_sessions;
create policy qa_report_sessions_select on public.qa_report_sessions
  for select to authenticated using (true);

drop policy if exists qa_report_sessions_insert on public.qa_report_sessions;
create policy qa_report_sessions_insert on public.qa_report_sessions
  for insert to authenticated with check (true);

drop policy if exists qa_report_sessions_update on public.qa_report_sessions;
create policy qa_report_sessions_update on public.qa_report_sessions
  for update to authenticated using (true) with check (true);

drop policy if exists qa_report_sessions_delete on public.qa_report_sessions;
create policy qa_report_sessions_delete on public.qa_report_sessions
  for delete to authenticated using (true);

grant select, insert, update, delete on public.qa_report_sessions to authenticated;

-- Habilita o Realtime para a tabela (ignora se já estiver na publicação).
do $$
begin
  alter publication supabase_realtime add table public.qa_report_sessions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
