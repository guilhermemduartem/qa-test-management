-- Permite que role 'qa' delete qualquer execução (não apenas as próprias).
-- Antes, a policy exigia assigned_to = auth.uid(), bloqueando seed data e
-- runs sem dono atribuído. Consistente com qa_test_suites e qa_milestones.
drop policy if exists qa_test_runs_del on public.qa_test_runs;
create policy qa_test_runs_del on public.qa_test_runs
  for delete to authenticated
  using (public.qa_is_admin() or public.qa_role() = 'qa' or assigned_to = auth.uid()::text);
