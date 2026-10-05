begin;

insert into auth.users (id) values
  ('05000000-0000-0000-0000-000000000001'),
  ('05000000-0000-0000-0000-000000000002'),
  ('05000000-0000-0000-0000-000000000003'),
  ('05000000-0000-0000-0000-000000000004'),
  ('05000000-0000-0000-0000-000000000005');
insert into public.organizations (id, name) values
  ('05000000-0000-0000-0000-000000000010', 'Organization profile test'),
  ('05000000-0000-0000-0000-000000000011', 'Other tenant');
insert into public.organization_memberships (organization_id, user_id, role) values
  ('05000000-0000-0000-0000-000000000010', '05000000-0000-0000-0000-000000000001', 'owner'),
  ('05000000-0000-0000-0000-000000000010', '05000000-0000-0000-0000-000000000002', 'admin'),
  ('05000000-0000-0000-0000-000000000010', '05000000-0000-0000-0000-000000000003', 'editor'),
  ('05000000-0000-0000-0000-000000000010', '05000000-0000-0000-0000-000000000004', 'viewer');
grant usage on schema public, auth to authenticated;
grant select on public.organizations, public.organization_memberships to authenticated;
grant execute on function auth.uid() to authenticated;

set local role authenticated;
do $$
declare
  user_index integer;
  affected_rows integer;
begin
  perform set_config('request.jwt.claim.sub', '05000000-0000-0000-0000-000000000001', true);
  begin
    update public.organizations set id = '05000000-0000-0000-0000-000000000012'
      where id = '05000000-0000-0000-0000-000000000010';
    raise exception 'Organization identity could be changed through profile privileges';
  exception when insufficient_privilege then null;
  end;
  for user_index in 1..5 loop
    perform set_config('request.jwt.claim.sub', '05000000-0000-0000-0000-' || lpad(user_index::text, 12, '0'), true);
    update public.organizations set email = 'office@example.test', address = jsonb_set(address, '{postalCode}', '"01234"')
      where id = '05000000-0000-0000-0000-000000000010';
    get diagnostics affected_rows = row_count;
    if affected_rows <> (case when user_index <= 2 then 1 else 0 end) then
      raise exception 'Unexpected organization update authorization for user %', user_index;
    end if;
    update public.organizations set name = 'Cross-tenant edit' where id = '05000000-0000-0000-0000-000000000011';
    get diagnostics affected_rows = row_count;
    if affected_rows <> 0 then raise exception 'Cross-tenant organization update was allowed'; end if;
  end loop;
end;
$$;
reset role;

do $$
begin
  if (select address->>'postalCode' from public.organizations where id = '05000000-0000-0000-0000-000000000010') <> '01234' then
    raise exception 'Postal code leading zero was lost';
  end if;
end;
$$;
rollback;
