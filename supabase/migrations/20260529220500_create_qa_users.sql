create table if not exists public.qa_users (
  id text primary key,
  nome text not null,
  email text not null,
  login text not null,
  senha_hash text not null,
  role text not null check (role in ('admin', 'qa', 'leitura')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_qa_users_login_ci
  on public.qa_users (lower(login));

create unique index if not exists uq_qa_users_email_ci
  on public.qa_users (lower(email));

alter table public.qa_users enable row level security;

drop policy if exists qa_users_select on public.qa_users;
create policy qa_users_select
on public.qa_users
for select
to anon, authenticated
using (true);

drop policy if exists qa_users_insert on public.qa_users;
create policy qa_users_insert
on public.qa_users
for insert
to anon, authenticated
with check (true);

drop policy if exists qa_users_update on public.qa_users;
create policy qa_users_update
on public.qa_users
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists qa_users_delete on public.qa_users;
create policy qa_users_delete
on public.qa_users
for delete
to anon, authenticated
using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.qa_users to anon, authenticated;

insert into public.qa_users (id, nome, email, login, senha_hash, role, ativo, created_at)
select
  'seed_admin',
  'Administrador',
  'admin@qareporter.local',
  'admin',
  '2t0kfe',
  'admin',
  true,
  now()
where not exists (select 1 from public.qa_users where lower(login) = 'admin');

insert into public.qa_users (id, nome, email, login, senha_hash, role, ativo, created_at)
select
  'seed_qa',
  'QA Tester',
  'qa@qareporter.local',
  'qa',
  '3hmph',
  'qa',
  true,
  now()
where not exists (select 1 from public.qa_users where lower(login) = 'qa');
 
 
insert into public.qa_users (id, nome, email, login, senha_hash, role, ativo, created_at)
select   
  'seed_leitura',
  'Usuário Leitura',
  'leitura@qareporter.local',
  'leitura',
  '198ofr',
  'leitura',
  true,
  now()
where not exists (select 1 from public.qa_users where lower(login) = 'leitura');
