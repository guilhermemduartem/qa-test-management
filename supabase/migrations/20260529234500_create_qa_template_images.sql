create table if not exists public.qa_template_images (
  template_id text not null references public.qa_templates(id) on delete cascade,
  criterion_id text not null,
  image_id text not null,
  name text,
  sort_order integer not null default 0,
  data_url text not null,
  created_at timestamptz not null default now(),
  primary key (template_id, criterion_id, image_id)
);

create index if not exists idx_qa_template_images_template
  on public.qa_template_images (template_id);

create index if not exists idx_qa_template_images_template_order
  on public.qa_template_images (template_id, criterion_id, sort_order);

alter table public.qa_template_images enable row level security;

drop policy if exists qa_template_images_select on public.qa_template_images;
create policy qa_template_images_select
on public.qa_template_images
for select
to anon, authenticated
using (true);

drop policy if exists qa_template_images_insert on public.qa_template_images;
create policy qa_template_images_insert
on public.qa_template_images
for insert
to anon, authenticated
with check (true);

drop policy if exists qa_template_images_update on public.qa_template_images;
create policy qa_template_images_update
on public.qa_template_images
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists qa_template_images_delete on public.qa_template_images;
create policy qa_template_images_delete
on public.qa_template_images
for delete
to anon, authenticated
using (true);

grant select, insert, update, delete on public.qa_template_images to anon, authenticated;
