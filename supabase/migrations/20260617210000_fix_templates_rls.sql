-- Recria as policies de qa_templates e qa_template_images para garantir
-- que usuários autenticados (Supabase Auth) possam salvar/atualizar templates.
-- A migration rls_by_role.sql não cobriu essas tabelas, mas pode ter deixado
-- o banco em estado inconsistente (anon revogado globalmente em algum ponto).

-- ── qa_templates ──
revoke all on public.qa_templates from anon;
grant select, insert, update, delete on public.qa_templates to authenticated;

drop policy if exists qa_templates_select on public.qa_templates;
create policy qa_templates_select on public.qa_templates
  for select to authenticated using (true);

drop policy if exists qa_templates_insert on public.qa_templates;
create policy qa_templates_insert on public.qa_templates
  for insert to authenticated with check (true);

drop policy if exists qa_templates_update on public.qa_templates;
create policy qa_templates_update on public.qa_templates
  for update to authenticated using (true) with check (true);

drop policy if exists qa_templates_delete on public.qa_templates;
create policy qa_templates_delete on public.qa_templates
  for delete to authenticated using (true);

-- ── qa_template_images ──
revoke all on public.qa_template_images from anon;
grant select, insert, update, delete on public.qa_template_images to authenticated;

drop policy if exists qa_template_images_select on public.qa_template_images;
create policy qa_template_images_select on public.qa_template_images
  for select to authenticated using (true);

drop policy if exists qa_template_images_insert on public.qa_template_images;
create policy qa_template_images_insert on public.qa_template_images
  for insert to authenticated with check (true);

drop policy if exists qa_template_images_update on public.qa_template_images;
create policy qa_template_images_update on public.qa_template_images
  for update to authenticated using (true) with check (true);

drop policy if exists qa_template_images_delete on public.qa_template_images;
create policy qa_template_images_delete on public.qa_template_images
  for delete to authenticated using (true);
