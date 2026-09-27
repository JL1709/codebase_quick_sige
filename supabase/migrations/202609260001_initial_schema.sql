create extension if not exists pgcrypto;

create type public.organization_role as enum ('owner', 'admin', 'editor', 'viewer');
create type public.translation_status as enum ('draft', 'reviewed', 'approved');
create type public.project_status as enum ('draft', 'in_review', 'published', 'archived');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  default_locale text not null default 'de' check (default_locale in ('de', 'en')),
  accent_color text not null default '#d5ff3f',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null default 'viewer',
  preferred_locale text not null default 'de' check (preferred_locale in ('de', 'en')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_number text not null,
  name text not null,
  description text not null default '',
  address text not null default '',
  city text not null default '',
  construction_type text not null check (construction_type in ('new_build', 'renovation', 'demolition')),
  start_date date,
  end_date date,
  status public.project_status not null default 'draft',
  document_locale text not null default 'de' check (document_locale in ('de', 'en')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, project_number)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company text not null default '',
  name text not null,
  email text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_participants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  role text not null check (role in ('client', 'owner', 'coordinator', 'architect', 'planner', 'site_manager', 'contractor')),
  created_at timestamptz not null default now()
);

create table public.project_emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null,
  name text not null default '',
  phone text not null,
  sort_order integer not null default 0
);

create table public.building_block_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  stable_key text not null,
  color text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, stable_key)
);

create table public.building_block_category_translations (
  category_id uuid not null references public.building_block_categories(id) on delete cascade,
  locale text not null check (locale in ('de', 'en')),
  name text not null,
  description text not null default '',
  status public.translation_status not null default 'draft',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  primary key (category_id, locale)
);

create table public.building_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  category_id uuid not null references public.building_block_categories(id) on delete restrict,
  code text not null,
  visual_key text not null,
  color text not null,
  tags text[] not null default '{}',
  content_version integer not null default 1 check (content_version > 0),
  source text not null default 'system' check (source in ('system', 'organization')),
  supersedes_id uuid references public.building_blocks(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, code, content_version)
);

create table public.building_block_translations (
  building_block_id uuid not null references public.building_blocks(id) on delete cascade,
  locale text not null check (locale in ('de', 'en')),
  title text not null,
  short_description text not null,
  long_description text not null,
  search_terms text[] not null default '{}',
  status public.translation_status not null default 'draft',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  primary key (building_block_id, locale)
);

create table public.regulations (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique,
  title text not null,
  source_url text,
  status text not null default 'active' check (status in ('active', 'review_required', 'superseded')),
  reviewed_at timestamptz,
  superseded_by uuid references public.regulations(id)
);

create table public.building_block_regulations (
  building_block_id uuid not null references public.building_blocks(id) on delete cascade,
  regulation_id uuid not null references public.regulations(id) on delete restrict,
  sort_order integer not null default 0,
  primary key (building_block_id, regulation_id)
);

create table public.project_assessments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  definition_version integer not null,
  answers jsonb not null default '{}',
  completed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recommendation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  assessment_id uuid not null references public.project_assessments(id) on delete cascade,
  rule_set_version integer not null,
  input_snapshot jsonb not null,
  results jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  recommendation_run_id uuid references public.recommendation_runs(id),
  title text not null,
  document_locale text not null check (document_locale in ('de', 'en')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plan_sections (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  category_id uuid not null references public.building_block_categories(id) on delete restrict,
  title_overrides jsonb not null default '{}',
  sort_order integer not null default 0
);

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_section_id uuid not null references public.plan_sections(id) on delete cascade,
  building_block_id uuid not null references public.building_blocks(id) on delete restrict,
  custom_short_descriptions jsonb not null default '{}',
  expert_note text not null default '',
  recommendation_result jsonb,
  sort_order integer not null default 0
);

create table public.plan_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  revision_index text not null,
  change_summary text not null,
  approved_by_name text not null,
  approved_by_user_id uuid references auth.users(id),
  snapshot jsonb not null,
  published_at timestamptz not null default now(),
  unique (project_id, revision_index)
);

create table public.project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.plan_assets (
  plan_id uuid not null references public.plans(id) on delete cascade,
  project_asset_id uuid not null references public.project_assets(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (plan_id, project_asset_id)
);

create table public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  revision_id uuid references public.plan_revisions(id) on delete cascade,
  document_type text not null,
  locale text not null check (locale in ('de', 'en')),
  storage_path text not null,
  content_hash text not null,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and membership.role in ('owner', 'admin', 'editor')
  );
