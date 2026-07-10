-- ═══════════════════════════════════════════════════════════════════════════
-- RLS por papel (endurecimento) — versão à prova do editor (sem do $$ / declare).
-- APLIQUE POR ÚLTIMO, com o login real (Supabase Auth) já funcionando.
-- Revoga o acesso `anon`: depois disto, só usuários logados acessam os dados.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Funções de papel (corpo em aspas simples para evitar $$) ──
create or replace function public.qa_role()
returns text language sql stable security definer set search_path = public
as 'select role from public.qa_profiles where id = auth.uid() and ativo';

create or replace function public.qa_is_admin()
returns boolean language sql stable security definer set search_path = public
as 'select coalesce((select role = ''admin'' from public.qa_profiles where id = auth.uid() and ativo), false)';

-- ── qa_profiles ──
alter table public.qa_profiles enable row level security;
revoke all on public.qa_profiles from anon;
grant select, update on public.qa_profiles to authenticated;
drop policy if exists qa_profiles_select on public.qa_profiles;
create policy qa_profiles_select on public.qa_profiles for select to authenticated using (true);
drop policy if exists qa_profiles_admin_write on public.qa_profiles;
create policy qa_profiles_admin_write on public.qa_profiles for update to authenticated using (public.qa_is_admin()) with check (public.qa_is_admin());

-- ───────────── qa_test_projects (dono = created_by) ─────────────
drop policy if exists qa_test_projects_all on public.qa_test_projects;
revoke all on public.qa_test_projects from anon;
alter table public.qa_test_projects enable row level security;
grant select, insert, update, delete on public.qa_test_projects to authenticated;
drop policy if exists qa_test_projects_sel on public.qa_test_projects;
create policy qa_test_projects_sel on public.qa_test_projects for select to authenticated using (public.qa_role() is not null);
drop policy if exists qa_test_projects_ins on public.qa_test_projects;
create policy qa_test_projects_ins on public.qa_test_projects for insert to authenticated with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_test_projects_upd on public.qa_test_projects;
create policy qa_test_projects_upd on public.qa_test_projects for update to authenticated using (public.qa_role() in ('admin','qa')) with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_test_projects_del on public.qa_test_projects;
create policy qa_test_projects_del on public.qa_test_projects for delete to authenticated using (public.qa_is_admin() or created_by = auth.uid()::text);

-- ───────────── qa_test_cases (dono = created_by) ─────────────
drop policy if exists qa_test_cases_all on public.qa_test_cases;
revoke all on public.qa_test_cases from anon;
alter table public.qa_test_cases enable row level security;
grant select, insert, update, delete on public.qa_test_cases to authenticated;
drop policy if exists qa_test_cases_sel on public.qa_test_cases;
create policy qa_test_cases_sel on public.qa_test_cases for select to authenticated using (public.qa_role() is not null);
drop policy if exists qa_test_cases_ins on public.qa_test_cases;
create policy qa_test_cases_ins on public.qa_test_cases for insert to authenticated with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_test_cases_upd on public.qa_test_cases;
create policy qa_test_cases_upd on public.qa_test_cases for update to authenticated using (public.qa_role() in ('admin','qa')) with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_test_cases_del on public.qa_test_cases;
create policy qa_test_cases_del on public.qa_test_cases for delete to authenticated using (public.qa_is_admin() or created_by = auth.uid()::text);

-- ───────────── qa_test_plans (dono = created_by) ─────────────
drop policy if exists qa_test_plans_all on public.qa_test_plans;
revoke all on public.qa_test_plans from anon;
alter table public.qa_test_plans enable row level security;
grant select, insert, update, delete on public.qa_test_plans to authenticated;
drop policy if exists qa_test_plans_sel on public.qa_test_plans;
create policy qa_test_plans_sel on public.qa_test_plans for select to authenticated using (public.qa_role() is not null);
drop policy if exists qa_test_plans_ins on public.qa_test_plans;
create policy qa_test_plans_ins on public.qa_test_plans for insert to authenticated with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_test_plans_upd on public.qa_test_plans;
create policy qa_test_plans_upd on public.qa_test_plans for update to authenticated using (public.qa_role() in ('admin','qa')) with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_test_plans_del on public.qa_test_plans;
create policy qa_test_plans_del on public.qa_test_plans for delete to authenticated using (public.qa_is_admin() or created_by = auth.uid()::text);

