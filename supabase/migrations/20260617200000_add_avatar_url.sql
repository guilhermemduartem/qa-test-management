-- Adiciona coluna de avatar ao perfil do usuário
alter table public.qa_profiles
  add column if not exists avatar_url text;

-- Função segura para o usuário atualizar apenas o próprio avatar.
-- SECURITY DEFINER roda com privilégios elevados, mas restringe
-- o UPDATE somente à coluna avatar_url do próprio auth.uid().
create or replace function public.update_own_avatar(p_avatar_url text)
returns void language sql security definer set search_path = public as $$
  update public.qa_profiles
  set avatar_url = p_avatar_url
  where id = auth.uid()
$$;

-- Garante que só usuários autenticados podem chamar a função
revoke execute on function public.update_own_avatar(text) from public, anon;
grant  execute on function public.update_own_avatar(text) to authenticated;
