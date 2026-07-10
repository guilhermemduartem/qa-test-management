-- ═══════════════════════════════════════════════════════════════════════════
-- qa_bulk_templates / qa_bulk_template_folders
-- Templates da Importação Massiva (APIs → Suporte) e suas pastas.
-- Persistência compartilhada (antes só localStorage por navegador) → habilita
-- o fluxo admin cria template → QA executa em "Runs".
--
-- RLS: mesmo modelo das demais tabelas qa_* hoje — permissiva (anon +
-- authenticated); o controle por papel (admin cria/edita, demais só executam)
-- é feito na UI via RequireAdmin/readOnly e can() (auth.ts).
-- 🔒 ENDURECER junto com o restante quando houver Supabase Auth real.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.qa_bulk_templates (
  id          text primary key,
  name        text not null default 'Template',
  folder      text not null default '',
  env_id      text not null default '',
  mode        text not null default 'seq',
  data        jsonb not null default '{}'::jsonb,  -- { preRequests, importRequests, bodyVars }
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists qa_bulk_templates_folder_idx on public.qa_bulk_templates (folder);

create table if not exists public.qa_bulk_template_folders (
  path        text primary key,
  created_by  text,
  created_at  timestamptz not null default now()
);






-- ── RLS: permissiva (anon + authenticated) — controle por papel na UI ──
alter table public.qa_bulk_templates enable row level security;
drop policy if exists qa_bulk_templates_all on public.qa_bulk_templates;
create policy qa_bulk_templates_all on public.qa_bulk_templates for all to anon, authenticated using (true) with check (true);

alter table public.qa_bulk_template_folders enable row level security;
drop policy if exists qa_bulk_template_folders_all on public.qa_bulk_template_folders;
create policy qa_bulk_template_folders_all on public.qa_bulk_template_folders for all to anon, authenticated using (true) with check (true);
