do $$
begin
  if not exists (select 1 from public.contact_emails where contact_id = '40000000-0000-0000-0000-000000000001' and normalized_value = 'legacy@example.com') then
    raise exception 'Legacy email was not backfilled';
  end if;
  if not exists (select 1 from public.contact_phones where contact_id = '40000000-0000-0000-0000-000000000001' and normalized_value = '+4930123') then
    raise exception 'Legacy phone was not backfilled';
  end if;
  if not exists (select 1 from public.project_contact_roles where role = 'architect') then
    raise exception 'Legacy project role was not backfilled';
  end if;
  if not exists (select 1 from public.projects where overview_section_order = '["system:project-participants"]'::jsonb) then
    raise exception 'Project overview order was not initialized';
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contacts'
      and column_name in ('name', 'display_name')
  ) then
    raise exception 'Legacy contact name columns were not removed';
  end if;
  if not exists (
    select 1
    from public.contacts
    where id = '40000000-0000-0000-0000-000000000001'
      and given_name = 'Legacy'
      and family_name = 'Person'
  ) then
    raise exception 'Legacy contact name was not backfilled into structured fields';
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_contact_assignments'
      and column_name = 'company_id'
  ) then
    raise exception 'Project assignment company source of truth was not removed';
  end if;
  if not exists (
    select 1
    from public.contact_company_affiliations affiliation
    where affiliation.contact_id = '40000000-0000-0000-0000-000000000001'
      and affiliation.is_primary
      and affiliation.lifecycle = 'active'
  ) then
    raise exception 'Canonical primary contact affiliation was not preserved';
  end if;
end;
$$;

insert into public.project_role_definitions (id, organization_id, name, sort_order) values
  ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Other tenant role', 0);

grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public, auth to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', false);

do $$
declare visible_contacts integer;
begin
  select count(*) into visible_contacts from public.contacts;
  if visible_contacts <> 1 then raise exception 'Viewer tenant isolation failed: % visible contacts', visible_contacts; end if;
  begin
    insert into public.companies (organization_id, name) values ('20000000-0000-0000-0000-000000000001', 'Viewer Write');
    raise exception 'Viewer company mutation unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', false);
insert into public.companies (id, organization_id, name) values ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Editor Company');
insert into public.project_role_definitions (id, organization_id, name, sort_order)
values ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Fire safety lead', 0);
insert into public.project_role_definitions (id, organization_id, project_id, name, sort_order)
values ('60000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Project-only lead', 0);
insert into public.project_contact_roles (assignment_id, role, role_definition_id, custom_label)
select assignment.id, 'custom', '60000000-0000-0000-0000-000000000001', 'Fire safety lead'
from public.project_contact_assignments assignment
where assignment.project_id = '30000000-0000-0000-0000-000000000001';

insert into public.projects (id, organization_id, project_number, name, construction_type)
values ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'QS-3', 'Project Three', 'new_build');
insert into public.project_contact_assignments (id, organization_id, project_id, contact_id)
values ('70000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001');

do $$
declare
  blocked_project_role_reference boolean := false;
  blocked_cross_tenant_project_scope boolean := false;
begin
  begin
    insert into public.companies (organization_id, name) values ('20000000-0000-0000-0000-000000000002', 'Cross Tenant Company');
    raise exception 'Editor cross-tenant mutation unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.project_contact_assignments (organization_id, project_id, contact_id)
    values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002');
    raise exception 'Cross-tenant assignment unexpectedly succeeded';
  exception when foreign_key_violation or insufficient_privilege then null;
  end;
  begin
    insert into public.project_role_definitions (organization_id, name)
    values ('20000000-0000-0000-0000-000000000002', 'Cross Tenant Role');
    raise exception 'Editor cross-tenant project role mutation unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.project_contact_roles (assignment_id, role, role_definition_id, custom_label)
    select assignment.id, 'custom', '60000000-0000-0000-0000-000000000002', 'Other tenant role'
    from public.project_contact_assignments assignment
    where assignment.project_id = '30000000-0000-0000-0000-000000000001';
    raise exception 'Cross-tenant project role reference unexpectedly succeeded';
  exception when raise_exception or foreign_key_violation or insufficient_privilege then null;
  end;
  begin
    insert into public.project_contact_roles (assignment_id, role, role_definition_id, custom_label)
    values ('70000000-0000-0000-0000-000000000003', 'custom', '60000000-0000-0000-0000-000000000003', 'Project-only lead');
  exception when raise_exception then
    blocked_project_role_reference := true;
  end;
  if not blocked_project_role_reference then
    raise exception 'Cross-project role reference unexpectedly succeeded';
  end if;
  begin
    insert into public.project_role_definitions (organization_id, project_id, name)
    values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'Wrong project organization');
  exception when raise_exception then
    blocked_cross_tenant_project_scope := true;
  end;
  if not blocked_cross_tenant_project_scope then
    raise exception 'Cross-tenant project scope unexpectedly succeeded';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', false);
insert into public.companies (organization_id, name) values ('20000000-0000-0000-0000-000000000001', 'Admin Company');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
insert into public.companies (organization_id, name) values ('20000000-0000-0000-0000-000000000001', 'Owner Company');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', false);
do $$
declare visible_contacts integer;
begin
  select count(*) into visible_contacts from public.contacts;
  if visible_contacts <> 0 then raise exception 'Non-member unexpectedly saw % contacts', visible_contacts; end if;
end;
$$;

reset role;
