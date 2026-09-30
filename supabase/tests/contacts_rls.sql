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
end;
$$;

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

do $$
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
