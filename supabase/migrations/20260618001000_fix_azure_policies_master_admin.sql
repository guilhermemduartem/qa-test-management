-- ═══════════════════════════════════════════════════════════
-- Fix: policies do Azure DevOps hardcodavam role = 'admin' via
-- subquery EXISTS, ignorando qa_is_admin()/qa_role(). Assim
-- master_admin não conseguia configurar conexões nem templates.
--
-- Recriadas usando as funções helper (master_admin já incluso após
-- 20260618000000). qa_azure_user_settings é por-usuário, sem mudança.
-- ═══════════════════════════════════════════════════════════

-- ── qa_azure_configs: leitura para todos; escrita só admin/master_admin ──
drop policy if exists "azure_configs_insert" on qa_azure_configs;
create policy "azure_configs_insert" on qa_azure_configs
  for insert to authenticated
  with check (public.qa_is_admin());

drop policy if exists "azure_configs_update" on qa_azure_configs;
create policy "azure_configs_update" on qa_azure_configs
  for update to authenticated
  using (public.qa_is_admin());

drop policy if exists "azure_configs_delete" on qa_azure_configs;
create policy "azure_configs_delete" on qa_azure_configs
  for delete to authenticated
  using (public.qa_is_admin());

-- ── qa_azure_templates: leitura para todos; escrita admin/master_admin + qa ──
drop policy if exists "azure_templates_write" on qa_azure_templates;
create policy "azure_templates_write" on qa_azure_templates
  for all to authenticated
  using (public.qa_is_admin() or public.qa_role() = 'qa')
  with check (public.qa_is_admin() or public.qa_role() = 'qa');
