-- ═══════════════════════════════════════════════════════════
-- Modelo de permissões aberto: todo usuário (exceto viewer) pode
-- CRIAR e USAR tudo, e EDITAR/EXCLUIR apenas os PRÓPRIOS registros.
-- Editar/excluir dados de outros = só admin/master_admin.
--
-- Antes, INSERT/UPDATE eram restritos a admin/qa, bloqueando os demais
-- papéis (developer, tech_lead, etc.). viewer permanece somente-leitura
-- (espelha canWrite = role !== 'viewer' no frontend).
--
-- Regras:
--   • SELECT  : qualquer papel ativo (qa_role() is not null)
--   • INSERT  : qa_can_write()  (qualquer papel ativo menos viewer)
--   • UPDATE  : admin OU (pode escrever E é dono / registro sem dono)
--   • DELETE  : admin OU (pode escrever E é dono / registro sem dono)
--   • Estruturas compartilhadas sem dono (suites, sprints, marcos, cards,
--     requisitos): criar/editar liberado; excluir só admin (protege a
--     estrutura org de deleções em cascata acidentais).
-- ═══════════════════════════════════════════════════════════

-- Papel pode escrever? (ativo e não-viewer). admin/master_admin passam,
-- pois qa_role() normaliza master_admin -> 'admin'.
create or replace function public.qa_can_write()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce(public.qa_role() is not null and public.qa_role() <> 'viewer', false)
$$;

-- ─────────────── Tabelas COM dono ───────────────
-- Macro mental: ins = qa_can_write(); upd/del = admin OR (write AND own/null)

-- qa_test_projects (created_by)
drop policy if exists qa_test_projects_ins on public.qa_test_projects;
drop policy if exists qa_test_projects_upd on public.qa_test_projects;
drop policy if exists qa_test_projects_del on public.qa_test_projects;
create policy qa_test_projects_ins on public.qa_test_projects for insert to authenticated with check (public.qa_can_write());
create policy qa_test_projects_upd on public.qa_test_projects for update to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (created_by = auth.uid()::text or created_by is null))) with check (public.qa_can_write());
create policy qa_test_projects_del on public.qa_test_projects for delete to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (created_by = auth.uid()::text or created_by is null)));

-- qa_test_cases (created_by)
drop policy if exists qa_test_cases_ins on public.qa_test_cases;
drop policy if exists qa_test_cases_upd on public.qa_test_cases;
drop policy if exists qa_test_cases_del on public.qa_test_cases;
create policy qa_test_cases_ins on public.qa_test_cases for insert to authenticated with check (public.qa_can_write());
create policy qa_test_cases_upd on public.qa_test_cases for update to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (created_by = auth.uid()::text or created_by is null))) with check (public.qa_can_write());
create policy qa_test_cases_del on public.qa_test_cases for delete to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (created_by = auth.uid()::text or created_by is null)));

-- qa_test_plans (created_by)
drop policy if exists qa_test_plans_ins on public.qa_test_plans;
drop policy if exists qa_test_plans_upd on public.qa_test_plans;
drop policy if exists qa_test_plans_del on public.qa_test_plans;
create policy qa_test_plans_ins on public.qa_test_plans for insert to authenticated with check (public.qa_can_write());
create policy qa_test_plans_upd on public.qa_test_plans for update to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (created_by = auth.uid()::text or created_by is null))) with check (public.qa_can_write());
create policy qa_test_plans_del on public.qa_test_plans for delete to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (created_by = auth.uid()::text or created_by is null)));

-- qa_defects (created_by)
drop policy if exists qa_defects_ins on public.qa_defects;
drop policy if exists qa_defects_upd on public.qa_defects;
drop policy if exists qa_defects_del on public.qa_defects;
create policy qa_defects_ins on public.qa_defects for insert to authenticated with check (public.qa_can_write());
create policy qa_defects_upd on public.qa_defects for update to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (created_by = auth.uid()::text or created_by is null))) with check (public.qa_can_write());
create policy qa_defects_del on public.qa_defects for delete to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (created_by = auth.uid()::text or created_by is null)));

