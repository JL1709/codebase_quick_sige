alter table public.projects
  add column overview_section_order jsonb not null default '["system:project-participants"]'::jsonb,
  add constraint projects_overview_section_order_array check (jsonb_typeof(overview_section_order) = 'array');

create table public.project_role_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (nullif(trim(name), '') is not null and char_length(name) <= 120),
  lifecycle text not null default 'active' check (lifecycle in ('active', 'archived')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index project_role_definitions_active_name_idx
  on public.project_role_definitions (organization_id, lower(trim(name)))
  where lifecycle = 'active';
create index project_role_definitions_organization_sort_idx
  on public.project_role_definitions (organization_id, sort_order);

alter table public.project_contact_roles
  add column role_definition_id uuid references public.project_role_definitions(id) on delete restrict;

insert into public.project_role_definitions (organization_id, name, sort_order, created_at, updated_at)
select assignment.organization_id,
       trim(role.custom_label),
       row_number() over (partition by assignment.organization_id order by lower(trim(role.custom_label))) - 1,
       min(role.created_at),
       now()
from public.project_contact_roles role
join public.project_contact_assignments assignment on assignment.id = role.assignment_id
where role.role = 'custom' and nullif(trim(role.custom_label), '') is not null
group by assignment.organization_id, lower(trim(role.custom_label)), trim(role.custom_label)
on conflict do nothing;

update public.project_contact_roles role
set role_definition_id = definition.id
from public.project_contact_assignments assignment,
     public.project_role_definitions definition
where assignment.id = role.assignment_id
  and role.role = 'custom'
  and definition.organization_id = assignment.organization_id
  and lower(trim(definition.name)) = lower(trim(role.custom_label));

alter table public.project_contact_roles
  drop constraint if exists project_contact_roles_role_check,
  drop constraint if exists project_contact_roles_check,
  add constraint project_contact_roles_role_check check (
    role in ('client', 'owner', 'responsible_third_party', 'coordinator', 'architect', 'planner', 'site_manager', 'contractor', 'custom')
  ),
  add constraint project_contact_roles_definition_check check (
    (role = 'custom' and role_definition_id is not null)
    or (role <> 'custom' and role_definition_id is null and custom_label is null)
  );

drop index if exists public.project_contact_roles_unique_idx;
create unique index project_contact_roles_unique_idx
  on public.project_contact_roles (assignment_id, role, coalesce(role_definition_id, '00000000-0000-0000-0000-000000000000'::uuid));

create or replace function public.validate_project_contact_role_organization()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  assignment_organization_id uuid;
  definition_organization_id uuid;
begin
  select organization_id into assignment_organization_id
  from public.project_contact_assignments
  where id = new.assignment_id;

  if new.role_definition_id is not null then
    select organization_id into definition_organization_id
    from public.project_role_definitions
    where id = new.role_definition_id;
    if assignment_organization_id is distinct from definition_organization_id then
      raise exception 'Project role definition must belong to the assignment organization';
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_project_contact_role_organization
before insert or update on public.project_contact_roles
for each row execute function public.validate_project_contact_role_organization();

alter table public.project_role_definitions enable row level security;
create policy "members read project role definitions"
  on public.project_role_definitions for select
  using (public.is_organization_member(organization_id));
create policy "editors manage project role definitions"
  on public.project_role_definitions for all
  using (public.can_edit_organization(organization_id))
  with check (public.can_edit_organization(organization_id));
