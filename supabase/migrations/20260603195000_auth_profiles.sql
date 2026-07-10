-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 1 — Supabase Auth: perfis (papel/ativo) + helpers para RLS
-- ═══════════════════════════════════════════════════════════════════════════
-- Esta migração NÃO endurece as tabelas qa_* ainda (isso é a Fase 3,
-- 20260603196000_rls_by_role.sql) — então o app atual continua funcionando
-- enquanto você prepara o Auth. Aplicar esta é seguro.
--
-- Modelo: cada usuário do Supabase Auth (auth.users) tem um perfil em
-- qa_profiles com papel (admin|qa|leitura) e flag ativo. As policias de RLS
-- vão usar as funções qa_role() / qa_is_admin() abaixo.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.qa_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  role text not null default 'leitura' check (role in ('admin','qa','leitura')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Cria o perfil automaticamente quando um usuário do Auth é criado.
-- nome/role podem vir no user_metadata (definidos pela Edge Function admin).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.qa_profiles (id, nome, role, ativo)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nome',''), new.email),
    coalesce(new.raw_user_meta_data->>'role','leitura'),
    true
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Papel do usuário logado (null se inativo ou sem perfil → bloqueia nas policies).
create or replace function public.qa_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.qa_profiles where id = auth.uid() and ativo
$$;

create or replace function public.qa_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.qa_profiles where id = auth.uid() and ativo), false)
$$;

-- ── RLS de qa_profiles ──
alter table public.qa_profiles enable row level security;

-- qualquer usuário logado lê os perfis (para mostrar nome/papel de autores)
drop policy if exists qa_profiles_select on public.qa_profiles;
create policy qa_profiles_select on public.qa_profiles
  for select to authenticated using (true);

-- só admin altera papel/ativo (criação/exclusão é feita pela Edge Function via service role)
drop policy if exists qa_profiles_admin_write on public.qa_profiles;
create policy qa_profiles_admin_write on public.qa_profiles
  for update to authenticated using (public.qa_is_admin()) with check (public.qa_is_admin());

grant select, update on public.qa_profiles to authenticated;