-- qa_exploratory_sessions (created_by)
drop policy if exists qa_exploratory_sessions_ins on public.qa_exploratory_sessions;
drop policy if exists qa_exploratory_sessions_upd on public.qa_exploratory_sessions;
drop policy if exists qa_exploratory_sessions_del on public.qa_exploratory_sessions;
create policy qa_exploratory_sessions_ins on public.qa_exploratory_sessions for insert to authenticated with check (public.qa_can_write());
create policy qa_exploratory_sessions_upd on public.qa_exploratory_sessions for update to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (created_by = auth.uid()::text or created_by is null))) with check (public.qa_can_write());
create policy qa_exploratory_sessions_del on public.qa_exploratory_sessions for delete to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (created_by = auth.uid()::text or created_by is null)));

-- qa_report_data_entries (created_by_id)
drop policy if exists qa_report_data_entries_ins on public.qa_report_data_entries;
drop policy if exists qa_report_data_entries_upd on public.qa_report_data_entries;
drop policy if exists qa_report_data_entries_del on public.qa_report_data_entries;
create policy qa_report_data_entries_ins on public.qa_report_data_entries for insert to authenticated with check (public.qa_can_write());
create policy qa_report_data_entries_upd on public.qa_report_data_entries for update to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (created_by_id = auth.uid()::text or created_by_id is null))) with check (public.qa_can_write());
create policy qa_report_data_entries_del on public.qa_report_data_entries for delete to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (created_by_id = auth.uid()::text or created_by_id is null)));

-- qa_templates (created_by)
drop policy if exists qa_templates_ins on public.qa_templates;
drop policy if exists qa_templates_upd on public.qa_templates;
drop policy if exists qa_templates_del on public.qa_templates;
create policy qa_templates_ins on public.qa_templates for insert to authenticated with check (public.qa_can_write());
create policy qa_templates_upd on public.qa_templates for update to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (created_by = auth.uid()::text or created_by is null))) with check (public.qa_can_write());
create policy qa_templates_del on public.qa_templates for delete to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (created_by = auth.uid()::text or created_by is null)));

-- qa_test_runs (assigned_to = dono da execução)
drop policy if exists qa_test_runs_ins on public.qa_test_runs;
drop policy if exists qa_test_runs_upd on public.qa_test_runs;
drop policy if exists qa_test_runs_del on public.qa_test_runs;
create policy qa_test_runs_ins on public.qa_test_runs for insert to authenticated with check (public.qa_can_write());
create policy qa_test_runs_upd on public.qa_test_runs for update to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (assigned_to = auth.uid()::text or assigned_to is null))) with check (public.qa_can_write());
create policy qa_test_runs_del on public.qa_test_runs for delete to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (assigned_to = auth.uid()::text or assigned_to is null)));

-- qa_test_run_results (executed_by = quem executou)
drop policy if exists qa_test_run_results_ins on public.qa_test_run_results;
drop policy if exists qa_test_run_results_upd on public.qa_test_run_results;
drop policy if exists qa_test_run_results_del on public.qa_test_run_results;
drop policy if exists qa_trr_ins on public.qa_test_run_results;
drop policy if exists qa_trr_upd on public.qa_test_run_results;
drop policy if exists qa_trr_del on public.qa_test_run_results;
drop policy if exists qa_trr_sel on public.qa_test_run_results;
create policy qa_test_run_results_ins on public.qa_test_run_results for insert to authenticated with check (public.qa_can_write());
create policy qa_test_run_results_upd on public.qa_test_run_results for update to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (executed_by = auth.uid()::text or executed_by is null))) with check (public.qa_can_write());
create policy qa_test_run_results_del on public.qa_test_run_results for delete to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (executed_by = auth.uid()::text or executed_by is null)));

-- qa_test_case_versions (saved_by) — log append-only (sel/ins/del)
drop policy if exists qa_tcv_ins on public.qa_test_case_versions;
drop policy if exists qa_tcv_del on public.qa_test_case_versions;
create policy qa_tcv_ins on public.qa_test_case_versions for insert to authenticated with check (public.qa_can_write());
create policy qa_tcv_del on public.qa_test_case_versions for delete to authenticated using (public.qa_is_admin() or (public.qa_can_write() and (saved_by = auth.uid()::text or saved_by is null)));

-- ─────────────── Estruturas COMPARTILHADAS (sem dono) ───────────────
-- criar/editar: qualquer escritor; excluir: só admin (protege cascata)

