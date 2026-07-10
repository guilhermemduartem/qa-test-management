-- ═══════════════════════════════════════════════════════════════════════════
-- Módulo de Gestão de Testes — tabelas qa_test_* / qa_*
-- ═══════════════════════════════════════════════════════════════════════════
-- RLS: políticas permissivas para anon + authenticated (mesmo modelo das
-- tabelas legadas qa_users/qa_templates), pois o app autentica de forma mock
-- e conecta como `anon`. O controle por papel é feito na UI via can() (auth.ts).
--
-- 🔒 ENDURECER ao implementar Supabase Auth real: substituir cada policy
-- `<tabela>_all` por políticas por papel (SELECT authenticated; INSERT/UPDATE
-- admin|qa; DELETE admin) e revogar o acesso de `anon`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tabelas ──────────────────────────────────────────────────────────────────
create table if not exists public.qa_test_projects (
  id text primary key,
  name text not null,
  description text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.qa_test_suites (
  id text primary key,
  project_id text not null references public.qa_test_projects(id) on delete cascade,
  parent_id text references public.qa_test_suites(id) on delete cascade,
  name text not null,
  "order" integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.qa_test_cases (
  id text primary key,
  suite_id text references public.qa_test_suites(id) on delete set null,
  project_id text not null references public.qa_test_projects(id) on delete cascade,
  title text not null,
  type text not null default 'manual' check (type in ('manual','automated','api','exploratory')),
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status text not null default 'draft' check (status in ('draft','active','deprecated')),
  preconditions text,
  steps jsonb not null default '[]'::jsonb,
  expected_result text,
  tags text[] not null default '{}',
  custom_fields jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.qa_test_case_versions (
  id text primary key,
  case_id text not null references public.qa_test_cases(id) on delete cascade,
  snapshot jsonb not null,
  saved_by text,
  saved_at timestamptz not null default now()
);

create table if not exists public.qa_milestones (
  id text primary key,
  project_id text not null references public.qa_test_projects(id) on delete cascade,
  name text not null,
  due_date timestamptz,
  status text not null default 'open' check (status in ('open','completed','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.qa_test_plans (
  id text primary key,
  project_id text not null references public.qa_test_projects(id) on delete cascade,
  milestone_id text references public.qa_milestones(id) on delete set null,
  name text not null,
  scope text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.qa_test_runs (
  id text primary key,
  project_id text not null references public.qa_test_projects(id) on delete cascade,
  plan_id text references public.qa_test_plans(id) on delete set null,
  name text not null,
  status text not null default 'open' check (status in ('open','in_progress','closed')),
  assigned_to text,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.qa_test_run_results (
  id text primary key,
  run_id text not null references public.qa_test_runs(id) on delete cascade,
  case_id text not null references public.qa_test_cases(id) on delete cascade,
  status text not null default 'untested' check (status in ('untested','passed','failed','blocked','skipped','retest')),
  executed_by text,
  executed_at timestamptz,
  elapsed_seconds integer not null default 0,
  comment text,
  evidence jsonb not null default '[]'::jsonb
);

create table if not exists public.qa_requirements (
  id text primary key,
  project_id text not null references public.qa_test_projects(id) on delete cascade,
  external_key text,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.qa_test_case_requirements (
  case_id text not null references public.qa_test_cases(id) on delete cascade,
  requirement_id text not null references public.qa_requirements(id) on delete cascade,
  primary key (case_id, requirement_id)
);

create table if not exists public.qa_defects (
  id text primary key,
  project_id text not null references public.qa_test_projects(id) on delete cascade,
  run_result_id text references public.qa_test_run_results(id) on delete set null,
  title text not null,
  description text,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  external_key text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.qa_exploratory_sessions (
  id text primary key,
  project_id text not null references public.qa_test_projects(id) on delete cascade,
  charter text,
  notes jsonb not null default '[]'::jsonb,
  duration_seconds integer not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);

-- ── Índices ────────────────────────────────────────────────────────────────
create index if not exists idx_qa_test_suites_project on public.qa_test_suites(project_id);
create index if not exists idx_qa_test_suites_parent on public.qa_test_suites(parent_id);
create index if not exists idx_qa_test_cases_project on public.qa_test_cases(project_id);
create index if not exists idx_qa_test_cases_suite on public.qa_test_cases(suite_id);
create index if not exists idx_qa_test_case_versions_case on public.qa_test_case_versions(case_id);
create index if not exists idx_qa_milestones_project on public.qa_milestones(project_id);
create index if not exists idx_qa_test_plans_project on public.qa_test_plans(project_id);
create index if not exists idx_qa_test_runs_project on public.qa_test_runs(project_id);
create index if not exists idx_qa_test_run_results_run on public.qa_test_run_results(run_id);
create index if not exists idx_qa_test_run_results_case on public.qa_test_run_results(case_id);
create index if not exists idx_qa_requirements_project on public.qa_requirements(project_id);
create index if not exists idx_qa_defects_project on public.qa_defects(project_id);
create index if not exists idx_qa_exploratory_sessions_project on public.qa_exploratory_sessions(project_id);

-- ── RLS: políticas permissivas (anon + authenticated) ────────────────────────
alter table public.qa_test_projects enable row level security;
drop policy if exists qa_test_projects_all on public.qa_test_projects;
create policy qa_test_projects_all on public.qa_test_projects for all to anon, authenticated using (true) with check (true);

alter table public.qa_test_suites enable row level security;
drop policy if exists qa_test_suites_all on public.qa_test_suites;
create policy qa_test_suites_all on public.qa_test_suites for all to anon, authenticated using (true) with check (true);

alter table public.qa_test_cases enable row level security;
drop policy if exists qa_test_cases_all on public.qa_test_cases;
create policy qa_test_cases_all on public.qa_test_cases for all to anon, authenticated using (true) with check (true);

alter table public.qa_test_case_versions enable row level security;
drop policy if exists qa_test_case_versions_all on public.qa_test_case_versions;
create policy qa_test_case_versions_all on public.qa_test_case_versions for all to anon, authenticated using (true) with check (true);

alter table public.qa_milestones enable row level security;
drop policy if exists qa_milestones_all on public.qa_milestones;
create policy qa_milestones_all on public.qa_milestones for all to anon, authenticated using (true) with check (true);

alter table public.qa_test_plans enable row level security;
drop policy if exists qa_test_plans_all on public.qa_test_plans;
create policy qa_test_plans_all on public.qa_test_plans for all to anon, authenticated using (true) with check (true);

alter table public.qa_test_runs enable row level security;
drop policy if exists qa_test_runs_all on public.qa_test_runs;
create policy qa_test_runs_all on public.qa_test_runs for all to anon, authenticated using (true) with check (true);

alter table public.qa_test_run_results enable row level security;
drop policy if exists qa_test_run_results_all on public.qa_test_run_results;
create policy qa_test_run_results_all on public.qa_test_run_results for all to anon, authenticated using (true) with check (true);

alter table public.qa_requirements enable row level security;
drop policy if exists qa_requirements_all on public.qa_requirements;
create policy qa_requirements_all on public.qa_requirements for all to anon, authenticated using (true) with check (true);

alter table public.qa_test_case_requirements enable row level security;
drop policy if exists qa_test_case_requirements_all on public.qa_test_case_requirements;
create policy qa_test_case_requirements_all on public.qa_test_case_requirements for all to anon, authenticated using (true) with check (true);

alter table public.qa_defects enable row level security;
drop policy if exists qa_defects_all on public.qa_defects;
create policy qa_defects_all on public.qa_defects for all to anon, authenticated using (true) with check (true);

alter table public.qa_exploratory_sessions enable row level security;
drop policy if exists qa_exploratory_sessions_all on public.qa_exploratory_sessions;
create policy qa_exploratory_sessions_all on public.qa_exploratory_sessions for all to anon, authenticated using (true) with check (true);

-- ── Grants ───────────────────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.qa_test_projects, public.qa_test_suites, public.qa_test_cases,
  public.qa_test_case_versions, public.qa_milestones, public.qa_test_plans,
  public.qa_test_runs, public.qa_test_run_results, public.qa_requirements,
  public.qa_test_case_requirements, public.qa_defects, public.qa_exploratory_sessions
to anon, authenticated;