$$;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.projects enable row level security;
alter table public.contacts enable row level security;
alter table public.project_participants enable row level security;
alter table public.project_emergency_contacts enable row level security;
alter table public.project_assessments enable row level security;
alter table public.recommendation_runs enable row level security;
alter table public.plans enable row level security;
alter table public.plan_sections enable row level security;
alter table public.plan_items enable row level security;
alter table public.plan_assets enable row level security;
alter table public.plan_revisions enable row level security;
alter table public.project_assets enable row level security;
alter table public.generated_documents enable row level security;
alter table public.audit_events enable row level security;

create policy "members read organizations" on public.organizations for select using (public.is_organization_member(id));
create policy "members read memberships" on public.organization_memberships for select using (public.is_organization_member(organization_id));
create policy "members read projects" on public.projects for select using (public.is_organization_member(organization_id));
create policy "editors create projects" on public.projects for insert with check (public.can_edit_organization(organization_id));
create policy "editors update projects" on public.projects for update using (public.can_edit_organization(organization_id)) with check (public.can_edit_organization(organization_id));
create policy "members read contacts" on public.contacts for select using (public.is_organization_member(organization_id));
create policy "editors manage contacts" on public.contacts for all using (public.can_edit_organization(organization_id)) with check (public.can_edit_organization(organization_id));

create policy "members read project participants" on public.project_participants for select using (
  exists (select 1 from public.projects project where project.id = project_id and public.is_organization_member(project.organization_id))
);
create policy "editors manage project participants" on public.project_participants for all using (
  exists (select 1 from public.projects project where project.id = project_id and public.can_edit_organization(project.organization_id))
) with check (
  exists (select 1 from public.projects project where project.id = project_id and public.can_edit_organization(project.organization_id))
);

create policy "members read emergency contacts" on public.project_emergency_contacts for select using (
  exists (select 1 from public.projects project where project.id = project_id and public.is_organization_member(project.organization_id))
);
create policy "editors manage emergency contacts" on public.project_emergency_contacts for all using (
  exists (select 1 from public.projects project where project.id = project_id and public.can_edit_organization(project.organization_id))
) with check (
  exists (select 1 from public.projects project where project.id = project_id and public.can_edit_organization(project.organization_id))
);