-- ───────────── qa_defects (dono = created_by) ─────────────
drop policy if exists qa_defects_all on public.qa_defects;
revoke all on public.qa_defects from anon;
alter table public.qa_defects enable row level security;
grant select, insert, update, delete on public.qa_defects to authenticated;
drop policy if exists qa_defects_sel on public.qa_defects;
create policy qa_defects_sel on public.qa_defects for select to authenticated using (public.qa_role() is not null);
drop policy if exists qa_defects_ins on public.qa_defects;
create policy qa_defects_ins on public.qa_defects for insert to authenticated with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_defects_upd on public.qa_defects;
create policy qa_defects_upd on public.qa_defects for update to authenticated using (public.qa_role() in ('admin','qa')) with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_defects_del on public.qa_defects;
create policy qa_defects_del on public.qa_defects for delete to authenticated using (public.qa_is_admin() or created_by = auth.uid()::text);

-- ───────────── qa_exploratory_sessions (dono = created_by) ─────────────
drop policy if exists qa_exploratory_sessions_all on public.qa_exploratory_sessions;
revoke all on public.qa_exploratory_sessions from anon;
alter table public.qa_exploratory_sessions enable row level security;
grant select, insert, update, delete on public.qa_exploratory_sessions to authenticated;
drop policy if exists qa_exploratory_sessions_sel on public.qa_exploratory_sessions;
create policy qa_exploratory_sessions_sel on public.qa_exploratory_sessions for select to authenticated using (public.qa_role() is not null);
drop policy if exists qa_exploratory_sessions_ins on public.qa_exploratory_sessions;
create policy qa_exploratory_sessions_ins on public.qa_exploratory_sessions for insert to authenticated with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_exploratory_sessions_upd on public.qa_exploratory_sessions;
create policy qa_exploratory_sessions_upd on public.qa_exploratory_sessions for update to authenticated using (public.qa_role() in ('admin','qa')) with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_exploratory_sessions_del on public.qa_exploratory_sessions;
create policy qa_exploratory_sessions_del on public.qa_exploratory_sessions for delete to authenticated using (public.qa_is_admin() or created_by = auth.uid()::text);

-- ───────────── qa_test_runs (dono = assigned_to) ─────────────
drop policy if exists qa_test_runs_all on public.qa_test_runs;
revoke all on public.qa_test_runs from anon;
alter table public.qa_test_runs enable row level security;
grant select, insert, update, delete on public.qa_test_runs to authenticated;
drop policy if exists qa_test_runs_sel on public.qa_test_runs;
create policy qa_test_runs_sel on public.qa_test_runs for select to authenticated using (public.qa_role() is not null);
drop policy if exists qa_test_runs_ins on public.qa_test_runs;
create policy qa_test_runs_ins on public.qa_test_runs for insert to authenticated with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_test_runs_upd on public.qa_test_runs;
create policy qa_test_runs_upd on public.qa_test_runs for update to authenticated using (public.qa_role() in ('admin','qa')) with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_test_runs_del on public.qa_test_runs;
create policy qa_test_runs_del on public.qa_test_runs for delete to authenticated using (public.qa_is_admin() or assigned_to = auth.uid()::text);

-- ───────────── qa_test_case_versions (dono = saved_by; append-only) ─────────────
drop policy if exists qa_test_case_versions_all on public.qa_test_case_versions;
revoke all on public.qa_test_case_versions from anon;
alter table public.qa_test_case_versions enable row level security;
grant select, insert, delete on public.qa_test_case_versions to authenticated;
drop policy if exists qa_tcv_sel on public.qa_test_case_versions;
create policy qa_tcv_sel on public.qa_test_case_versions for select to authenticated using (public.qa_role() is not null);
drop policy if exists qa_tcv_ins on public.qa_test_case_versions;
create policy qa_tcv_ins on public.qa_test_case_versions for insert to authenticated with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_tcv_del on public.qa_test_case_versions;
create policy qa_tcv_del on public.qa_test_case_versions for delete to authenticated using (public.qa_is_admin() or saved_by = auth.uid()::text);

-- ───────────── tabelas sem dono (escrita/exclusão = admin|qa) ─────────────
-- qa_test_suites
drop policy if exists qa_test_suites_all on public.qa_test_suites;
revoke all on public.qa_test_suites from anon;
alter table public.qa_test_suites enable row level security;
grant select, insert, update, delete on public.qa_test_suites to authenticated;
drop policy if exists qa_test_suites_sel on public.qa_test_suites;
create policy qa_test_suites_sel on public.qa_test_suites for select to authenticated using (public.qa_role() is not null);
drop policy if exists qa_test_suites_ins on public.qa_test_suites;
create policy qa_test_suites_ins on public.qa_test_suites for insert to authenticated with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_test_suites_upd on public.qa_test_suites;
create policy qa_test_suites_upd on public.qa_test_suites for update to authenticated using (public.qa_role() in ('admin','qa')) with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_test_suites_del on public.qa_test_suites;
create policy qa_test_suites_del on public.qa_test_suites for delete to authenticated using (public.qa_role() in ('admin','qa'));

