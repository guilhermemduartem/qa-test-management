-- ═══════════════════════════════════════════════════════════
-- Azure DevOps Integration Tables
-- ═══════════════════════════════════════════════════════════

-- Admin-configured Azure DevOps connections (org + project, no PAT — PAT is per user)
create table if not exists qa_azure_configs (
  id          text        primary key,
  name        text        not null,
  organization text       not null,
  project     text        not null,
  created_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Per-user Azure settings: PAT + Azure identity (email/display name)
create table if not exists qa_azure_user_settings (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  azure_email text        not null default '',
  pat         text        not null default '',
  updated_at  timestamptz not null default now()
);

-- Dynamic bug templates (field definitions per connection)
create table if not exists qa_azure_templates (
  id              text        primary key,
  name            text        not null,
  azure_config_id text        not null references qa_azure_configs(id) on delete cascade,
  fields          jsonb       not null default '[]',
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- Extend qa_defects with Azure DevOps fields
alter table qa_defects
  add column if not exists azure_work_item_id   integer,
  add column if not exists azure_config_id      text references qa_azure_configs(id) on delete set null,
  add column if not exists azure_template_id    text references qa_azure_templates(id) on delete set null,
  add column if not exists azure_state          text,
  add column if not exists azure_synced_at      timestamptz,
  add column if not exists azure_custom_fields  jsonb default '{}';

-- ── RLS ──────────────────────────────────────────────────────

alter table qa_azure_configs      enable row level security;
alter table qa_azure_user_settings enable row level security;
alter table qa_azure_templates    enable row level security;

-- Configs: any authenticated user can read; only admin can write
drop policy if exists "azure_configs_select" on qa_azure_configs;
create policy "azure_configs_select" on qa_azure_configs
  for select to authenticated using (true);

drop policy if exists "azure_configs_insert" on qa_azure_configs;
create policy "azure_configs_insert" on qa_azure_configs
  for insert to authenticated
  with check (exists (select 1 from qa_profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "azure_configs_update" on qa_azure_configs;
create policy "azure_configs_update" on qa_azure_configs
  for update to authenticated
  using (exists (select 1 from qa_profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "azure_configs_delete" on qa_azure_configs;
create policy "azure_configs_delete" on qa_azure_configs
  for delete to authenticated
  using (exists (select 1 from qa_profiles where id = auth.uid() and role = 'admin'));

-- User settings: each user manages their own row
drop policy if exists "azure_user_settings_select" on qa_azure_user_settings;
create policy "azure_user_settings_select" on qa_azure_user_settings
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "azure_user_settings_insert" on qa_azure_user_settings;
create policy "azure_user_settings_insert" on qa_azure_user_settings
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "azure_user_settings_update" on qa_azure_user_settings;
create policy "azure_user_settings_update" on qa_azure_user_settings
  for update to authenticated using (user_id = auth.uid());

drop policy if exists "azure_user_settings_delete" on qa_azure_user_settings;
create policy "azure_user_settings_delete" on qa_azure_user_settings
  for delete to authenticated using (user_id = auth.uid());

-- Templates: all authenticated can read; admin + qa can write
drop policy if exists "azure_templates_select" on qa_azure_templates;
create policy "azure_templates_select" on qa_azure_templates
  for select to authenticated using (true);

drop policy if exists "azure_templates_write" on qa_azure_templates;
create policy "azure_templates_write" on qa_azure_templates
  for all to authenticated
  using (exists (select 1 from qa_profiles where id = auth.uid() and role in ('admin','qa')))
  with check (exists (select 1 from qa_profiles where id = auth.uid() and role in ('admin','qa')));
