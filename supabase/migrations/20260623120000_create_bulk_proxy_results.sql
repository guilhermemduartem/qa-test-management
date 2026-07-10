-- ═══════════════════════════════════════════════════════════════════════════
-- qa_bulk_proxy_results — resultados das chamadas da Importação Massiva feitas
-- via Background Function (proxy-background). O front insere uma linha "pending",
-- a function (service role) atualiza com o resultado, e o front faz polling.
-- Permite importações que passam de 30s (limite da função síncrona do Netlify).
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.qa_bulk_proxy_results (
  id          text primary key,
  user_id     uuid not null default auth.uid(),
  status      text not null default 'pending',   -- pending | done | error
  http_status int  not null default 0,
  ok          boolean not null default false,
  body        text,
  created_at  timestamptz not null default now()
);

alter table public.qa_bulk_proxy_results enable row level security;

-- Cada usuário só enxerga/gerencia as próprias linhas.
-- (a Background Function usa a service role key, que ignora RLS para o UPDATE)
drop policy if exists "bulk_proxy_owner_all" on public.qa_bulk_proxy_results;
create policy "bulk_proxy_owner_all" on public.qa_bulk_proxy_results
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists qa_bulk_proxy_results_created_idx on public.qa_bulk_proxy_results (created_at);
