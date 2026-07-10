-- ═══════════════════════════════════════════════════════════════════════════
-- Expande os papéis (roles) do sistema
-- ═══════════════════════════════════════════════════════════════════════════
-- Substitui a constraint check de 3 valores ('admin','qa','leitura') pela
-- lista completa de 15 papéis. Renomeia 'leitura' → 'viewer' nos perfis
-- existentes e atualiza o default e o trigger de criação automática.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Remove a constraint antiga para liberar o UPDATE
alter table public.qa_profiles
  drop constraint if exists qa_profiles_role_check;

-- 2) Renomeia 'leitura' → 'viewer' nos perfis já existentes
update public.qa_profiles set role = 'viewer' where role = 'leitura';

-- 3) Adiciona a nova constraint com a lista completa
alter table public.qa_profiles
  add constraint qa_profiles_role_check check (role in (
    'viewer',
    'intern',
    'qa',
    'developer',
    'senior_developer',
    'tech_lead',
    'devops',
    'architect',
    'scrum_master',
    'product_owner',
    'product_manager',
    'engineering_manager',
    'director_engineering',
    'admin',
    'master_admin'
  ));

-- 4) Atualiza o default
alter table public.qa_profiles
  alter column role set default 'viewer';

-- 4) Atualiza o trigger para usar 'viewer' como fallback
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.qa_profiles (id, nome, role, ativo)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nome',''), new.email),
    coalesce(nullif(new.raw_user_meta_data->>'role',''), 'viewer'),
    true
  )
  on conflict (id) do nothing;
  return new;
end; $$;

-- 5) Atualiza qa_is_admin() para reconhecer master_admin também
create or replace function public.qa_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('admin','master_admin') from public.qa_profiles where id = auth.uid() and ativo),
    false
  )
$$;