-- Remaining project-owned tables inherit access through their project. These policies are intentionally explicit for auditability.
create policy "members read assessments" on public.project_assessments for select using (exists (select 1 from public.projects p where p.id = project_id and public.is_organization_member(p.organization_id)));
create policy "editors manage assessments" on public.project_assessments for all using (exists (select 1 from public.projects p where p.id = project_id and public.can_edit_organization(p.organization_id))) with check (exists (select 1 from public.projects p where p.id = project_id and public.can_edit_organization(p.organization_id)));
create policy "members read recommendation runs" on public.recommendation_runs for select using (exists (select 1 from public.projects p where p.id = project_id and public.is_organization_member(p.organization_id)));
create policy "editors manage recommendation runs" on public.recommendation_runs for all using (exists (select 1 from public.projects p where p.id = project_id and public.can_edit_organization(p.organization_id))) with check (exists (select 1 from public.projects p where p.id = project_id and public.can_edit_organization(p.organization_id)));
create policy "members read plans" on public.plans for select using (exists (select 1 from public.projects p where p.id = project_id and public.is_organization_member(p.organization_id)));
create policy "editors manage plans" on public.plans for all using (exists (select 1 from public.projects p where p.id = project_id and public.can_edit_organization(p.organization_id))) with check (exists (select 1 from public.projects p where p.id = project_id and public.can_edit_organization(p.organization_id)));
create policy "members read plan sections" on public.plan_sections for select using (exists (select 1 from public.plans plan join public.projects p on p.id = plan.project_id where plan.id = plan_id and public.is_organization_member(p.organization_id)));
create policy "editors manage plan sections" on public.plan_sections for all using (exists (select 1 from public.plans plan join public.projects p on p.id = plan.project_id where plan.id = plan_id and public.can_edit_organization(p.organization_id))) with check (exists (select 1 from public.plans plan join public.projects p on p.id = plan.project_id where plan.id = plan_id and public.can_edit_organization(p.organization_id)));
create policy "members read plan items" on public.plan_items for select using (exists (select 1 from public.plan_sections section join public.plans plan on plan.id = section.plan_id join public.projects p on p.id = plan.project_id where section.id = plan_section_id and public.is_organization_member(p.organization_id)));
create policy "editors manage plan items" on public.plan_items for all using (exists (select 1 from public.plan_sections section join public.plans plan on plan.id = section.plan_id join public.projects p on p.id = plan.project_id where section.id = plan_section_id and public.can_edit_organization(p.organization_id))) with check (exists (select 1 from public.plan_sections section join public.plans plan on plan.id = section.plan_id join public.projects p on p.id = plan.project_id where section.id = plan_section_id and public.can_edit_organization(p.organization_id)));
create policy "members read plan assets" on public.plan_assets for select using (exists (select 1 from public.plans plan join public.projects p on p.id = plan.project_id where plan.id = plan_id and public.is_organization_member(p.organization_id)));
create policy "editors manage plan assets" on public.plan_assets for all using (exists (select 1 from public.plans plan join public.projects p on p.id = plan.project_id where plan.id = plan_id and public.can_edit_organization(p.organization_id))) with check (exists (select 1 from public.plans plan join public.projects p on p.id = plan.project_id where plan.id = plan_id and public.can_edit_organization(p.organization_id)));
create policy "members read revisions" on public.plan_revisions for select using (exists (select 1 from public.projects p where p.id = project_id and public.is_organization_member(p.organization_id)));
create policy "editors publish revisions" on public.plan_revisions for insert with check (exists (select 1 from public.projects p where p.id = project_id and public.can_edit_organization(p.organization_id)));
create policy "members read assets" on public.project_assets for select using (exists (select 1 from public.projects p where p.id = project_id and public.is_organization_member(p.organization_id)));
create policy "editors manage assets" on public.project_assets for all using (exists (select 1 from public.projects p where p.id = project_id and public.can_edit_organization(p.organization_id))) with check (exists (select 1 from public.projects p where p.id = project_id and public.can_edit_organization(p.organization_id)));
create policy "members read documents" on public.generated_documents for select using (exists (select 1 from public.projects p where p.id = project_id and public.is_organization_member(p.organization_id)));
create policy "editors manage documents" on public.generated_documents for all using (exists (select 1 from public.projects p where p.id = project_id and public.can_edit_organization(p.organization_id))) with check (exists (select 1 from public.projects p where p.id = project_id and public.can_edit_organization(p.organization_id)));
create policy "members read audit events" on public.audit_events for select using (public.is_organization_member(organization_id));
create policy "editors create audit events" on public.audit_events for insert with check (public.can_edit_organization(organization_id));

-- System knowledge is readable by authenticated users; organization knowledge is isolated to its members.
alter table public.building_block_categories enable row level security;
alter table public.building_block_category_translations enable row level security;
alter table public.building_blocks enable row level security;
alter table public.building_block_translations enable row level security;
alter table public.regulations enable row level security;
alter table public.building_block_regulations enable row level security;

create policy "read available categories" on public.building_block_categories for select using (organization_id is null or public.is_organization_member(organization_id));
create policy "read available category translations" on public.building_block_category_translations for select using (exists (select 1 from public.building_block_categories c where c.id = category_id and (c.organization_id is null or public.is_organization_member(c.organization_id))));
create policy "read available blocks" on public.building_blocks for select using (organization_id is null or public.is_organization_member(organization_id));
create policy "read available block translations" on public.building_block_translations for select using (exists (select 1 from public.building_blocks b where b.id = building_block_id and (b.organization_id is null or public.is_organization_member(b.organization_id))));
create policy "authenticated users read regulations" on public.regulations for select to authenticated using (true);
create policy "authenticated users read block regulations" on public.building_block_regulations for select to authenticated using (true);

create index projects_organization_id_idx on public.projects(organization_id);
create index contacts_organization_id_idx on public.contacts(organization_id);
create index building_blocks_category_id_idx on public.building_blocks(category_id);
create index plan_sections_plan_id_sort_idx on public.plan_sections(plan_id, sort_order);
create index plan_items_section_id_sort_idx on public.plan_items(plan_section_id, sort_order);
create index plan_revisions_project_id_published_idx on public.plan_revisions(project_id, published_at desc);
create index audit_events_organization_id_created_idx on public.audit_events(organization_id, created_at desc);
