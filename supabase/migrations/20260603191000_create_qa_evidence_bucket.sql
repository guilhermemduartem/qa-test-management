-- ═══════════════════════════════════════════════════════════════════════════
-- Storage para EVIDÊNCIAS das execuções (upload real de arquivos/prints)
-- ═══════════════════════════════════════════════════════════════════════════
-- Bucket público `qa-evidence`: a URL pública é usada direto no app (sem signed
-- URL). Políticas permissivas para anon + authenticated, no mesmo modelo das
-- tabelas qa_test_* (o app autentica de forma mock e conecta como `anon`).
--
-- 🔒 ENDURECER com Supabase Auth real: tornar o bucket privado, usar signed URLs
-- e restringir as policies por papel/owner.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('qa-evidence', 'qa-evidence', true)
on conflict (id) do nothing;

drop policy if exists qa_evidence_select on storage.objects;
create policy qa_evidence_select on storage.objects
  for select to anon, authenticated using (bucket_id = 'qa-evidence');

drop policy if exists qa_evidence_insert on storage.objects;
create policy qa_evidence_insert on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'qa-evidence');

drop policy if exists qa_evidence_update on storage.objects;
create policy qa_evidence_update on storage.objects
  for update to anon, authenticated using (bucket_id = 'qa-evidence') with check (bucket_id = 'qa-evidence');

drop policy if exists qa_evidence_delete on storage.objects;
create policy qa_evidence_delete on storage.objects
  for delete to anon, authenticated using (bucket_id = 'qa-evidence');
