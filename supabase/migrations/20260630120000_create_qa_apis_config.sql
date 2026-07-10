-- ═══════════════════════════════════════════════════════════════════════════
-- qa_apis_config — configuração COMPARTILHADA do módulo APIs (Health Check,
-- Ambientes, Hosts, Endpoints). Antes vivia apenas no localStorage do navegador,
-- então o que um usuário criava (ambiente, serviço, etc.) só aparecia para ele.
-- Agora é uma única linha global (id = 'global') com todo o config em JSONB,
-- visível e editável por todos os papéis ativos.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.qa_apis_config (
  id          text primary key default 'global',
  config      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text default auth.uid()::text
);

alter table public.qa_apis_config enable row level security;

-- SELECT: qualquer papel ativo enxerga a config compartilhada.
drop policy if exists qa_apis_config_sel on public.qa_apis_config;
create policy qa_apis_config_sel on public.qa_apis_config
  for select to authenticated
  using (public.qa_role() is not null);

-- INSERT/UPDATE: qualquer escritor (não-viewer) pode criar/editar a config.
drop policy if exists qa_apis_config_ins on public.qa_apis_config;
create policy qa_apis_config_ins on public.qa_apis_config
  for insert to authenticated
  with check (public.qa_can_write());

drop policy if exists qa_apis_config_upd on public.qa_apis_config;
create policy qa_apis_config_upd on public.qa_apis_config
  for update to authenticated
  using (public.qa_can_write())
  with check (public.qa_can_write());

-- DELETE: só admin (não há motivo prático, mas protege a linha global).
drop policy if exists qa_apis_config_del on public.qa_apis_config;
create policy qa_apis_config_del on public.qa_apis_config
  for delete to authenticated
  using (public.qa_is_admin());