-- qa_test_suites
drop policy if exists qa_test_suites_ins on public.qa_test_suites;
drop policy if exists qa_test_suites_upd on public.qa_test_suites;
drop policy if exists qa_test_suites_del on public.qa_test_suites;
create policy qa_test_suites_ins on public.qa_test_suites for insert to authenticated with check (public.qa_can_write());
create policy qa_test_suites_upd on public.qa_test_suites for update to authenticated using (public.qa_can_write()) with check (public.qa_can_write());
create policy qa_test_suites_del on public.qa_test_suites for delete to authenticated using (public.qa_is_admin() or public.qa_can_write());

-- qa_milestones
drop policy if exists qa_milestones_ins on public.qa_milestones;
drop policy if exists qa_milestones_upd on public.qa_milestones;
drop policy if exists qa_milestones_del on public.qa_milestones;
create policy qa_milestones_ins on public.qa_milestones for insert to authenticated with check (public.qa_can_write());
create policy qa_milestones_upd on public.qa_milestones for update to authenticated using (public.qa_can_write()) with check (public.qa_can_write());
create policy qa_milestones_del on public.qa_milestones for delete to authenticated using (public.qa_is_admin());

-- qa_sprints
drop policy if exists qa_sprints_ins on public.qa_sprints;
drop policy if exists qa_sprints_upd on public.qa_sprints;
drop policy if exists qa_sprints_del on public.qa_sprints;
create policy qa_sprints_ins on public.qa_sprints for insert to authenticated with check (public.qa_can_write());
create policy qa_sprints_upd on public.qa_sprints for update to authenticated using (public.qa_can_write()) with check (public.qa_can_write());
create policy qa_sprints_del on public.qa_sprints for delete to authenticated using (public.qa_is_admin());

-- qa_cards
drop policy if exists qa_cards_ins on public.qa_cards;
drop policy if exists qa_cards_upd on public.qa_cards;
drop policy if exists qa_cards_del on public.qa_cards;
create policy qa_cards_ins on public.qa_cards for insert to authenticated with check (public.qa_can_write());
create policy qa_cards_upd on public.qa_cards for update to authenticated using (public.qa_can_write()) with check (public.qa_can_write());
create policy qa_cards_del on public.qa_cards for delete to authenticated using (public.qa_is_admin());

-- qa_requirements
drop policy if exists qa_requirements_ins on public.qa_requirements;
drop policy if exists qa_requirements_upd on public.qa_requirements;
drop policy if exists qa_requirements_del on public.qa_requirements;
create policy qa_requirements_ins on public.qa_requirements for insert to authenticated with check (public.qa_can_write());
create policy qa_requirements_upd on public.qa_requirements for update to authenticated using (public.qa_can_write()) with check (public.qa_can_write());
create policy qa_requirements_del on public.qa_requirements for delete to authenticated using (public.qa_is_admin());

-- qa_test_case_requirements (link case<->requisito) — conectivo, liberado
drop policy if exists qa_test_case_requirements_ins on public.qa_test_case_requirements;
drop policy if exists qa_test_case_requirements_upd on public.qa_test_case_requirements;
drop policy if exists qa_test_case_requirements_del on public.qa_test_case_requirements;
drop policy if exists qa_tcr_ins on public.qa_test_case_requirements;
drop policy if exists qa_tcr_del on public.qa_test_case_requirements;
drop policy if exists qa_tcr_sel on public.qa_test_case_requirements;
create policy qa_test_case_requirements_ins on public.qa_test_case_requirements for insert to authenticated with check (public.qa_can_write());
create policy qa_test_case_requirements_del on public.qa_test_case_requirements for delete to authenticated using (public.qa_can_write());

-- ─────────────── CHILD: imagens de template (dono = template) ───────────────
drop policy if exists qa_template_images_ins on public.qa_template_images;
drop policy if exists qa_template_images_upd on public.qa_template_images;
drop policy if exists qa_template_images_del on public.qa_template_images;
create policy qa_template_images_ins on public.qa_template_images for insert to authenticated
  with check (public.qa_is_admin() or template_id in (select id from public.qa_templates where created_by = auth.uid()::text or created_by is null));
create policy qa_template_images_upd on public.qa_template_images for update to authenticated
  using (public.qa_is_admin() or template_id in (select id from public.qa_templates where created_by = auth.uid()::text or created_by is null))
  with check (public.qa_is_admin() or template_id in (select id from public.qa_templates where created_by = auth.uid()::text or created_by is null));
create policy qa_template_images_del on public.qa_template_images for delete to authenticated
  using (public.qa_is_admin() or template_id in (select id from public.qa_templates where created_by = auth.uid()::text or created_by is null));
