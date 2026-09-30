alter table public.project_role_definitions
  add column project_id uuid references public.projects(id) on delete cascade;

drop index if exists public.project_role_definitions_active_name_idx;
create unique index project_role_definitions_active_reusable_name_idx
  on public.project_role_definitions (organization_id, lower(trim(name)))
  where lifecycle = 'active' and project_id is null;
create unique index project_role_definitions_active_project_name_idx
  on public.project_role_definitions (organization_id, project_id, lower(trim(name)))
  where lifecycle = 'active' and project_id is not null;
create index project_role_definitions_project_sort_idx
  on public.project_role_definitions (project_id, sort_order)
  where project_id is not null;

create or replace function public.validate_project_role_definition_project()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  project_organization_id uuid;
begin
  if new.project_id is not null then
    select organization_id into project_organization_id
    from public.projects
    where id = new.project_id;
    if new.organization_id is distinct from project_organization_id then
      raise exception 'Project role definition must belong to the project organization';
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_project_role_definition_project
before insert or update on public.project_role_definitions
for each row execute function public.validate_project_role_definition_project();

create or replace function public.validate_project_contact_role_organization()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  assignment_organization_id uuid;
  assignment_project_id uuid;
  definition_organization_id uuid;
  definition_project_id uuid;
begin
  select organization_id, project_id into assignment_organization_id, assignment_project_id
  from public.project_contact_assignments
  where id = new.assignment_id;

  if new.role_definition_id is not null then
    select organization_id, project_id into definition_organization_id, definition_project_id
    from public.project_role_definitions
    where id = new.role_definition_id;
    if assignment_organization_id is distinct from definition_organization_id then
      raise exception 'Project role definition must belong to the assignment organization';
    end if;
    if definition_project_id is not null and assignment_project_id is distinct from definition_project_id then
      raise exception 'Project-scoped role definition must belong to the assignment project';
    end if;
  end if;
  return new;
end;
$$;
