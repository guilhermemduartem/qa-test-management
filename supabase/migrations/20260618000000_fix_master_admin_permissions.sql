-- ═══════════════════════════════════════════════════════════
-- Fix: master_admin não tinha permissão de escrita (criar casos,
-- sessões exploratórias, defeitos, etc.).
--
-- Causa: as funções helper de RLS só reconheciam 'admin':
--   • qa_is_admin() checava role = 'admin'
--   • ~40 policies checam qa_role() in ('admin','qa')
-- Como master_admin não é 'admin' nessas checagens, todo INSERT/UPDATE
-- era bloqueado pela RLS.
--
-- Correção centralizada nas funções (não nas ~40 policies):
--   • qa_is_admin(): admin OU master_admin
--   • qa_role(): normaliza master_admin → 'admin' para fins de RLS
--     (master_admin tem no mínimo os poderes de admin). As funções são
--     SECURITY DEFINER usadas apenas em policies — o frontend lê o role
--     real direto de qa_profiles, então a normalização não o afeta.
-- ═══════════════════════════════════════════════════════════

create or replace function public.qa_is_admin()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce(
    (select role in ('admin', 'master_admin')
       from public.qa_profiles
      where id = auth.uid() and ativo),
    false)
$$;

create or replace function public.qa_role()
returns text
language sql
stable security definer
set search_path to 'public'
as $$
  select case
           when role = 'master_admin' then 'admin'
           else role
         end
    from public.qa_profiles
   where id = auth.uid() and ativo
$$;