-- qa_milestones
drop policy if exists qa_milestones_all on public.qa_milestones;
revoke all on public.qa_milestones from anon;
alter table public.qa_milestones enable row level security;
grant select, insert, update, delete on public.qa_milestones to authenticated;
drop policy if exists qa_milestones_sel on public.qa_milestones;
create policy qa_milestones_sel on public.qa_milestones for select to authenticated using (public.qa_role() is not null);
drop policy if exists qa_milestones_ins on public.qa_milestones;
create policy qa_milestones_ins on public.qa_milestones for insert to authenticated with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_milestones_upd on public.qa_milestones;
create policy qa_milestones_upd on public.qa_milestones for update to authenticated using (public.qa_role() in ('admin','qa')) with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_milestones_del on public.qa_milestones;
create policy qa_milestones_del on public.qa_milestones for delete to authenticated using (public.qa_role() in ('admin','qa'));

-- qa_requirements
drop policy if exists qa_requirements_all on public.qa_requirements;
revoke all on public.qa_requirements from anon;
alter table public.qa_requirements enable row level security;
grant select, insert, update, delete on public.qa_requirements to authenticated;
drop policy if exists qa_requirements_sel on public.qa_requirements;
create policy qa_requirements_sel on public.qa_requirements for select to authenticated using (public.qa_role() is not null);
drop policy if exists qa_requirements_ins on public.qa_requirements;
create policy qa_requirements_ins on public.qa_requirements for insert to authenticated with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_requirements_upd on public.qa_requirements;
create policy qa_requirements_upd on public.qa_requirements for update to authenticated using (public.qa_role() in ('admin','qa')) with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_requirements_del on public.qa_requirements;
create policy qa_requirements_del on public.qa_requirements for delete to authenticated using (public.qa_role() in ('admin','qa'));

-- qa_test_run_results
drop policy if exists qa_test_run_results_all on public.qa_test_run_results;
revoke all on public.qa_test_run_results from anon;
alter table public.qa_test_run_results enable row level security;
grant select, insert, update, delete on public.qa_test_run_results to authenticated;
drop policy if exists qa_trr_sel on public.qa_test_run_results;
create policy qa_trr_sel on public.qa_test_run_results for select to authenticated using (public.qa_role() is not null);
drop policy if exists qa_trr_ins on public.qa_test_run_results;
create policy qa_trr_ins on public.qa_test_run_results for insert to authenticated with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_trr_upd on public.qa_test_run_results;
create policy qa_trr_upd on public.qa_test_run_results for update to authenticated using (public.qa_role() in ('admin','qa')) with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_trr_del on public.qa_test_run_results;
create policy qa_trr_del on public.qa_test_run_results for delete to authenticated using (public.qa_role() in ('admin','qa'));

-- qa_test_case_requirements
drop policy if exists qa_test_case_requirements_all on public.qa_test_case_requirements;
revoke all on public.qa_test_case_requirements from anon;
alter table public.qa_test_case_requirements enable row level security;
grant select, insert, update, delete on public.qa_test_case_requirements to authenticated;
drop policy if exists qa_tcr_sel on public.qa_test_case_requirements;
create policy qa_tcr_sel on public.qa_test_case_requirements for select to authenticated using (public.qa_role() is not null);
drop policy if exists qa_tcr_ins on public.qa_test_case_requirements;
create policy qa_tcr_ins on public.qa_test_case_requirements for insert to authenticated with check (public.qa_role() in ('admin','qa'));
drop policy if exists qa_tcr_del on public.qa_test_case_requirements;
create policy qa_tcr_del on public.qa_test_case_requirements for delete to authenticated using (public.qa_role() in ('admin','qa'));

-- ── Storage (qa-evidence): leitura pública; escrita só autenticado ──
drop policy if exists qa_evidence_insert on storage.objects;
create policy qa_evidence_insert on storage.objects for insert to authenticated with check (bucket_id = 'qa-evidence');
drop policy if exists qa_evidence_update on storage.objects;
create policy qa_evidence_update on storage.objects for update to authenticated using (bucket_id = 'qa-evidence') with check (bucket_id = 'qa-evidence');
drop policy if exists qa_evidence_delete on storage.objects;
create policy qa_evidence_delete on storage.objects for delete to authenticated using (bucket_id = 'qa-evidence');
